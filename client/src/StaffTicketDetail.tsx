import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

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
import ActionsTakenSection from "./ActionsTaken.js";
import type { AuthUser } from "./api.js";

interface StaffTicketDetailProps {
  ticketId: number;
  onBack: () => void;
  currentUser?: Pick<AuthUser, "displayName" | "role"> | null;
}

type LoadState = "loading" | "success" | "error";
type FormalStatus = Extract<CurrentStatus, "RESOLVED" | "CLOSED">;

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "a[href]",
  "[tabindex]:not([tabindex=\"-1\"])",
].join(", ");

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

export default function StaffTicketDetail({ ticketId, onBack, currentUser }: StaffTicketDetailProps) {
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
  const [resolutionSummary, setResolutionSummary] = useState("");
  const [closureSummary, setClosureSummary] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [hasStaleConflict, setHasStaleConflict] = useState(false);
  const [actionsRefreshKey, setActionsRefreshKey] = useState(0);
  const [statusDialogTarget, setStatusDialogTarget] = useState<FormalStatus | null>(null);
  const [comments, setComments] = useState<PublicComment[]>([]);
  const [notes, setNotes] = useState<InternalNote[]>([]);
  const [commentContent, setCommentContent] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [communicationError, setCommunicationError] = useState<string | null>(null);
  const [postingCommunication, setPostingCommunication] = useState<"comment" | "note" | null>(null);
  const statusSelectRef = useRef<HTMLSelectElement>(null);
  const statusDialogRef = useRef<HTMLElement>(null);
  const statusDialogHeadingRef = useRef<HTMLHeadingElement>(null);
  const statusDialogWasOpenRef = useRef(false);
  const isSavingRef = useRef(false);

  isSavingRef.current = isSaving;

  const applyTicketDetail = useCallback((loaded: StaffTicketDetailData) => {
    setTicket(loaded);
    setComments(loaded.publicComments);
    setNotes(loaded.internalNotes);
  }, []);

  const refreshTicketDetail = useCallback(async (signal?: AbortSignal) => {
    const loaded = await fetchStaffTicket(ticketId, signal);
    applyTicketDetail(loaded);
    setDetailState("success");
    return loaded;
  }, [applyTicketDetail, ticketId]);

  useEffect(() => {
    const controller = new AbortController();
    setDetailState("loading");
    setDetailError(null);
    refreshTicketDetail(controller.signal)
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setDetailState("error");
        setDetailError(safeErrorMessage(error, "Unable to load Staff Ticket Detail. Please try again."));
      });
    return () => controller.abort();
  }, [detailRetry, refreshTicketDetail]);

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
    setResolutionSummary(ticket.resolutionSummary ?? "");
    setClosureSummary(ticket.closureSummary ?? "");
    setCancelReason(ticket.cancelReason ?? "");
    setReopenReason(ticket.reopenReason ?? "");
  }, [ticket]);

  useEffect(() => {
    if (statusDialogTarget !== null) {
      statusDialogWasOpenRef.current = true;
      return;
    }
    if (!statusDialogWasOpenRef.current) return;
    statusDialogWasOpenRef.current = false;
    statusSelectRef.current?.focus();
  }, [statusDialogTarget]);

  useEffect(() => {
    if (statusDialogTarget === null) return;

    const dialog = statusDialogRef.current;
    if (dialog === null) return;
    const dialogElement = dialog;
    statusDialogHeadingRef.current?.focus();

    function getFocusableElements() {
      return Array.from(
        dialogElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => element.getAttribute("aria-hidden") !== "true");
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSavingRef.current) {
        event.preventDefault();
        cancelStatusDialog();
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (first === undefined || last === undefined) return;

      if (!dialogElement.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [statusDialogTarget]);

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
  const statusDialogEvidence =
    statusDialogTarget === "RESOLVED" ? resolutionSummary.trim() : closureSummary.trim();
  const statusDialogEvidenceValid =
    statusDialogTarget === null || (statusDialogEvidence.length >= 10 && statusDialogEvidence.length <= 2000);
  const hasWorkChanges = ownerChanged || priorityChanged || statusChanged;

  async function saveWorkControls(confirmedFormalStatus = confirmStatusChange) {
    if (ticket === null || !hasWorkChanges || isSaving) return;
    if (formalStatusNeedsConfirmation && !confirmedFormalStatus) {
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
      if (formalStatusNeedsConfirmation) input.confirmStatusChange = confirmedFormalStatus;
      if (selectedStatus === "RESOLVED") input.resolutionSummary = resolutionSummary.trim();
      if (selectedStatus === "CLOSED") input.closureSummary = closureSummary.trim();
      if (selectedStatus === "CANCELLED") input.cancelReason = cancelReason.trim();
      if (selectedStatus === "REOPENED") input.reopenReason = reopenReason.trim();
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    setHasStaleConflict(false);
    try {
      const updated = await updateStaffTicket(ticketId, input, ticket.version ?? 1);
      applyTicketDetail(updated);
      setActionsRefreshKey((value) => value + 1);
      setStatusDialogTarget(null);
      setConfirmStatusChange(false);
      // The mutation response is immediately visible, then the detail is
      // refetched so the page is synchronized with the authoritative summary.
      await refreshTicketDetail().catch(() => undefined);
      setSaveError(null);
      setSaveSuccess("Ticket updated successfully.");
    } catch (error: unknown) {
      setHasStaleConflict(error instanceof ApiRequestError && (error.status === 412 || error.code === "STALE_WRITE"));
      setSaveError(safeErrorMessage(error, "Unable to update this Ticket. Please try again."));
    } finally {
      setIsSaving(false);
    }
  }

  async function claimTicket() {
    if (ticket === null || ticket.ticketOwner !== null || isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    setHasStaleConflict(false);
    try {
      const updated = await updateStaffTicketOwner(ticketId, { action: "claim" }, ticket.version ?? 1);
      applyTicketDetail(updated);
      setActionsRefreshKey((value) => value + 1);
      await refreshTicketDetail().catch(() => undefined);
      setSaveSuccess("Ticket claimed successfully.");
    } catch (error: unknown) {
      setHasStaleConflict(error instanceof ApiRequestError && (error.status === 412 || error.code === "STALE_WRITE"));
      setSaveError(safeErrorMessage(error, "Unable to claim this Ticket. Please try again."));
    } finally {
      setIsSaving(false);
    }
  }

  async function reloadLatestTicket() {
    if (isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await refreshTicketDetail();
      setHasStaleConflict(false);
      setStatusDialogTarget(null);
      setConfirmStatusChange(false);
      setActionsRefreshKey((value) => value + 1);
      setSaveSuccess("Latest Ticket version loaded. Review your changes before saving again.");
    } catch (error: unknown) {
      setSaveError(safeErrorMessage(error, "Unable to reload this Ticket. Please try again."));
    } finally {
      setIsSaving(false);
    }
  }

  function cancelStatusDialog() {
    if (isSaving || ticket === null) return;
    setSelectedStatus(ticket.currentStatus);
    setConfirmStatusChange(false);
    setStatusDialogTarget(null);
    setSaveError(null);
    setHasStaleConflict(false);
  }

  async function confirmStatusDialog() {
    if (statusDialogTarget === null || isSaving) return;
    if (!confirmStatusChange) {
      setSaveError("Confirm the formal Resolved or Closed status change before saving.");
      return;
    }
    await saveWorkControls(true);
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
              <select id="staff-detail-owner" value={selectedOwner} disabled={ownerState !== "success" || ownerOptions.length === 0 || isSaving || statusDialogTarget !== null} onChange={(event) => { setSelectedOwner(event.target.value); setSaveError(null); }}>
                {ticket.ticketOwner === null && <option value="">Unassigned</option>}
                {ownerOptions.map((owner) => <option value={owner.id} key={owner.id}>{owner.displayName} ({roleLabel(owner.role)})</option>)}
              </select>
              {ownerState === "loading" && <p className="zen-field-help" role="status">Loading owner options...</p>}
              {ownerState === "error" && <div className="zen-callout zen-callout-error" role="alert"><p>{ownerError}</p><button type="button" className="zen-button zen-button-secondary zen-small-button" onClick={() => setOwnerRetry((value) => value + 1)}>Retry</button></div>}
              {ownerState === "success" && ownerOptions.length === 0 && <p className="zen-field-error" role="alert">No active IT Staff or Administrator owners are available.</p>}
            </div>
            <div className="zen-list-field">
              <label htmlFor="staff-detail-it-priority">IT Priority</label>
              <select id="staff-detail-it-priority" value={selectedPriority} disabled={isSaving || statusDialogTarget !== null} onChange={(event) => { setSelectedPriority(event.target.value as RequestedPriority); setSaveError(null); }}>
                {PRIORITIES.map((priority) => <option value={priority} key={priority}>{formatPriority(priority)}</option>)}
              </select>
            </div>
            <div className="zen-list-field">
              <label htmlFor="staff-detail-status">Current Status</label>
              <select
                id="staff-detail-status"
                ref={statusSelectRef}
                value={selectedStatus}
                disabled={isSaving || statusDialogTarget !== null}
                onChange={(event) => {
                  const nextStatus = event.target.value as CurrentStatus;
                  setSelectedStatus(nextStatus);
                  setConfirmStatusChange(false);
                  setSaveError(null);
                  setSaveSuccess(null);
                  setHasStaleConflict(false);
                  if ((nextStatus === "RESOLVED" || nextStatus === "CLOSED") && nextStatus !== ticket.currentStatus) {
                    setStatusDialogTarget(nextStatus);
                  } else {
                    setStatusDialogTarget(null);
                  }
                }}
              >
                {availableStatuses.map((status) => <option value={status} key={status}>{formatStatus(status)}</option>)}
              </select>
              <p className="zen-field-help">Only status transitions permitted from the current status are available.</p>
            </div>
          </div>
          {statusChanged && selectedStatus === "CANCELLED" && (
            <div className="zen-form-field zen-action-form-field-full">
              <label htmlFor="staff-cancel-reason">Cancellation Reason <span className="required-mark">*</span></label>
              <textarea
                id="staff-cancel-reason"
                value={cancelReason}
                minLength={3}
                maxLength={1000}
                rows={3}
                onChange={(event) => { setCancelReason(event.target.value); setSaveError(null); }}
                aria-required="true"
                aria-describedby="staff-cancel-reason-help"
                disabled={isSaving || statusDialogTarget !== null}
              />
              <p id="staff-cancel-reason-help" className="zen-field-help">Required for Cancelled: 3 to 1,000 characters.</p>
            </div>
          )}
          {statusChanged && selectedStatus === "REOPENED" && (
            <div className="zen-form-field zen-action-form-field-full">
              <label htmlFor="staff-reopen-reason">Reopen Reason <span className="required-mark">*</span></label>
              <textarea
                id="staff-reopen-reason"
                value={reopenReason}
                minLength={3}
                maxLength={1000}
                rows={3}
                onChange={(event) => { setReopenReason(event.target.value); setSaveError(null); }}
                aria-required="true"
                aria-describedby="staff-reopen-reason-help"
                disabled={isSaving || statusDialogTarget !== null}
              />
              <p id="staff-reopen-reason-help" className="zen-field-help">Required for Reopened: 3 to 1,000 characters.</p>
            </div>
          )}
          {saveError !== null && <div className="zen-callout zen-callout-error" role="alert">{saveError}</div>}
          {saveSuccess !== null && <div className="zen-callout zen-callout-info" role="status" aria-live="polite">{saveSuccess}</div>}
          <div className="zen-action-row">
            {hasStaleConflict && <button type="button" className="zen-button zen-button-secondary" onClick={() => void reloadLatestTicket()} disabled={isSaving}>Reload latest Ticket</button>}
            {ticket.ticketOwner === null && <button type="button" className="zen-button zen-button-secondary" onClick={() => void claimTicket()} disabled={isSaving}>Claim Ticket</button>}
            <button type="button" className="zen-button zen-button-primary" onClick={() => void saveWorkControls()} disabled={isSaving || statusDialogTarget !== null || !hasWorkChanges || (formalStatusNeedsConfirmation && !confirmStatusChange)}>{isSaving ? "Saving..." : "Save Work Changes"}</button>
          </div>
        </section>

        {ticket.requesterResolutionIndicatedAt !== null && (
          <div className="zen-callout zen-callout-info" role="status">Requester indicated that the problem appears resolved on {formatDate(ticket.requesterResolutionIndicatedAt)}. This is not a formal status change.</div>
        )}

        <ActionsTakenSection ticketId={ticketId} mode="staff" currentUser={currentUser} refreshKey={actionsRefreshKey} />

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

      {statusDialogTarget !== null && (
        <div className="zen-dialog-backdrop" role="presentation">
          <section
            ref={statusDialogRef}
            className="zen-dialog zen-status-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-status-dialog-title"
            aria-describedby="staff-status-dialog-description"
          >
            <h2 id="staff-status-dialog-title" ref={statusDialogHeadingRef} tabIndex={-1}>Confirm status change</h2>
            <p id="staff-status-dialog-description">
              Change Ticket <strong>{ticket.ticketNumber}</strong> from <strong>{formatStatus(ticket.currentStatus)}</strong> to <strong>{formatStatus(statusDialogTarget)}</strong>?
            </p>

            {statusDialogTarget === "RESOLVED" ? (
              <>
                <label htmlFor="staff-resolution-summary">Resolution Summary <span className="required-mark">*</span></label>
                <textarea
                  id="staff-resolution-summary"
                  value={resolutionSummary}
                  minLength={10}
                  maxLength={2000}
                  rows={4}
                  onChange={(event) => { setResolutionSummary(event.target.value); setSaveError(null); }}
                  aria-required="true"
                  aria-describedby="staff-resolution-summary-help"
                  disabled={isSaving}
                  required
                />
                <p id="staff-resolution-summary-help" className="zen-field-help">Required for Resolved: 10 to 2,000 characters.</p>
              </>
            ) : (
              <>
                <label htmlFor="staff-closure-summary">Closure Summary <span className="required-mark">*</span></label>
                <textarea
                  id="staff-closure-summary"
                  value={closureSummary}
                  minLength={10}
                  maxLength={2000}
                  rows={4}
                  onChange={(event) => { setClosureSummary(event.target.value); setSaveError(null); }}
                  aria-required="true"
                  aria-describedby="staff-closure-summary-help"
                  disabled={isSaving}
                  required
                />
                <p id="staff-closure-summary-help" className="zen-field-help">Required for Closed: 10 to 2,000 characters.</p>
              </>
            )}

            <label className="zen-confirmation-check" htmlFor="staff-status-dialog-confirm">
              <input
                id="staff-status-dialog-confirm"
                type="checkbox"
                checked={confirmStatusChange}
                onChange={(event) => { setConfirmStatusChange(event.target.checked); setSaveError(null); }}
                disabled={isSaving}
              />
              I confirm this formal {formatStatus(statusDialogTarget)} transition.
            </label>

            {saveError !== null && <div className="zen-callout zen-callout-error" role="alert">{saveError}</div>}
            {hasStaleConflict && (
              <div className="zen-callout zen-callout-warning" role="alert">
                <p>This Ticket changed elsewhere. Reload the latest version before resubmitting.</p>
                <button type="button" className="zen-button zen-button-secondary zen-small-button" onClick={() => void reloadLatestTicket()} disabled={isSaving}>Reload latest Ticket</button>
              </div>
            )}

            <div className="zen-action-row zen-dialog-actions">
              <button type="button" className="zen-button zen-button-secondary" onClick={cancelStatusDialog} disabled={isSaving}>Cancel</button>
              <button type="button" className="zen-button zen-button-primary" onClick={() => void confirmStatusDialog()} disabled={isSaving || hasStaleConflict || !confirmStatusChange || !statusDialogEvidenceValid}>
                {isSaving ? "Saving..." : "Confirm"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
