const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export type UserRole = "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR";

export interface AuthUser {
  id: number;
  displayName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
}

export interface ManagedUser extends AuthUser {
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserQuery {
  search: string;
  role: UserRole | null;
}

export interface CreateAdminUserInput {
  displayName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  initialPassword: string;
}

export interface UpdateAdminUserInput {
  displayName?: string;
  email?: string;
  role?: UserRole;
  isActive?: boolean;
}

export interface Category {
  id: number;
  name: string;
}

export interface TicketRequester {
  id: number;
  displayName: string;
  email: string;
}

export interface TicketOwnerSummary {
  id: number;
  displayName: string;
  role: "IT_STAFF" | "ADMINISTRATOR";
}

export type RequestedPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type CurrentStatus =
  | "NEW"
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING_FOR_REQUESTER"
  | "RESOLVED"
  | "CLOSED"
  | "REOPENED"
  | "CANCELLED";

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
  requester: TicketRequester;
  category: Category;
  relatedSystem: RelatedSystem;
  summary: string;
  requestedPriority: RequestedPriority;
  itPriority: RequestedPriority | null;
  description: string;
  currentStatus: CurrentStatus;
  requesterResolutionIndicatedAt: string | null;
  attachments: TicketAttachment[];
  createdAt: string;
  updatedAt: string;
}

/**
 * The shared Ticket Detail response for Administrator inspection intentionally
 * omits the Attachment collection. Attachment metadata/bytes are not an
 * Administrator capability in Lab 3.
 */
export interface TicketInspection extends Omit<Ticket, "attachments"> {
  ticketOwner: TicketOwnerSummary | null;
  assignedTo: TicketOwnerSummary | null;
  assignedAt: string | null;
}

export type TicketSortField =
  | "ticketNumber"
  | "ticketDate"
  | "updatedAt"
  | "requestedPriority"
  | "currentStatus"
  | "category";

export type TicketSortOrder = "asc" | "desc";
export type TicketPageSize = 10 | 20 | 50;

export interface TicketListItem {
  id: number;
  ticketNumber: string;
  ticketDate: string;
  summary: string;
  category: Category;
  relatedSystem: RelatedSystem;
  requestedPriority: RequestedPriority;
  itPriority: RequestedPriority | null;
  currentStatus: CurrentStatus;
  attachmentCount: number;
  updatedAt: string;
}

export interface TicketListQuery {
  search: string;
  categoryId: number | null;
  relatedSystemId: number | null;
  requestedPriority: RequestedPriority | null;
  currentStatus: CurrentStatus | null;
  sortBy: TicketSortField;
  sortOrder: TicketSortOrder;
  page: number;
  pageSize: TicketPageSize;
}

