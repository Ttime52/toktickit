import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  ApiRequestError,
  fetchStaffTicket,
  fetchStaffUsers,
  getAttachmentDownloadUrl,
  getAttachmentPreviewUrl,
  postInternalNote,
  postPublicComment,
  updateStaffTicket,
  updateStaffTicketOwner,
  type CurrentStatus,
  type InternalNote,
  type PublicComment,
  type RequestedPriority,
  type StaffTicketDetail as StaffTicketDetailData,
  type StaffUserOption,
  type TicketAttachment,
} from "./api.js";

interface StaffTicketDetailProps {
  ticketId: number;
  onBack: () => void;
}

type LoadState = "loading" | "success" | "error";

const PRIORITIES: RequestedPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const STATUS_TRANSITIONS: Record<CurrentStatus, CurrentStatus[]> = {
  NEW: ["OPEN", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "CANCELLED"],
  CANCELLED: ["REOPENED"],
};

function formatDate(value: string | null): string {
  if (value === null) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatPriority(value: RequestedPriority): string {
  return value[0] + value.slice(1).toLowerCase();
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

function roleLabel(role: PublicComment["author"]["role"]): string {
  if (role === "IT_STAFF") return "IT Staff";
  if (role === "ADMINISTRATOR") return "Administrator";
  return "Requester";
}

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

function isFormalStatus(status: CurrentStatus): boolean {
  return status === "RESOLVED" || status === "CLOSED";
}

function attachmentLabel(attachment: TicketAttachment): string {
  if (attachment.state === "removed") return "Removed";
  if (attachment.state === "unavailable") return "Unavailable";
  return "Active";
}

function CommunicationFeed({
  comments,
  notes,
  emptyLabel,
  ariaLabel,
}: {
  comments?: PublicComment[];
  notes?: InternalNote[];
  emptyLabel: string;
  ariaLabel: string;
}) {
  const entries = comments ?? notes ?? [];
  if (entries.length === 0) {
    return <p className="zen-empty-comments">{emptyLabel}</p>;
  }

  return (
    <ol className="zen-comment-feed" aria-label={ariaLabel}>
      {entries.map((entry) => (
        <li className="zen-comment-item" key={entry.id}>
          <div className="zen-comment-meta">
            <strong>{entry.author.displayName}</strong>
            <span className="zen-badge zen-badge-role">{roleLabel(entry.author.role)}</span>
            <time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>
          </div>
          <p>{entry.content}</p>
        </li>
      ))}
    </ol>
  );
}

export default function StaffTicketDetail({ ticketId, onBack }: StaffTicketDetailProps) {
  const [ticket, setTicket] = useState<StaffTicketDetailData | null>(null);
  const [detailState, setDetailState] = useState<LoadState>("loading");
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailRetry, setDetailRetry] = useState(0);
  const [ownerOptions, setOwnerOptions] = useState<StaffUserOption[]>([]);
  const [ownerState, setOwnerState] = useState<LoadState>("loading");
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const [ownerRetry, setOwnerRetry] = useState(0);
  const [selectedOwner, setSelectedOwner] = useState("");
  const [selectedPriority, setSelectedPriority] = useState<RequestedPriority | "">("");
  const [selectedStatus, setSelectedStatus] = useState<CurrentStatus | "">("");
  const [confirmStatusChange, setConfirmStatusChange] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [comments, setComments] = useState<PublicComment[]>([]);
  const [notes, setNotes] = useState<InternalNote[]>([]);
  const [commentContent, setCommentContent] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [communicationError, setCommunicationError] = useState<string | null>(null);
  const [postingCommunication, setPostingCommunication] = useState<"comment" | "note" | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setDetailState("loading");
    setDetailError(null);
    fetchStaffTicket(ticketId, controller.signal)
      .then((loaded) => {
        setTicket(loaded);
        setComments(loaded.publicComments);
        setNotes(loaded.internalNotes);
        setDetailState("success");
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setDetailState("error");
        setDetailError(safeErrorMessage(error, "Unable to load Staff Ticket Detail. Please try again."));
      });
    return () => controller.abort();
  }, [ticketId, detailRetry]);

  useEffect(() => {
    const controller = new AbortController();
    setOwnerState("loading");
    setOwnerError(null);
    fetchStaffUsers(controller.signal)
      .then((users) => {
        setOwnerOptions(users);
        setOwnerState("success");
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setOwnerState("error");
        setOwnerError(safeErrorMessage(error, "Unable to load Ticket Owner options."));
      });
    return () => controller.abort();
  }, [ownerRetry]);

  useEffect(() => {
    if (ticket === null) return;
    setSelectedOwner(ticket.ticketOwner === null ? "" : String(ticket.ticketOwner.id));
    setSelectedPriority(ticket.itPriority);
    setSelectedStatus(ticket.currentStatus);
    setConfirmStatusChange(false);
  }, [ticket]);

  const availableStatuses = useMemo(() => {
    if (ticket === null) return [];
    return [ticket.currentStatus, ...STATUS_TRANSITIONS[ticket.currentStatus]];
  }, [ticket]);

  const ownerChanged =
    ticket !== null &&
    selectedOwner !== (ticket.ticketOwner === null ? "" : String(ticket.ticketOwner.id));
  const priorityChanged = ticket !== null && selectedPriority !== ticket.itPriority;
  const statusChanged = ticket !== null && selectedStatus !== ticket.currentStatus;
  const formalStatusNeedsConfirmation =
    statusChanged && selectedStatus !== "" && isFormalStatus(selectedStatus);
  const hasWorkChanges = ownerChanged || priorityChanged || statusChanged;

  async function saveWorkControls() {
    if (ticket === null || !hasWorkChanges || isSaving) return;
    if (formalStatusNeedsConfirmation && !confirmStatusChange) {
      setSaveError("Confirm the formal Resolved or Closed status change before saving.");
      return;
    }

    const input: Parameters<typeof updateStaffTicket>[1] = {};
    if (ownerChanged) {
      if (selectedOwner === "") {
        setSaveError("A Ticket cannot be unassigned from this screen.");
        return;
      }
      input.action = ticket.ticketOwner === null ? "assign" : "reassign";
      input.assignedToUserId = Number(selectedOwner);
    }
    if (priorityChanged && selectedPriority !== "") input.itPriority = selectedPriority;
    if (statusChanged && selectedStatus !== "") {
      input.currentStatus = selectedStatus;
      input.confirmStatusChange = formalStatusNeedsConfirmation && confirmStatusChange;
    }

    setIsSaving(true);
    setSaveError(null);
    try {
      const updated = await updateStaffTicket(ticketId, input);
      setTicket(updated);
      setSaveError(null);
    } catch (error: unknown) {
      setSaveError(safeErrorMessage(error, "Unable to update this Ticket. Please try again."));
    } finally {
      setIsSaving(false);
    }
  }

  async function claimTicket() {
    if (ticket === null || ticket.ticketOwner !== null || isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const updated = await updateStaffTicketOwner(ticketId, { action: "claim" });
      setTicket(updated);
    } catch (error: unknown) {
      setSaveError(safeErrorMessage(error, "Unable to claim this Ticket. Please try again."));
    } finally {
      setIsSaving(false);
    }
  }

  async function submitCommunication(
    event: FormEvent,
    kind: "comment" | "note",
  ) {
    event.preventDefault();
    const content = (kind === "comment" ? commentContent : noteContent).trim();
    if (content.length < 1 || content.length > 2000) {
      setCommunicationError(`${kind === "comment" ? "Public Comment" : "Internal Note"} must be 1 to 2,000 characters.`);
      return;
    }

    setPostingCommunication(kind);
    setCommunicationError(null);
    try {
      if (kind === "comment") {
        const created = await postPublicComment(ticketId, content);
        setComments((current) => [...current, created]);
        setCommentContent("");
      } else {
        const created = await postInternalNote(ticketId, content);
        setNotes((current) => [...current, created]);
        setNoteContent("");
      }
    } catch (error: unknown) {
      setCommunicationError(
        safeErrorMessage(
          error,
          `Unable to post this ${kind === "comment" ? "Public Comment" : "Internal Note"}. Please try again.`,
        ),
      );
    } finally {
      setPostingCommunication(null);
    }
  }

  function renderAttachment(attachment: TicketAttachment) {
    const active = attachment.state === "active";
    return (
      <li className={`zen-attachment-row zen-detail-attachment-row is-${attachment.state}`} key={attachment.id}>
        <div className="zen-attachment-details">
          <strong>{attachment.originalFilename}</strong>
          <span>{attachment.mimeType} · {attachment.sizeBytes} bytes</span>
          <span>Uploaded {formatDate(attachment.uploadedAt)}</span>
          {!active && <span>{attachmentLabel(attachment)}: {attachment.removalReason ?? attachment.unavailableReason ?? "Not available"}</span>}
        </div>
        <span className="zen-attachment-state">{attachmentLabel(attachment)}</span>
        {active ? (
          <div className="zen-detail-attachment-actions">
            <a className="zen-button zen-button-secondary zen-small-button" href={getAttachmentPreviewUrl(ticketId, attachment.id)} target="_blank" rel="noreferrer">Preview</a>
            <a className="zen-button zen-button-secondary zen-small-button" href={getAttachmentDownloadUrl(ticketId, attachment.id)} download={attachment.originalFilename}>Download</a>
          </div>
        ) : (
          <span className="zen-detail-attachment-blocked">Download unavailable</span>
        )}
      </li>
    );
  }

  if (detailState === "loading") {
    return (
      <section className="zen-ticket-skeleton" aria-busy="true" aria-live="polite">
        <div className="zen-status" role="status"><span className="zen-spinner" aria-hidden="true" /> Loading Staff Ticket Detail...</div>
        <span /><span /><span /><span />
      </section>
    );
  }

  if (detailState === "error" || ticket === null) {
    return (
      <section className="zen-callout zen-callout-error" role="alert">
        <p>{detailError ?? "Unable to load Staff Ticket Detail."}</p>
        <div className="zen-action-row">
          <button type="button" className="zen-button zen-button-primary" onClick={() => setDetailRetry((value) => value + 1)}>Retry</button>
          <button type="button" className="zen-button zen-button-secondary" onClick={onBack}>Back to Ticket Queue</button>
        </div>
      </section>
    );
  }

  return (
    <div className="zen-detail-page zen-staff-detail-page">
      <header className="zen-detail-heading">
        <button type="button" className="zen-button zen-button-secondary" onClick={onBack}>Back to Ticket Queue</button>
        <div>
          <p className="zen-eyebrow">IT Staff workspace</p>
          <h1>Ticket Detail</h1>
          <p className="zen-detail-ticket-number">{ticket.ticketNumber} <span className="zen-badge zen-badge-status">{formatStatus(ticket.currentStatus)}</span></p>
        </div>
      </header>

      <article className="zen-detail-card">
        <section className="zen-form-section" aria-labelledby="staff-ticket-information-heading">
          <h2 id="staff-ticket-information-heading">Ticket information</h2>
          <dl className="zen-read-only-grid zen-detail-read-only-grid">
            <div className="zen-read-only-item"><dt>Ticket Number</dt><dd><output>{ticket.ticketNumber}</output></dd></div>
            <div className="zen-read-only-item"><dt>Ticket Date</dt><dd><output>{formatDate(ticket.ticketDate)}</output></dd></div>
            <div className="zen-read-only-item"><dt>Requester</dt><dd><output>{ticket.requester.displayName}</output></dd></div>
            <div className="zen-read-only-item"><dt>Category</dt><dd><output>{ticket.category.name}</output></dd></div>
            <div className="zen-read-only-item"><dt>Related System</dt><dd><output>{ticket.relatedSystem.name}</output></dd></div>
            <div className="zen-read-only-item"><dt>Requested Priority</dt><dd><output><span className="zen-badge zen-badge-priority">{formatPriority(ticket.requestedPriority)}</span></output></dd></div>
            <div className="zen-read-only-item"><dt>Current IT Priority</dt><dd><output><span className="zen-badge zen-badge-priority">{formatPriority(ticket.itPriority)}</span></output></dd></div>
            <div className="zen-read-only-item"><dt>Current Status</dt><dd><output><span className="zen-badge zen-badge-status">{formatStatus(ticket.currentStatus)}</span></output></dd></div>
          </dl>
          <div className="zen-detail-text-grid">
            <div className="zen-read-only-text"><h3>Summary</h3><p>{ticket.summary}</p></div>
            <div className="zen-read-only-text"><h3>Description</h3><p>{ticket.description}</p></div>
          </div>
        </section>

        <section className="zen-form-section zen-staff-work-controls" aria-labelledby="staff-work-controls-heading">
          <h2 id="staff-work-controls-heading">Work controls</h2>
          <p className="zen-field-help">Requested Priority and Ticket core fields are read-only. Only the owner, IT Priority and permitted status transitions can be changed.</p>
          <div className="zen-form-grid">
            <div className="zen-list-field">
              <label htmlFor="staff-detail-owner">Ticket Owner</label>
              <select id="staff-detail-owner" value={selectedOwner} disabled={ownerState !== "success" || ownerOptions.length === 0 || isSaving} onChange={(event) => { setSelectedOwner(event.target.value); setSaveError(null); }}>
                {ticket.ticketOwner === null && <option value="">Unassigned</option>}
                {ownerOptions.map((owner) => <option value={owner.id} key={owner.id}>{owner.displayName} ({roleLabel(owner.role)})</option>)}
              </select>
              {ownerState === "loading" && <p className="zen-field-help" role="status">Loading owner options...</p>}
              {ownerState === "error" && <div className="zen-callout zen-callout-error" role="alert"><p>{ownerError}</p><button type="button" className="zen-button zen-button-secondary zen-small-button" onClick={() => setOwnerRetry((value) => value + 1)}>Retry</button></div>}
              {ownerState === "success" && ownerOptions.length === 0 && <p className="zen-field-error" role="alert">No active IT Staff or Administrator owners are available.</p>}
            </div>
            <div className="zen-list-field">
              <label htmlFor="staff-detail-it-priority">IT Priority</label>
              <select id="staff-detail-it-priority" value={selectedPriority} disabled={isSaving} onChange={(event) => { setSelectedPriority(event.target.value as RequestedPriority); setSaveError(null); }}>
                {PRIORITIES.map((priority) => <option value={priority} key={priority}>{formatPriority(priority)}</option>)}
              </select>
            </div>
            <div className="zen-list-field">
              <label htmlFor="staff-detail-status">Current Status</label>
              <select id="staff-detail-status" value={selectedStatus} disabled={isSaving} onChange={(event) => { setSelectedStatus(event.target.value as CurrentStatus); setConfirmStatusChange(false); setSaveError(null); }}>
                {availableStatuses.map((status) => <option value={status} key={status}>{formatStatus(status)}</option>)}
              </select>
            </div>
          </div>
          {formalStatusNeedsConfirmation && (
            <label className="zen-confirmation-check"><input type="checkbox" checked={confirmStatusChange} onChange={(event) => { setConfirmStatusChange(event.target.checked); setSaveError(null); }} /> I confirm this formal {formatStatus(selectedStatus as CurrentStatus)} transition.</label>
          )}
          {saveError !== null && <div className="zen-callout zen-callout-error" role="alert">{saveError}</div>}
          <div className="zen-action-row">
            {ticket.ticketOwner === null && <button type="button" className="zen-button zen-button-secondary" onClick={() => void claimTicket()} disabled={isSaving}>Claim Ticket</button>}
            <button type="button" className="zen-button zen-button-primary" onClick={() => void saveWorkControls()} disabled={isSaving || !hasWorkChanges || (formalStatusNeedsConfirmation && !confirmStatusChange)}>{isSaving ? "Saving..." : "Save Work Changes"}</button>
          </div>
        </section>

        {ticket.requesterResolutionIndicatedAt !== null && (
          <div className="zen-callout zen-callout-info" role="status">Requester indicated that the problem appears resolved on {formatDate(ticket.requesterResolutionIndicatedAt)}. This is not a formal status change.</div>
        )}

        <section className="zen-form-section zen-detail-attachments" aria-labelledby="staff-attachments-heading">
          <h2 id="staff-attachments-heading">Attachments</h2>
          <p className="zen-field-help">Attachment metadata is read-only for IT Staff. Active files may be previewed or downloaded.</p>
          {ticket.attachments.length === 0 ? <p className="zen-empty-files">No Attachments on this Ticket.</p> : <ul className="zen-attachment-list">{ticket.attachments.map(renderAttachment)}</ul>}
        </section>

        <section className="zen-form-section zen-public-comments zen-staff-public-comments" aria-labelledby="staff-public-comments-heading">
          <h2 id="staff-public-comments-heading">Public Comments</h2>
          <p className="zen-field-help">Visible to the Requester, IT Staff and Administrator. Use this area for the shared conversation.</p>
          <CommunicationFeed comments={comments} emptyLabel="No Public Comments yet." ariaLabel="Public Comment history" />
          <form className="zen-comment-composer" onSubmit={(event) => void submitCommunication(event, "comment")}>
            <label htmlFor="staff-public-comment-input">Add a Public Comment</label>
            <textarea id="staff-public-comment-input" value={commentContent} maxLength={2000} rows={4} disabled={postingCommunication !== null} onChange={(event) => { setCommentContent(event.target.value); setCommunicationError(null); }} />
            <p className="zen-field-help">1 to 2,000 characters. Comments are append-only and cannot be edited or deleted.</p>
            <button type="submit" className="zen-button zen-button-primary" disabled={postingCommunication !== null || commentContent.trim().length === 0}>{postingCommunication === "comment" ? "Posting..." : "Post Public Comment"}</button>
          </form>
        </section>

        <section className="zen-form-section zen-internal-notes" aria-labelledby="staff-internal-notes-heading">
          <h2 id="staff-internal-notes-heading">Internal Notes</h2>
          <p className="zen-field-help"><span aria-hidden="true">🔒 </span>IT Staff/Administrator only — never visible to Requesters. Use this area for private operational context.</p>
          <CommunicationFeed notes={notes} emptyLabel="No Internal Notes yet." ariaLabel="Internal Note history" />
          <form className="zen-comment-composer" onSubmit={(event) => void submitCommunication(event, "note")}>
            <label htmlFor="staff-internal-note-input">Add an Internal Note</label>
            <textarea id="staff-internal-note-input" value={noteContent} maxLength={2000} rows={4} disabled={postingCommunication !== null} onChange={(event) => { setNoteContent(event.target.value); setCommunicationError(null); }} />
            <p className="zen-field-help">1 to 2,000 characters. Notes are append-only and cannot be edited or deleted.</p>
            <button type="submit" className="zen-button zen-button-primary" disabled={postingCommunication !== null || noteContent.trim().length === 0}>{postingCommunication === "note" ? "Posting..." : "Post Internal Note"}</button>
          </form>
        </section>
        {communicationError !== null && <div className="zen-callout zen-callout-error" role="alert">{communicationError}</div>}
      </article>
    </div>
  );
}
