import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import {
  fetchDevelopmentRequesters,
  type DevelopmentRequester,
} from "./api.js";

export const REQUESTER_STORAGE_KEY = "toktickit.lab2.requesterId";

export type RequesterLoadState =
  | "idle"
  | "loading"
  | "success"
  | "empty"
  | "error";

export interface RequesterContextValue {
  requesters: DevelopmentRequester[];
  selectedRequester: DevelopmentRequester | null;
  selectedRequesterId: number | null;
  loadState: RequesterLoadState;
  errorMessage: string | null;
  requesterRevision: number;
  refreshRequesters: () => Promise<void>;
  selectRequester: (requesterId: number) => boolean;
  clearRequester: () => void;
}

const RequesterContext = createContext<RequesterContextValue | undefined>(
  undefined,
);

// Browsers expose localStorage for this Lab 2-only context. The in-memory
// fallback keeps the selector usable on restricted origins and in jsdom where
// storage can be unavailable; it is never sent to the server.
let memoryRequesterId: string | null = null;

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    const storage = window.localStorage;
    return typeof storage.getItem === "function" &&
      typeof storage.setItem === "function" &&
      typeof storage.removeItem === "function"
      ? storage
      : null;
  } catch {
    return null;
  }
}

function readStoredRequesterId(): number | null {
  const storage = getBrowserStorage();
  const storedValue =
    storage === null ? memoryRequesterId : storage.getItem(REQUESTER_STORAGE_KEY);
  if (storedValue === null) return null;

  const requesterId = Number(storedValue);
  return Number.isInteger(requesterId) && requesterId > 0 ? requesterId : null;
}

function removeStoredRequesterId() {
  const storage = getBrowserStorage();
  if (storage === null) {
    memoryRequesterId = null;
  } else {
    storage.removeItem(REQUESTER_STORAGE_KEY);
  }
}

function storeRequesterId(requesterId: number) {
  const value = String(requesterId);
  const storage = getBrowserStorage();
  if (storage === null) {
    memoryRequesterId = value;
  } else {
    storage.setItem(REQUESTER_STORAGE_KEY, value);
  }
}

export function RequesterProvider({ children }: PropsWithChildren) {
  const [requesters, setRequesters] = useState<DevelopmentRequester[]>([]);
  const [loadState, setLoadState] = useState<RequesterLoadState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedRequesterId, setSelectedRequesterId] = useState<number | null>(
    readStoredRequesterId,
  );
  const [requesterRevision, setRequesterRevision] = useState(0);

  const loadRequesters = useCallback(async (signal?: AbortSignal) => {
    setLoadState("loading");
    setErrorMessage(null);

    try {
      const activeRequesters = await fetchDevelopmentRequesters(signal);
      setRequesters(activeRequesters);
      setLoadState(activeRequesters.length > 0 ? "success" : "empty");

      const storedRequesterId = readStoredRequesterId();
      const storedRequesterIsActive = activeRequesters.some(
        (requester) => requester.id === storedRequesterId,
      );

      if (storedRequesterId !== null && storedRequesterIsActive) {
        setSelectedRequesterId(storedRequesterId);
      } else {
        removeStoredRequesterId();
        setSelectedRequesterId(null);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;

      setLoadState("error");
      setErrorMessage(
        "Unable to load Development Requesters. Please try again.",
      );
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadRequesters(controller.signal);

    return () => controller.abort();
  }, [loadRequesters]);

  const refreshRequesters = useCallback(
    () => loadRequesters(),
    [loadRequesters],
  );

  const selectRequester = useCallback(
    (requesterId: number) => {
      const requester = requesters.find(
        (candidate) => candidate.id === requesterId,
      );

      if (requester === undefined) {
        removeStoredRequesterId();
        setSelectedRequesterId(null);
        return false;
      }

      storeRequesterId(requester.id);
      setSelectedRequesterId(requester.id);
      setRequesterRevision((revision) => revision + 1);
      return true;
    },
    [requesters],
  );

  const clearRequester = useCallback(() => {
    removeStoredRequesterId();
    setSelectedRequesterId(null);
    // Consumers key requester-scoped state by this revision. Changing or
    // clearing the context therefore drops in-memory results without touching
    // persisted Tickets.
    setRequesterRevision((revision) => revision + 1);
  }, []);

  const selectedRequester = useMemo(
    () =>
      requesters.find((requester) => requester.id === selectedRequesterId) ??
      null,
    [requesters, selectedRequesterId],
  );

  const value = useMemo<RequesterContextValue>(
    () => ({
      requesters,
      selectedRequester,
      selectedRequesterId,
      loadState,
      errorMessage,
      requesterRevision,
      refreshRequesters,
      selectRequester,
      clearRequester,
    }),
    [
      requesters,
      selectedRequester,
      selectedRequesterId,
      loadState,
      errorMessage,
      requesterRevision,
      refreshRequesters,
      selectRequester,
      clearRequester,
    ],
  );

  return (
    <RequesterContext.Provider value={value}>
      {children}
    </RequesterContext.Provider>
  );
}

export function useRequesterContext() {
  const context = useContext(RequesterContext);
  if (context === undefined) {
    throw new Error(
      "useRequesterContext must be used within a RequesterProvider",
    );
  }

  return context;
}
