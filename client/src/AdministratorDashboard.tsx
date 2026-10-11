import { useEffect, useState } from "react";

import {
  ApiRequestError,
  fetchAdministratorDashboard,
  type AdministratorDashboard as AdministratorDashboardData,
} from "./api.js";
import {
  DashboardFailure,
  DashboardForbidden,
  DashboardLoading,
  OperationalDashboardContent,
} from "./DashboardComponents.js";

interface AdministratorDashboardProps {
  onNavigate: (path: string) => void;
}

function safeError(error: unknown): string {
  if (!(error instanceof ApiRequestError) || error.message.length === 0) {
    return "Unable to load the Administrator Dashboard. Please try again.";
  }
  return /\b(sql|select|insert|update|delete|password|secret|stack|trace|prisma|node_modules)\b/iu.test(
    error.message,
  )
    ? "Unable to load the Administrator Dashboard. Please try again."
    : error.message;
}

export default function AdministratorDashboard({ onNavigate }: AdministratorDashboardProps) {
  const [dashboard, setDashboard] = useState<AdministratorDashboardData | null>(null);
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    setError(null);
    fetchAdministratorDashboard(controller.signal)
      .then((result) => {
        setDashboard(result);
        setState("success");
      })
      .catch((nextError: unknown) => {
        if (nextError instanceof Error && nextError.name === "AbortError") return;
        setError(nextError);
        setState("error");
      });
    return () => controller.abort();
  }, [retry]);

  if (state === "loading") return <DashboardLoading label="the Administrator Dashboard" />;
  if (state === "error") {
    if (error instanceof ApiRequestError && error.status === 403) {
      return <DashboardForbidden label="the Administrator Dashboard" />;
    }
    return <DashboardFailure message={safeError(error)} onRetry={() => setRetry((value) => value + 1)} />;
  }
  if (dashboard === null) return null;
  return (
    <OperationalDashboardContent
      dashboard={dashboard}
      onNavigate={onNavigate}
      administrator
    />
  );
}

