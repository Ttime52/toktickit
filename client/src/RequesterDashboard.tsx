import { useEffect, useState } from "react";

import {
  ApiRequestError,
  fetchRequesterDashboard,
  type RequesterDashboard as RequesterDashboardData,
} from "./api.js";
import {
  DashboardFailure,
  DashboardForbidden,
  DashboardLoading,
  DashboardMetricCard,
  drillDownHref,
  formatDashboardDate,
  formatDashboardPriority,
  formatDashboardStatus,
} from "./DashboardComponents.js";

interface RequesterDashboardProps {
  onNavigate: (path: string) => void;
}

function safeError(error: unknown): string {
  if (!(error instanceof ApiRequestError) || error.message.length === 0) {
    return "Unable to load My Dashboard. Please try again.";
  }
  return /\b(sql|select|insert|update|delete|password|secret|stack|trace|prisma|node_modules)\b/iu.test(
    error.message,
  )
    ? "Unable to load My Dashboard. Please try again."
    : error.message;
}

export default function RequesterDashboard({ onNavigate }: RequesterDashboardProps) {
  const [dashboard, setDashboard] = useState<RequesterDashboardData | null>(null);
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    setError(null);
    fetchRequesterDashboard(controller.signal)
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

  if (state === "loading") return <DashboardLoading label="My Dashboard" />;
  if (state === "error") {
    if (error instanceof ApiRequestError && error.status === 403) {
      return <DashboardForbidden label="My Dashboard" />;
    }
    return <DashboardFailure message={safeError(error)} onRetry={() => setRetry((value) => value + 1)} />;
  }
  if (dashboard === null) return null;

  const period = "Asia/Bangkok · last 7 calendar days";
  const metrics = dashboard.metrics;
  const noTicketsYet =
    metrics.openTicketCount.value === 0 &&
    metrics.waitingForRequesterCount.value === 0 &&
    metrics.recentlyUpdatedTicketCount.value === 0 &&
    metrics.recentlyResolvedTicketCount.value === 0 &&
    metrics.resolutionIndicationCount.value === 0 &&
    dashboard.recentTickets.length === 0;

  return (
    <div className="zen-dashboard-page">
      <header className="zen-dashboard-heading">
        <div>
          <p className="zen-eyebrow">Requester workspace</p>
          <h1>My Dashboard</h1>
          <p className="zen-lead">A concise view of Tickets submitted from your authenticated account.</p>
        </div>
        <span className="zen-dashboard-report-time">As of {formatDashboardDate(dashboard.asOf)} · {dashboard.reportTimeZone}</span>
      </header>

      <nav className="zen-dashboard-quick-actions" aria-label="Quick Actions">
        <strong>Quick Actions</strong>
        <a className="zen-button zen-button-primary" href="/create-ticket" onClick={(event) => { event.preventDefault(); onNavigate("/create-ticket"); }}>
          Create Ticket
        </a>
        <a className="zen-button zen-button-secondary" href="/my-tickets" onClick={(event) => { event.preventDefault(); onNavigate("/my-tickets"); }}>
          Search Tickets
        </a>
        <a className="zen-button zen-button-secondary" href="/my-tickets" onClick={(event) => { event.preventDefault(); onNavigate("/my-tickets"); }}>
          My Tickets
        </a>
      </nav>

      <section className="zen-dashboard-metric-grid" aria-label="My Ticket metrics">
        <DashboardMetricCard
          label="Open Tickets"
          metric={metrics.openTicketCount}
          period={period}
          zeroMessage="No open Tickets."
          onNavigate={onNavigate}
        />
        <DashboardMetricCard
          label="Waiting for Requester"
          metric={metrics.waitingForRequesterCount}
          period={period}
          zeroMessage="Nothing waiting for your reply."
          onNavigate={onNavigate}
        />
        <DashboardMetricCard
          label="Recently updated"
          metric={metrics.recentlyUpdatedTicketCount}
          period={period}
          zeroMessage="No recent Ticket updates."
          onNavigate={onNavigate}
        />
        <DashboardMetricCard
          label="Recently resolved"
          metric={metrics.recentlyResolvedTicketCount}
          period={period}
          zeroMessage="No Tickets resolved in this period."
          onNavigate={onNavigate}
        />
      </section>

      {metrics.resolutionIndicationCount.value > 0 && (
        <section className="zen-dashboard-attention zen-callout zen-callout-warning" aria-labelledby="resolution-indication-title">
          <h2 id="resolution-indication-title">Problem Appears Resolved</h2>
          <p>
            {metrics.resolutionIndicationCount.value} Ticket indication{metrics.resolutionIndicationCount.value === 1 ? "" : "s"} is awaiting formal IT Staff review. This advisory does not change the Ticket status.
          </p>
          <a
            href={drillDownHref(metrics.resolutionIndicationCount.drillDown)}
            onClick={(event) => {
              event.preventDefault();
              onNavigate(drillDownHref(metrics.resolutionIndicationCount.drillDown));
            }}
          >
            View indicated Tickets
          </a>
        </section>
      )}

      <section className="zen-dashboard-preview zen-card" aria-labelledby="my-recent-tickets-title">
        <div className="zen-dashboard-section-heading">
          <div>
            <h2 id="my-recent-tickets-title">My Recent Tickets</h2>
            <p>Up to five owned Tickets updated during the reported period.</p>
          </div>
          <a className="zen-button zen-button-secondary" href="/my-tickets" onClick={(event) => { event.preventDefault(); onNavigate("/my-tickets"); }}>
            View My Tickets
          </a>
        </div>
        {dashboard.recentTickets.length === 0 ? (
          <p className="zen-dashboard-empty-row">
            {noTicketsYet ? "You have no Tickets yet." : "No Tickets match this period."}
          </p>
        ) : (
          <ul className="zen-dashboard-preview-list requester-preview-list">
            {dashboard.recentTickets.map((ticket) => {
              const href = `/tickets/${ticket.id}`;
              return (
                <li key={ticket.id}>
                  <div className="zen-dashboard-preview-copy">
                    <strong className="zen-ticket-number">{ticket.ticketNumber}</strong>
                    <span>{ticket.summary}</span>
                    <span className="zen-dashboard-preview-meta">
                      <span className="zen-badge zen-badge-status">{formatDashboardStatus(ticket.currentStatus)}</span>
                      <span className="zen-badge zen-badge-priority">Requested {formatDashboardPriority(ticket.requestedPriority)}</span>
                      {ticket.itPriority !== null && <span className="zen-badge zen-badge-priority">IT {formatDashboardPriority(ticket.itPriority)}</span>}
                      <time dateTime={ticket.updatedAt}>{formatDashboardDate(ticket.updatedAt)}</time>
                    </span>
                  </div>
                  <a
                    className="zen-button zen-button-secondary zen-small-button"
                    href={href}
                    onClick={(event) => {
                      event.preventDefault();
                      onNavigate(href);
                    }}
                  >
                    Open Ticket
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