export interface TicketListMeta {
  page: number;
  pageSize: TicketPageSize;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface TicketListResult {
  data: TicketListItem[];
  meta: TicketListMeta;
}

export type StaffAssignment = "all" | "assigned" | "unassigned" | "mine";
export type StaffSortField =
  | "ticketNumber"
  | "ticketDate"
  | "updatedAt"
  | "requestedPriority"
  | "itPriority"
  | "currentStatus"
  | "ticketOwner"
  | "assignee"
  | "category";

export interface StaffTicket {
  id: number;
  ticketNumber: string;
  ticketDate: string;
  summary: string;
  category: Category;
  relatedSystem: RelatedSystem;
  requester: TicketRequester;
  ticketOwner: { id: number; displayName: string; role: UserRole } | null;
  assignedTo: { id: number; displayName: string; role: UserRole } | null;
  requestedPriority: RequestedPriority;
  itPriority: RequestedPriority;
  currentStatus: CurrentStatus;
  requesterResolutionIndicatedAt: string | null;
  attachmentCount: number;
  updatedAt: string;
}

export interface StaffTicketQuery {
  search: string;
  categoryId: number | null;
  relatedSystemId: number | null;
  requestedPriority: RequestedPriority | null;
  itPriority: RequestedPriority | null;
  currentStatus: CurrentStatus | null;
  assignment: StaffAssignment;
  sortBy: StaffSortField;
  sortOrder: TicketSortOrder;
  page: number;
  pageSize: TicketPageSize;
}

export interface StaffTicketListResult {
  data: StaffTicket[];
  meta: TicketListMeta;
}

export interface InternalNote {
  id: number;
  ticketId: number;
  content: string;
  author: {
    id: number;
    displayName: string;
    role: UserRole;
  };
  createdAt: string;
}

export interface StaffUserOption {
  id: number;
  displayName: string;
  role: "IT_STAFF" | "ADMINISTRATOR";
}

export interface StaffTicketDetail extends StaffTicket {
  description: string;
  attachments: TicketAttachment[];
  publicComments: PublicComment[];
  internalNotes: InternalNote[];
  createdAt: string;
}

export type StaffTicketAction = "claim" | "assign" | "reassign";

export interface StaffTicketUpdateInput {
  action?: StaffTicketAction;
  assignedToUserId?: number;
  itPriority?: RequestedPriority;
  currentStatus?: CurrentStatus;
  confirmStatusChange?: boolean;
}

export interface PublicComment {
  id: number;
  ticketId: number;
  content: string;
  author: {
    id: number;
    displayName: string;
    role: UserRole;
  };
  createdAt: string;
}

export interface CreateTicketInput {
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

function withCredentials(init?: RequestInit): RequestInit {
  return { ...init, credentials: "include" };
}

export interface SystemStatus {
  online: boolean;
  categories: Category[];
}

export async function fetchCurrentUser(
  signal?: AbortSignal,
): Promise<AuthUser> {
  const response = await fetch(
    `${API_URL}/api/auth/me`,
    withCredentials(signal ? { signal } : undefined),
  );
  const body = await readApiBody(response);
  if (!response.ok) {
    throwApiResponseError(response, body, "Unable to load the current session.");
  }
  const user =
    typeof body.data === "object" && body.data !== null &&
    typeof (body.data as Record<string, unknown>).user === "object" &&
    (body.data as Record<string, unknown>).user !== null
      ? (body.data as { user: AuthUser }).user
      : null;
  if (user === null) {
    throw new ApiRequestError("Invalid authentication response.", response.status);
  }
  return user;
}

export async function login(
  email: string,
  password: string,
): Promise<AuthUser> {
  const response = await fetch(
    `${API_URL}/api/auth/login`,
    withCredentials({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
  const body = await readApiBody(response);
  if (!response.ok) {
    throwApiResponseError(response, body, "Unable to sign in.");
  }
  const data = body.data;
  const user =
    typeof data === "object" && data !== null &&
    typeof (data as Record<string, unknown>).user === "object" &&
    (data as Record<string, unknown>).user !== null
      ? (data as { user: AuthUser }).user
      : null;
  if (user === null) throw new ApiRequestError("Invalid sign-in response.", response.status);
  return user;
}

export async function logout(): Promise<void> {
  const response = await fetch(
    `${API_URL}/api/auth/logout`,
    withCredentials({ method: "POST" }),
  );
  const body = response.status === 204 ? {} : await readApiBody(response);
  if (!response.ok) {
    throwApiResponseError(response, body, "Unable to sign out.");
  }
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<AuthUser> {
  const response = await fetch(
    `${API_URL}/api/auth/change-password`,
    withCredentials({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  );
  const body = await readApiBody(response);
  if (!response.ok) {
    throwApiResponseError(response, body, "Unable to change password.");
  }
  const data = body.data;
  const user =
    typeof data === "object" && data !== null &&
    typeof (data as Record<string, unknown>).user === "object" &&
    (data as Record<string, unknown>).user !== null
      ? (data as { user: AuthUser }).user
      : null;
  if (user === null) throw new ApiRequestError("Invalid password response.", response.status);
  return user;
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
    ? await fetch(path, withCredentials({ signal }))
    : await fetch(path, withCredentials());

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
  const response = await fetch(`${API_URL}/api/tickets`, withCredentials({
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(input),
  }));
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

export async function fetchTickets(
  query: TicketListQuery,
  signal?: AbortSignal,
): Promise<TicketListResult> {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  });

  if (query.search.trim().length > 0) params.set("search", query.search.trim());
  if (query.categoryId !== null) params.set("categoryId", String(query.categoryId));
  if (query.relatedSystemId !== null) {
    params.set("relatedSystemId", String(query.relatedSystemId));
  }
  if (query.requestedPriority !== null) {
    params.set("requestedPriority", query.requestedPriority);
  }
  if (query.currentStatus !== null) params.set("currentStatus", query.currentStatus);

  const response = await fetch(`${API_URL}/api/tickets?${params.toString()}`, withCredentials(signal
    ? { signal }
    : undefined));
  const body = await readApiBody(response);

  if (!response.ok) {
    throwApiResponseError(response, body, "Unable to load My Tickets.");
  }

  if (
    !Array.isArray(body.data) ||
    typeof body.meta !== "object" ||
    body.meta === null
  ) {
    throw new ApiRequestError("Invalid My Tickets response.", response.status);
  }

  return {
    data: body.data as TicketListItem[],
    meta: body.meta as TicketListMeta,
  };
}

export async function fetchStaffTickets(
  query: StaffTicketQuery,
  signal?: AbortSignal,
): Promise<StaffTicketListResult> {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
    assignment: query.assignment,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  });
  if (query.search.trim().length > 0) params.set("search", query.search.trim());
  if (query.categoryId !== null) params.set("categoryId", String(query.categoryId));
  if (query.relatedSystemId !== null) {
    params.set("relatedSystemId", String(query.relatedSystemId));
  }
  if (query.requestedPriority !== null) {
    params.set("requestedPriority", query.requestedPriority);
  }
  if (query.itPriority !== null) params.set("itPriority", query.itPriority);
  if (query.currentStatus !== null) params.set("currentStatus", query.currentStatus);

  const response = await fetch(
    `${API_URL}/api/staff/tickets?${params.toString()}`,
    withCredentials(signal ? { signal } : undefined),
  );
  const body = await readApiBody(response);
  if (!response.ok) {
    throwApiResponseError(response, body, "Unable to load the Ticket Queue.");
  }
  if (!Array.isArray(body.data) || typeof body.meta !== "object" || body.meta === null) {
    throw new ApiRequestError("Invalid Ticket Queue response.", response.status);
  }
  return {
    data: body.data as StaffTicket[],
    meta: body.meta as TicketListMeta,
  };
}

export async function fetchStaffUsers(
  signal?: AbortSignal,
): Promise<StaffUserOption[]> {
  const response = await fetch(
    `${API_URL}/api/staff/users`,
    withCredentials(signal ? { signal } : undefined),
  );
  const body = await readApiBody(response);
  if (!response.ok) {
    throwApiResponseError(response, body, "Unable to load Ticket Owner options.");
  }
  if (!Array.isArray(body.data)) {
    throw new ApiRequestError("Invalid Ticket Owner response.", response.status);
  }
  return body.data as StaffUserOption[];
}

export async function fetchAdminUsers(
  query: AdminUserQuery,
  signal?: AbortSignal,
): Promise<ManagedUser[]> {
  const params = new URLSearchParams();
  if (query.search.trim().length > 0) params.set("search", query.search.trim());
  if (query.role !== null) params.set("role", query.role);

  const response = await fetch(
    `${API_URL}/api/users?${params.toString()}`,
    withCredentials(signal ? { signal } : undefined),
  );
  const body = await readApiBody(response);
  if (!response.ok) {
    throwApiResponseError(response, body, "Unable to load User Management.");
  }
  if (!Array.isArray(body.data)) {
    throw new ApiRequestError("Invalid User Management response.", response.status);
  }
  return body.data as ManagedUser[];
}

export async function createAdminUser(
  input: CreateAdminUserInput,
): Promise<ManagedUser> {
  const response = await fetch(
    `${API_URL}/api/users`,
    withCredentials({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  const body = await readApiBody(response);
  if (!response.ok) {
    throwApiResponseError(response, body, "Unable to create User.");
  }
  if (typeof body.data !== "object" || body.data === null) {
    throw new ApiRequestError("Invalid User creation response.", response.status);
  }
  return body.data as ManagedUser;
}

export async function updateAdminUser(
  userId: number,
  input: UpdateAdminUserInput,
): Promise<ManagedUser> {
  const response = await fetch(
    `${API_URL}/api/users/${userId}`,
    withCredentials({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  const body = await readApiBody(response);
  if (!response.ok) {
    throwApiResponseError(response, body, "Unable to update User.");
  }
  if (typeof body.data !== "object" || body.data === null) {
    throw new ApiRequestError("Invalid User update response.", response.status);
  }
  return body.data as ManagedUser;
}

export async function resetAdminUserPassword(
  userId: number,
  initialPassword: string,
): Promise<ManagedUser> {
  const response = await fetch(
    `${API_URL}/api/users/${userId}/reset-password`,
    withCredentials({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initialPassword }),
    }),
  );
  const body = await readApiBody(response);
  if (!response.ok) {
    throwApiResponseError(response, body, "Unable to reset the User password.");
  }
  if (typeof body.data !== "object" || body.data === null) {
    throw new ApiRequestError("Invalid User password response.", response.status);
  }
  return body.data as ManagedUser;
}

export async function fetchStaffTicket(
  ticketId: number,
  signal?: AbortSignal,
): Promise<StaffTicketDetail> {
  const response = await fetch(
    `${API_URL}/api/staff/tickets/${ticketId}`,
    withCredentials(signal ? { signal } : undefined),
  );
  const body = await readApiBody(response);
  if (!response.ok) {
    throwApiResponseError(response, body, "Unable to load Staff Ticket Detail.");
  }
  if (typeof body.data !== "object" || body.data === null) {
    throw new ApiRequestError("Invalid Staff Ticket Detail response.", response.status);
  }
  return body.data as StaffTicketDetail;
}

export async function updateStaffTicket(
  ticketId: number,
  input: StaffTicketUpdateInput,
): Promise<StaffTicketDetail> {
  const response = await fetch(
    `${API_URL}/api/staff/tickets/${ticketId}`,
    withCredentials({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  const body = await readApiBody(response);
  if (!response.ok) {
    throwApiResponseError(response, body, "Unable to update Ticket.");
  }
  if (typeof body.data !== "object" || body.data === null) {
    throw new ApiRequestError("Invalid Staff Ticket update response.", response.status);
  }
  return body.data as StaffTicketDetail;
}

export async function updateStaffTicketOwner(
  ticketId: number,
  input: Pick<StaffTicketUpdateInput, "action" | "assignedToUserId">,
): Promise<StaffTicketDetail> {
  const response = await fetch(
    `${API_URL}/api/staff/tickets/${ticketId}/owner`,
    withCredentials({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  const body = await readApiBody(response);
  if (!response.ok) {
    throwApiResponseError(response, body, "Unable to update Ticket Owner.");
  }
  if (typeof body.data !== "object" || body.data === null) {
    throw new ApiRequestError("Invalid Ticket Owner response.", response.status);
  }
  return body.data as StaffTicketDetail;
}

export async function fetchInternalNotes(
  ticketId: number,
  signal?: AbortSignal,
): Promise<InternalNote[]> {
  const response = await fetch(
    `${API_URL}/api/tickets/${ticketId}/internal-notes`,
    withCredentials(signal ? { signal } : undefined),
  );
  const body = await readApiBody(response);
  if (!response.ok) {
    throwApiResponseError(response, body, "Unable to load Internal Notes.");
  }
  if (!Array.isArray(body.data)) {
    throw new ApiRequestError("Invalid Internal Notes response.", response.status);
  }
  return body.data as InternalNote[];
}

export async function postInternalNote(
  ticketId: number,
  content: string,
): Promise<InternalNote> {
  const response = await fetch(
    `${API_URL}/api/tickets/${ticketId}/internal-notes`,
    withCredentials({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }),
  );
  const body = await readApiBody(response);
  if (!response.ok) {
    throwApiResponseError(response, body, "Unable to post Internal Note.");
  }
  if (typeof body.data !== "object" || body.data === null) {
    throw new ApiRequestError("Invalid Internal Note response.", response.status);
  }
  return body.data as InternalNote;
}

export async function fetchTicket(
  ticketId: number,
  signal?: AbortSignal,
): Promise<Ticket> {
  const response = await fetch(
    `${API_URL}/api/tickets/${ticketId}`,
    withCredentials(signal ? { signal } : undefined),
  );
  const body = await readApiBody(response);

  if (!response.ok) {
    throwApiResponseError(response, body, "Unable to load Ticket Detail.");
  }

  if (typeof body.data !== "object" || body.data === null) {
    throw new ApiRequestError("Invalid Ticket Detail response.", response.status);
  }

  return body.data as Ticket;
}

export async function fetchAdminTicketInspection(
  ticketId: number,
  signal?: AbortSignal,
): Promise<TicketInspection> {
  const response = await fetch(
    `${API_URL}/api/tickets/${ticketId}`,
    withCredentials(signal ? { signal } : undefined),
  );
  const body = await readApiBody(response);

  if (!response.ok) {
    throwApiResponseError(response, body, "Unable to load Administrator Ticket Inspection.");
  }
  if (typeof body.data !== "object" || body.data === null) {
    throw new ApiRequestError("Invalid Administrator Ticket Inspection response.", response.status);
  }

  return body.data as TicketInspection;
}

export async function fetchPublicComments(
  ticketId: number,
  signal?: AbortSignal,
): Promise<PublicComment[]> {
  const response = await fetch(
    `${API_URL}/api/tickets/${ticketId}/comments`,
    withCredentials(signal ? { signal } : undefined),
  );
  const body = await readApiBody(response);

  if (!response.ok) {
    throwApiResponseError(response, body, "Unable to load Public Comments.");
  }
  if (!Array.isArray(body.data)) {
    throw new ApiRequestError("Invalid Public Comments response.", response.status);
  }
  return body.data as PublicComment[];
}

export async function postPublicComment(
  ticketId: number,
  content: string,
): Promise<PublicComment> {
  const response = await fetch(
    `${API_URL}/api/tickets/${ticketId}/comments`,
    withCredentials({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }),
  );
  const body = await readApiBody(response);

  if (!response.ok) {
    throwApiResponseError(response, body, "Unable to post Public Comment.");
  }
  if (typeof body.data !== "object" || body.data === null) {
    throw new ApiRequestError("Invalid Public Comment response.", response.status);
  }
  return body.data as PublicComment;
}

export async function recordProblemAppearsResolved(ticketId: number): Promise<Ticket> {
  const response = await fetch(
    `${API_URL}/api/tickets/${ticketId}/problem-appears-resolved`,
    withCredentials({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    }),
  );
  const body = await readApiBody(response);

  if (!response.ok) {
    throwApiResponseError(
      response,
      body,
      "Unable to send the resolution indication.",
    );
  }
  if (typeof body.data !== "object" || body.data === null) {
    throw new ApiRequestError("Invalid resolution indication response.", response.status);
  }
  return body.data as Ticket;
}

export function getAttachmentDownloadUrl(
  ticketId: number,
  attachmentId: number,
): string {
  return `${API_URL}/api/tickets/${ticketId}/attachments/${attachmentId}/download`;
}

export function getAttachmentPreviewUrl(
  ticketId: number,
  attachmentId: number,
): string {
  return `${getAttachmentDownloadUrl(ticketId, attachmentId)}?disposition=inline`;
}

export async function uploadAttachment(
  ticketId: number,
  file: File,
): Promise<TicketAttachment> {
  const formData = new FormData();
  formData.append("file", file, file.name);

  const response = await fetch(
    `${API_URL}/api/tickets/${ticketId}/attachments`,
    withCredentials({
      method: "POST",
      body: formData,
    }),
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

export async function removeAttachment(
  ticketId: number,
  attachmentId: number,
  reason: string,
): Promise<TicketAttachment> {
  const response = await fetch(
    `${API_URL}/api/tickets/${ticketId}/attachments/${attachmentId}`,
    withCredentials({
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    }),
  );
  const body = await readApiBody(response);

  if (!response.ok) {
    throwApiResponseError(response, body, "Unable to remove Attachment.");
  }

  if (typeof body.data !== "object" || body.data === null) {
    throw new ApiRequestError("Invalid Attachment removal response.", response.status);
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
  
  const healthRes = await fetch(`${API_URL}/api/health`, withCredentials());
  if (!healthRes.ok) throw new Error("Backend health check failed");
  
  const catRes = await fetch(`${API_URL}/api/categories`, withCredentials());
  if (!catRes.ok) throw new Error("Failed to load categories");
  const categories: Category[] = await catRes.json();

  return { online: true, categories };
  
}
