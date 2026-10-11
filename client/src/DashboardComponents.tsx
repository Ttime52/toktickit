import type {
  AdministratorDashboard,
  DashboardDrillDown,
  DashboardMetric,
  DashboardStatusMetric,
  DashboardItPriorityMetric,
  DashboardTicketPreview,
  StaffDashboard,
} from "./api.js";

export function drillDownHref(drillDown: DashboardDrillDown): string {
  const params = new URLSearchParams(drillDown.query);
  const query = params.toString();
  return query.length === 0 ? drillDown.path : `${drillDown.path}?${query}`;
}

export function DashboardMetricCard({
  label,
  metric,
  period,
  zeroMessage,
  onNavigate,
  accent = false,
}: {
  label: string;
  metric: DashboardMetric;
  period?: string;
  zeroMessage: string;
  onNavigate: (path: string) => void;
  accent?: boolean;
}) {
  const href = drillDownHref(metric.drillDown);
  return (
    <article className={`zen-dashboard-metric${accent ? " is-accent" : ""}`}>
      <h2>{label}</h2>
      <output className="zen-dashboard-metric-value" aria-label={`${label}: ${metric.value}`}>
        {metric.value}
      </output>
      {period !== undefined && <p className="zen-dashboard-period">{period}</p>}
      <p className="zen-dashboard-zero-message">
        {metric.value === 0 ? zeroMessage : "Current value from the Dashboard service."}
      </p>
      <a
        className="zen-dashboard-details-link"
        href={href}
        onClick={(event) => {
          event.preventDefault();
          onNavigate(href);
        }}
      >
        View {label}
      </a>
    </article>
  );
}

export function DashboardLoading({ label }: { label: string }) {
  return (
    <section className="zen-dashboard-loading" aria-busy="true" aria-live="polite">
      <div className="zen-status" role="status">
        <span className="zen-spinner" aria-hidden="true" /> Loading {label}...
      </div>
      <div className="zen-dashboard-metric-grid" aria-hidden="true">
        {[1, 2, 3, 4].map((value) => (
          <div className="zen-dashboard-metric zen-dashboard-metric-skeleton" key={value}>
            <span /><span /><span /><span />
          </div>
        ))}
      </div>
    </section>
  );
}

export function DashboardFailure({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <section className="zen-callout zen-callout-error" role="alert">
      <p>{message}</p>
      <button type="button" className="zen-button zen-button-secondary" onClick={onRetry}>
        Retry
      </button>
    </section>
  );
}

export function DashboardForbidden({ label }: { label: string }) {
  return (
    <section className="zen-empty-panel" role="alert" aria-labelledby="dashboard-forbidden-title">
      <p className="zen-eyebrow">Access restricted</p>
      <h1 id="dashboard-forbidden-title">You cannot view {label}</h1>
      <p>Your account is not permitted to access this Dashboard.</p>
    </section>
  );
}

export function formatDashboardStatus(value: DashboardStatusMetric["status"]): string {
  const labels: Record<DashboardStatusMetric["status"], string> = {
    NEW: "New",
    OPEN: "Open",
    IN_PROGRESS: "In Progress",
    WAITING_FOR_REQUESTER: "Waiting for Requester",
    RESOLVED: "Resolved",
    CLOSED: "Closed",
    REOPENED: "Reopened",
    CANCELLED: "Cancelled",
  };
  return labels[value];
}

export function formatDashboardPriority(value: DashboardItPriorityMetric["itPriority"]): string {
  return value[0] + value.slice(1).toLowerCase();
}

