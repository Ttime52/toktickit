const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface Category {
  id: number;
  name: string;
}

export interface DevelopmentRequester {
  id: number;
  displayName: string;
  email: string;
}

export type RequestedPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface RelatedSystem {
  id: number;
  name: string;
}

export interface TicketAttachment {
  id: number;
  ticketId: number;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  state: "active" | "removed" | "unavailable";
  removedAt: string | null;
  unavailableAt: string | null;
  unavailableReason: string | null;
  removalReason: string | null;
  previewable: boolean;
  downloadUrl: string | null;
}

export interface Ticket {
  id: number;
  ticketNumber: string;
  ticketDate: string;
  requester: DevelopmentRequester;
  category: Category;
  relatedSystem: RelatedSystem;
  summary: string;
  requestedPriority: RequestedPriority;
  itPriority: RequestedPriority | null;
  description: string;
  currentStatus: "NEW";
  attachments: TicketAttachment[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTicketInput {
  requesterId: number;
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  requestedPriority?: RequestedPriority;
  description: string;
}

export interface CreateTicketResult {
  ticket: Ticket;
  idempotentReplay: boolean;
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;

  constructor(
    message: string,
    status = 0,
    code = "API_ERROR",
    fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export interface SystemStatus {
  online: boolean;
  categories: Category[];
}

const REQUESTER_API_PATH = `${API_URL}/api/development-requesters?active=true`;

export async function fetchDevelopmentRequesters(
  signal?: AbortSignal,
): Promise<DevelopmentRequester[]> {
  const response = signal
    ? await fetch(REQUESTER_API_PATH, { signal })
    : await fetch(REQUESTER_API_PATH);

  if (!response.ok) {
    throw new Error("Unable to load Development Requesters");
  }

  const body: unknown = await response.json();
  if (!Array.isArray(body)) {
    throw new Error("Invalid Development Requester response");
  }

  return body.filter(isDevelopmentRequester);
}

function isDevelopmentRequester(value: unknown): value is DevelopmentRequester {
  if (typeof value !== "object" || value === null) return false;

  const requester = value as Record<string, unknown>;
  return (
    Number.isInteger(requester.id) &&
    typeof requester.displayName === "string" &&
    typeof requester.email === "string" &&
    (requester.isActive === undefined || requester.isActive === true)
  );
}

function isReference(value: unknown): value is Category | RelatedSystem {
  if (typeof value !== "object" || value === null) return false;
  const reference = value as Record<string, unknown>;
  return (
    Number.isInteger(reference.id) &&
    typeof reference.name === "string" &&
    (reference.isActive === undefined || reference.isActive === true)
  );
}

async function fetchReferenceList<T extends Category | RelatedSystem>(
  path: string,
  label: string,
  signal?: AbortSignal,
): Promise<T[]> {
  const response = signal
    ? await fetch(path, { signal })
    : await fetch(path);

  if (!response.ok) {
    throw new ApiRequestError(`Unable to load ${label}.`, response.status);
  }

  const body: unknown = await response.json();
  if (!Array.isArray(body)) {
    throw new ApiRequestError(`Invalid ${label} response.`);
  }

  return body.filter(isReference) as T[];
}

export function fetchCategories(signal?: AbortSignal): Promise<Category[]> {
  return fetchReferenceList<Category>(
    `${API_URL}/api/categories?active=true`,
    "Categories",
    signal,
  );
}

export function fetchRelatedSystems(
  signal?: AbortSignal,
): Promise<RelatedSystem[]> {
  return fetchReferenceList<RelatedSystem>(
    `${API_URL}/api/related-systems?active=true`,
    "Related Systems",
    signal,
  );
}

async function readApiBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await response.json();
    return typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function throwApiResponseError(
  response: Response,
  body: Record<string, unknown>,
  fallbackMessage: string,
): never {
  const errorBody = body.error;
  const error =
    typeof errorBody === "object" && errorBody !== null
      ? (errorBody as Record<string, unknown>)
      : {};
  const fields =
    typeof error.fields === "object" && error.fields !== null
      ? Object.fromEntries(
          Object.entries(error.fields).filter(
            ([, value]) => typeof value === "string",
          ),
        )
      : {};

  throw new ApiRequestError(
    typeof error.message === "string" ? error.message : fallbackMessage,
    response.status,
    typeof error.code === "string" ? error.code : "API_ERROR",
    fields,
  );
}

export async function createTicket(
  input: CreateTicketInput,
  idempotencyKey: string,
): Promise<CreateTicketResult> {
  const response = await fetch(`${API_URL}/api/tickets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(input),
  });
  const body = await readApiBody(response);

  if (!response.ok) {
    throwApiResponseError(response, body, "Unable to create Ticket.");
  }

  if (typeof body.data !== "object" || body.data === null) {
    throw new ApiRequestError("Invalid Ticket response.", response.status);
  }

  const meta =
    typeof body.meta === "object" && body.meta !== null
      ? (body.meta as Record<string, unknown>)
      : {};
  return {
    ticket: body.data as Ticket,
    idempotentReplay: meta.idempotentReplay === true,
  };
}

export async function uploadAttachment(
  ticketId: number,
  requesterId: number,
  file: File,
): Promise<TicketAttachment> {
  const formData = new FormData();
  formData.append("file", file, file.name);

  const response = await fetch(
    `${API_URL}/api/tickets/${ticketId}/attachments?requesterId=${requesterId}`,
    {
      method: "POST",
      body: formData,
    },
  );
  const body = await readApiBody(response);

  if (!response.ok) {
    throwApiResponseError(response, body, "Unable to upload Attachment.");
  }

  if (typeof body.data !== "object" || body.data === null) {
    throw new ApiRequestError("Invalid Attachment response.", response.status);
  }

  return body.data as TicketAttachment;
}

// Issue 2 + Issue 4 — call the backend.
// Steps: fetch `${API_URL}/api/health`; if not ok, throw.
//        then fetch `${API_URL}/api/categories`; if not ok, throw.
//        return { online: true, categories }.
// Throwing on failure lets the UI show a single Offline/error state.
export async function checkSystem(): Promise<SystemStatus> {
  // TODO(Issue 2 & 4): implement the two fetch calls described above.
  // throw new Error("checkSystem not implemented yet");
  
  const healthRes = await fetch(`${API_URL}/api/health`);
  if (!healthRes.ok) throw new Error("Backend health check failed");
  
  const catRes = await fetch(`${API_URL}/api/categories`);
  if (!catRes.ok) throw new Error("Failed to load categories");
  const categories: Category[] = await catRes.json();

  return { online: true, categories };
  
}
