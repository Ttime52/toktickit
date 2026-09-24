import { useEffect, useState } from "react";

import {
  ApiRequestError,
  fetchAdminTicketInspection,
  fetchInternalNotes,
  fetchPublicComments,
  type CurrentStatus,
  type InternalNote,
  type PublicComment,
  type TicketInspection,
  type UserRole,
} from "./api.js";

interface AdminTicketInspectionProps {
  ticketId: number;
  onBack: () => void;
}

type LoadState = "loading" | "success" | "error";
type CommunicationEntry = PublicComment | InternalNote;

function safeErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiRequestError) || error.message.length === 0) {
    return fallback;
  }

  return /\b(sql|select|insert|update|delete|password|secret|stack|trace|prisma|node_modules)\b/iu.test(
    error.message,
  )
    ? fallback
    : error.message;
}

function formatDate(value: string | null): string {
  if (value === null) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatPriority(value: string | null): string {
  return value === null ? "Not assigned" : value[0] + value.slice(1).toLowerCase();
}

function formatStatus(value: CurrentStatus): string {
  const labels: Record<CurrentStatus, string> = {
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

function roleLabel(value: UserRole): string {
  if (value === "IT_STAFF") return "IT Staff";
  if (value === "ADMINISTRATOR") return "Administrator";
  return "Requester";
}

function ReadOnlyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="zen-read-only-item">
      <dt>{label}</dt>
      <dd>
        <output>{value}</output>
      </dd>
    </div>
  );
}

function CommunicationFeed({
  entries,
  emptyLabel,
  ariaLabel,
}: {
  entries: CommunicationEntry[];
  emptyLabel: string;
  ariaLabel: string;
}) {
  if (entries.length === 0) {
    return <p className="zen-empty-state">{emptyLabel}</p>;
  }

  return (
    <ol className="zen-communication-feed" aria-label={ariaLabel}>
      {entries.map((entry) => (
        <li className="zen-communication-entry" key={entry.id}>
          <div className="zen-communication-meta">
            <strong>{entry.author.displayName}</strong>
            <span className={`zen-role-badge zen-role-${entry.author.role.toLowerCase()}`}>
              {roleLabel(entry.author.role)}
            </span>
            <time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>
          </div>
          <p>{entry.content}</p>
        </li>
      ))}
    </ol>
  );
}

function CommunicationRegion({
  kind,
  entries,
  state,
  error,
  onRetry,
}: {
  kind: "comments" | "notes";
  entries: CommunicationEntry[];
  state: LoadState;
  error: string | null;
  onRetry: () => void;
}) {
  const isNotes = kind === "notes";
  const title = isNotes ? "Internal Notes" : "Public Comments";
  const headingId = isNotes ? "admin-internal-notes-heading" : "admin-public-comments-heading";

  return (
    <section
      className={`zen-form-section ${isNotes ? "zen-internal-notes" : "zen-public-comments"}`}
      aria-labelledby={headingId}
    >
      <h2 id={headingId}>{title}</h2>
      <p className="zen-field-help">
        {isNotes
          ? "🔒 IT Staff/Administrator only — read-only operational context."
          : "Visible to the Requester, IT Staff and Administrator — read-only shared conversation."}
      </p>

      {state === "loading" && (
        <p className="zen-status" role="status" aria-live="polite">
          <span className="zen-spinner" aria-hidden="true" /> Loading {title}...
        </p>
      )}
      {state === "error" && (
        <div className="zen-callout zen-callout-error" role="alert">
          <p>{error ?? `Unable to load ${title}.`}</p>
          <button type="button" className="zen-button zen-button-secondary zen-small-button" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}
      {state === "success" && (
        <CommunicationFeed
          entries={entries}
          emptyLabel={isNotes ? "No Internal Notes yet." : "No Public Comments yet."}
          ariaLabel={`${title} history`}
        />
      )}
    </section>
  );
}

export default function AdminTicketInspection({
  ticketId,
  onBack,
}: AdminTicketInspectionProps) {
  const [ticket, setTicket] = useState<TicketInspection | null>(null);
  const [detailState, setDetailState] = useState<LoadState>("loading");
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailRetry, setDetailRetry] = useState(0);
  const [comments, setComments] = useState<PublicComment[]>([]);
  const [commentsState, setCommentsState] = useState<LoadState>("loading");
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentsRetry, setCommentsRetry] = useState(0);
  const [notes, setNotes] = useState<InternalNote[]>([]);
  const [notesState, setNotesState] = useState<LoadState>("loading");
  const [notesError, setNotesError] = useState<string | null>(null);
  const [notesRetry, setNotesRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setDetailState("loading");
    setDetailError(null);

    fetchAdminTicketInspection(ticketId, controller.signal)
      .then((loadedTicket) => {
        setTicket(loadedTicket);
        setDetailState("success");
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === "AbortError") return;
        setDetailState("error");
        setDetailError(safeErrorMessage(requestError, "Unable to load Ticket Inspection. Please try again."));
      });

    return () => controller.abort();
  }, [detailRetry, ticketId]);

  useEffect(() => {
    const controller = new AbortController();
    setCommentsState("loading");
    setCommentsError(null);

    fetchPublicComments(ticketId, controller.signal)
      .then((loadedComments) => {
        setComments(loadedComments);
        setCommentsState("success");
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === "AbortError") return;
        setCommentsState("error");
        setCommentsError(safeErrorMessage(requestError, "Unable to load Public Comments. Please try again."));
      });

    return () => controller.abort();
  }, [commentsRetry, ticketId]);

  useEffect(() => {
    const controller = new AbortController();
    setNotesState("loading");
    setNotesError(null);

    fetchInternalNotes(ticketId, controller.signal)
      .then((loadedNotes) => {
        setNotes(loadedNotes);
        setNotesState("success");
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === "AbortError") return;
        setNotesState("error");
        setNotesError(safeErrorMessage(requestError, "Unable to load Internal Notes. Please try again."));
      });

    return () => controller.abort();
  }, [notesRetry, ticketId]);

  return (
    <div className="zen-detail-page">
      <header className="zen-detail-heading">
        <button type="button" className="zen-button zen-button-secondary" onClick={onBack}>
          Back to User Management
        </button>
        <div>
          <p className="zen-eyebrow">Administrator read-only inspection</p>
          <h1>Ticket Inspection</h1>
          {ticket !== null && (
            <p className="zen-detail-ticket-number">
              {ticket.ticketNumber} <span className="zen-badge zen-badge-status">{formatStatus(ticket.currentStatus)}</span>
            </p>
          )}
        </div>
      </header>

      {detailState === "loading" && (
        <section className="zen-ticket-skeleton" aria-busy="true" aria-live="polite">
          <div className="zen-status" role="status">
            <span className="zen-spinner" aria-hidden="true" /> Loading Ticket Inspection...
          </div>
          <span /><span /><span /><span />
        </section>
      )}

      {detailState === "error" && (
        <section className="zen-callout zen-callout-error" role="alert">
          <p>{detailError ?? "Unable to load Ticket Inspection. Please try again."}</p>
          <div className="zen-action-row">
            <button type="button" className="zen-button zen-button-primary" onClick={() => setDetailRetry((value) => value + 1)}>
              Retry
            </button>
            <button type="button" className="zen-button zen-button-secondary" onClick={onBack}>
              Back to User Management
            </button>
          </div>
        </section>
      )}

      {detailState === "success" && ticket !== null && (
        <article className="zen-detail-card">
          <div className="zen-callout zen-callout-info" role="status">
            Read-only inspection. Work controls, comment/note composers and Attachment metadata are unavailable to Administrators.
          </div>

          <section className="zen-form-section" aria-labelledby="admin-ticket-information-heading">
            <h2 id="admin-ticket-information-heading">Ticket information</h2>
            <dl className="zen-read-only-grid zen-detail-read-only-grid">
              <ReadOnlyValue label="Ticket Number" value={ticket.ticketNumber} />
              <ReadOnlyValue label="Ticket Date" value={formatDate(ticket.ticketDate)} />
              <ReadOnlyValue label="Requester" value={ticket.requester.displayName} />
              <ReadOnlyValue label="Category" value={ticket.category.name} />
              <ReadOnlyValue label="Related System" value={ticket.relatedSystem.name} />
              <ReadOnlyValue label="Requested Priority" value={formatPriority(ticket.requestedPriority)} />
              <ReadOnlyValue label="IT Priority" value={formatPriority(ticket.itPriority)} />
              <ReadOnlyValue label="Current Status" value={formatStatus(ticket.currentStatus)} />
              <ReadOnlyValue label="Ticket Owner" value={ticket.ticketOwner?.displayName ?? "Unassigned"} />
              <ReadOnlyValue label="Assigned At" value={formatDate(ticket.assignedAt)} />
              <ReadOnlyValue label="Requester Resolution Indication" value={formatDate(ticket.requesterResolutionIndicatedAt)} />
            </dl>
            <div className="zen-detail-text-grid">
              <div className="zen-read-only-text">
                <h3>Summary</h3>
                <p>{ticket.summary}</p>
              </div>
              <div className="zen-read-only-text">
                <h3>Description</h3>
                <p>{ticket.description}</p>
              </div>
            </div>
          </section>

          <CommunicationRegion
            kind="comments"
            entries={comments}
            state={commentsState}
            error={commentsError}
            onRetry={() => setCommentsRetry((value) => value + 1)}
          />
          <CommunicationRegion
            kind="notes"
            entries={notes}
            state={notesState}
            error={notesError}
            onRetry={() => setNotesRetry((value) => value + 1)}
          />
        </article>
      )}
    </div>
  );
}