export function formatDashboardDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function BucketRows({
  statuses,
  priorities,
  onNavigate,
}: {
  statuses: DashboardStatusMetric[];
  priorities: DashboardItPriorityMetric[];
  onNavigate: (path: string) => void;
}) {
  return (
    <div className="zen-dashboard-groups">
      <section className="zen-dashboard-group zen-card" aria-labelledby="dashboard-status-group-title">
        <h2 id="dashboard-status-group-title">Tickets by Status</h2>
        <ul className="zen-dashboard-bucket-list">
          {statuses.map((bucket) => {
            const href = drillDownHref(bucket.drillDown);
            return (
              <li key={bucket.status}>
                <span>{formatDashboardStatus(bucket.status)}</span>
                <strong>{bucket.value}</strong>
                <a
                  href={href}
                  onClick={(event) => {
                    event.preventDefault();
                    onNavigate(href);
                  }}
                >
                  View
                </a>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="zen-dashboard-group zen-card" aria-labelledby="dashboard-priority-group-title">
        <h2 id="dashboard-priority-group-title">Tickets by IT Priority</h2>
        <ul className="zen-dashboard-bucket-list">
          {priorities.map((bucket) => {
            const href = drillDownHref(bucket.drillDown);
            return (
              <li key={bucket.itPriority}>
                <span>{formatDashboardPriority(bucket.itPriority)}</span>
                <strong>{bucket.value}</strong>
                <a
                  href={href}
                  onClick={(event) => {
                    event.preventDefault();
                    onNavigate(href);
                  }}
                >
                  View
                </a>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function PreviewList({
  title,
  emptyMessage,
  tickets,
  pathPrefix,
  onNavigate,
}: {
  title: string;
  emptyMessage: string;
  tickets: DashboardTicketPreview[];
  pathPrefix: "/staff/tickets" | "/tickets";
  onNavigate: (path: string) => void;
}) {
  return (
    <section className="zen-dashboard-preview zen-card" aria-labelledby={`${title.toLowerCase().replaceAll(" ", "-")}-title`}>
      <h2 id={`${title.toLowerCase().replaceAll(" ", "-")}-title`}>{title}</h2>
      {tickets.length === 0 ? (
        <p className="zen-dashboard-empty-row">{emptyMessage}</p>
      ) : (
        <ul className="zen-dashboard-preview-list">
          {tickets.map((ticket) => {
            const href = `${pathPrefix}/${ticket.id}`;
            return (
              <li key={ticket.id}>
                <div className="zen-dashboard-preview-copy">
                  <strong className="zen-ticket-number">{ticket.ticketNumber}</strong>
                  <span>{ticket.summary}</span>
                  <span className="zen-dashboard-preview-meta">
                    <span className="zen-badge zen-badge-status">{formatDashboardStatus(ticket.currentStatus)}</span>
                    <span className="zen-badge zen-badge-priority">{formatDashboardPriority(ticket.itPriority)}</span>
                    <span>{ticket.ticketOwner?.displayName ?? "Unassigned"}</span>
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
  );
}

export function OperationalDashboardContent({
  dashboard,
  onNavigate,
  administrator = false,
}: {
  dashboard: StaffDashboard | AdministratorDashboard;
  onNavigate: (path: string) => void;
  administrator?: boolean;
}) {
  const { metrics } = dashboard;
  const period = "Asia/Bangkok · last 7 calendar days";
  const accountMetrics = administrator
    ? (dashboard as AdministratorDashboard).metrics
    : null;
  const recentStaffTicketsHref = drillDownHref({
    path: "/staff/tickets",
    query: {
      updatedWithin: "7d",
      windowStart: dashboard.window.start,
      windowEnd: dashboard.window.end,
    },
  });
  const noOperationalData =
    metrics.unassignedActiveCount.value === 0 &&
    metrics.myAssignedActiveCount.value === 0 &&
    metrics.urgentActiveCount.value === 0 &&
    metrics.recentlyUpdatedCount.value === 0 &&
    metrics.ticketsByStatus.every((bucket) => bucket.value === 0) &&
    metrics.ticketsByItPriority.every((bucket) => bucket.value === 0) &&
    dashboard.recentTickets.length === 0 &&
    dashboard.urgentTickets.length === 0;

  return (
    <div className="zen-dashboard-page">
      <header className="zen-dashboard-heading">
        <div>
          <p className="zen-eyebrow">{administrator ? "Administrator workspace" : "IT Staff workspace"}</p>
          <h1>{administrator ? "Administrator Dashboard" : "IT Staff Dashboard"}</h1>
          <p className="zen-lead">
            {administrator
              ? "Read-only operational aggregates and account health for this tenant."
              : "Your operational starting point for the Ticket queue."}
          </p>
        </div>
        <span className="zen-dashboard-report-time">As of {formatDashboardDate(dashboard.asOf)} · {dashboard.reportTimeZone}</span>
      </header>

      <nav className="zen-dashboard-quick-actions" aria-label="Quick Actions">
        <strong>Quick Actions</strong>
        <a className="zen-button zen-button-secondary" href={administrator ? "/admin/tickets" : "/staff/tickets"} onClick={(event) => { event.preventDefault(); onNavigate(administrator ? "/admin/tickets" : "/staff/tickets"); }}>
          {administrator ? "Search Tickets" : "My Queue"}
        </a>
        <a className="zen-button zen-button-secondary" href={administrator ? "/admin/users" : recentStaffTicketsHref} onClick={(event) => { event.preventDefault(); onNavigate(administrator ? "/admin/users" : recentStaffTicketsHref); }}>
          {administrator ? "User Management" : "Search"}
        </a>
      </nav>

      {noOperationalData && (
        <div className="zen-callout zen-callout-info" role="status">
          No operational data exists yet. Dashboard cards will populate as Tickets enter the workflow.
        </div>
      )}

      <section className="zen-dashboard-metric-grid" aria-label="Dashboard metrics">
        <DashboardMetricCard
          label="Unassigned active Tickets"
          metric={metrics.unassignedActiveCount}
          period={period}
          zeroMessage="Queue is fully assigned."
          onNavigate={onNavigate}
        />
        <DashboardMetricCard
          label="My active Tickets"
          metric={metrics.myAssignedActiveCount}
          period={period}
          zeroMessage="No active Tickets assigned to you."
          onNavigate={onNavigate}
        />
        <DashboardMetricCard
          label="Urgent active Tickets"
          metric={metrics.urgentActiveCount}
          period={period}
          zeroMessage="No urgent active Tickets."
          onNavigate={onNavigate}
          accent
        />
        <DashboardMetricCard
          label="Recently updated Tickets"
          metric={metrics.recentlyUpdatedCount}
          period={period}
          zeroMessage="No recent Ticket updates."
          onNavigate={onNavigate}
        />
      </section>

      {administrator && accountMetrics !== null && (
        <section className="zen-dashboard-metric-grid zen-dashboard-account-grid" aria-label="User account metrics">
          <DashboardMetricCard
            label="Active Users"
            metric={accountMetrics.activeUserCount}
            zeroMessage="There are no active Users."
            onNavigate={onNavigate}
          />
          <DashboardMetricCard
            label="Inactive Users"
            metric={accountMetrics.inactiveUserCount}
            zeroMessage="There are no inactive Users."
            onNavigate={onNavigate}
          />
        </section>
      )}

      <BucketRows
        statuses={metrics.ticketsByStatus}
        priorities={metrics.ticketsByItPriority}
        onNavigate={onNavigate}
      />

      <div className="zen-dashboard-preview-grid">
        <PreviewList
          title={administrator ? "Urgent work" : "Urgent work"}
          emptyMessage="No urgent work."
          tickets={dashboard.urgentTickets}
          pathPrefix={administrator ? "/tickets" : "/staff/tickets"}
          onNavigate={onNavigate}
        />
        <PreviewList
          title="Recent updates"
          emptyMessage="No recent updates."
          tickets={dashboard.recentTickets}
          pathPrefix={administrator ? "/tickets" : "/staff/tickets"}
          onNavigate={onNavigate}
        />
      </div>
    </div>
  );
}

