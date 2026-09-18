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
  ApiRequestError,
  changePassword as changePasswordRequest,
  fetchCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
  type AuthUser,
} from "./api.js";

export type AuthState = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  user: AuthUser | null;
  state: AuthState;
  errorMessage: string | null;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<AuthUser>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function safeAuthError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiRequestError) || error.message.length === 0) {
    return fallback;
  }
  return /\b(sql|select|insert|update|delete|password|secret|stack|trace|prisma|node_modules)\b/iu.test(
    error.message,
  )
    ? fallback
    : error.message;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [state, setState] = useState<AuthState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setState("loading");
    try {
      const currentUser = await fetchCurrentUser();
      setUser(currentUser);
      setState("authenticated");
      setErrorMessage(null);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        setUser(null);
        setState("unauthenticated");
        setErrorMessage(null);
        return;
      }
      setUser(null);
      setState("unauthenticated");
      setErrorMessage(safeAuthError(error, "Unable to restore your session."));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const authenticatedUser = await loginRequest(email, password);
    setUser(authenticatedUser);
    setState("authenticated");
    setErrorMessage(null);
    return authenticatedUser;
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      setUser(null);
      setState("unauthenticated");
      setErrorMessage(null);
    }
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const authenticatedUser = await changePasswordRequest(
        currentPassword,
        newPassword,
      );
      setUser(authenticatedUser);
      setState("authenticated");
      setErrorMessage(null);
      return authenticatedUser;
    },
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ user, state, errorMessage, login, logout, changePassword, refresh }),
    [user, state, errorMessage, login, logout, changePassword, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
