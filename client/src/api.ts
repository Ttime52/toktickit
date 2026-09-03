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
