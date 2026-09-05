import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import {
  ApiRequestError,
  fetchTicket,
  getAttachmentDownloadUrl,
  getAttachmentPreviewUrl,
  removeAttachment,
  uploadAttachment,
  type Ticket,
  type TicketAttachment,
} from "./api.js";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ACTIVE_ATTACHMENTS = 5;

const ACCEPTED_MIME_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

type UploadRowState = "queued" | "uploading" | "failed" | "invalid";

interface UploadRow {
  id: number;
  file: File;
  state: UploadRowState;
  error?: string;
}

interface RemoveDialogState {
  attachment: TicketAttachment;
  reason: string;
  error: string | null;
}

interface TicketDetailProps {
  ticketId: number;
  requesterId: number;
  onNavigate?: (page: "my-tickets") => void;
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

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
}

function validateClientFile(file: File): string | null {
  const filename = file.name.split(/[\\/]/u).pop() ?? file.name;
  const extension = filename.includes(".")
    ? filename.slice(filename.lastIndexOf(".")).toLowerCase()
    : "";
  const expectedMimeType = ACCEPTED_MIME_BY_EXTENSION[extension];

  if (
    expectedMimeType === undefined ||
    file.type.toLowerCase() !== expectedMimeType
  ) {
    return "Allowed formats are JPG, JPEG, PNG, WEBP, and PDF; filename and type must agree.";
  }

  if (file.size > MAX_FILE_BYTES) return "This file exceeds the 5 MiB limit.";
  return null;
}

function attachmentStateLabel(state: UploadRowState): string {
  if (state === "queued") return "Queued";
  if (state === "uploading") return "Uploading...";
  if (state === "failed") return "Upload failed";
  return "Invalid";
}

function updateAttachment(
  current: Ticket | null,
  nextAttachment: TicketAttachment,
): Ticket | null {
  if (current === null) return current;
  const existing = current.attachments.some(
    (attachment) => attachment.id === nextAttachment.id,
  );
  return {
    ...current,
    attachments: existing
      ? current.attachments.map((attachment) =>
          attachment.id === nextAttachment.id ? nextAttachment : attachment,
        )
      : [...current.attachments, nextAttachment],
  };
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

export default function TicketDetail({
  ticketId,
  requesterId,
  onNavigate,
}: TicketDetailProps) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [uploadRows, setUploadRows] = useState<UploadRow[]>([]);
  const [removeDialog, setRemoveDialog] = useState<RemoveDialogState | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const attachmentRowRefs = useRef(new Map<number, HTMLLIElement>());
  const focusAttachmentIdRef = useRef<number | null>(null);
  const removeReasonRef = useRef<HTMLTextAreaElement>(null);
  const removeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const fileInputId = `detail-attachment-${useId().replace(/:/gu, "")}`;
  const removeReasonId = `${fileInputId}-reason`;

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    setError(null);

    fetchTicket(ticketId, requesterId, controller.signal)
      .then((loadedTicket) => {
        setTicket(loadedTicket);
        setState("success");
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === "AbortError") {
          return;
        }
        setState("error");
        setError(
          safeErrorMessage(
            requestError,
            "Unable to load Ticket Detail. Please try again.",
          ),
        );
      });

    return () => controller.abort();
  }, [requesterId, retry, ticketId]);

  useEffect(() => {
    if (removeDialog === null) return;

    removeReasonRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && removingId === null) {
        closeRemoveDialog();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [removeDialog, removingId]);

  useEffect(() => {
    const attachmentId = focusAttachmentIdRef.current;
    if (attachmentId === null || ticket === null) return;

    const row = attachmentRowRefs.current.get(attachmentId);
    if (row === undefined) return;

    row.focus();
    focusAttachmentIdRef.current = null;
  }, [ticket]);

  function goBack() {
    onNavigate?.("my-tickets");
  }

  async function uploadOne(row: UploadRow) {
    setUploadRows((current) =>
      current.map((candidate) =>
        candidate.id === row.id
          ? { ...candidate, state: "uploading", error: undefined }
          : candidate,
      ),
    );

    try {
      const uploaded = await uploadAttachment(ticketId, requesterId, row.file);
      setTicket((current) => updateAttachment(current, uploaded));
      setUploadRows((current) => current.filter((candidate) => candidate.id !== row.id));
    } catch (uploadError: unknown) {
      setUploadRows((current) =>
        current.map((candidate) =>
          candidate.id === row.id
            ? {
                ...candidate,
                state: "failed",
                error: safeErrorMessage(
                  uploadError,
                  "Unable to upload this Attachment. Please retry.",
                ),
              }
            : candidate,
        ),
      );
    }
  }

  function handleFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    if (ticket === null) return;
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    const activeCount = ticket.attachments.filter(
      (attachment) => attachment.state === "active",
    ).length;
    const reservedCount = uploadRows.filter(
      (row) => row.state === "queued" || row.state === "uploading",
    ).length;
    let availableSlots = Math.max(
      0,
      MAX_ACTIVE_ATTACHMENTS - activeCount - reservedCount,
    );
    const nextRows: UploadRow[] = [];

    for (const file of files) {
      const validationError = validateClientFile(file);
      if (validationError !== null) {
        nextRows.push({
          id: Date.now() + nextRows.length,
          file,
          state: "invalid",
          error: validationError,
        });
        continue;
      }

      if (availableSlots === 0) {
        nextRows.push({
          id: Date.now() + nextRows.length,
          file,
          state: "invalid",
          error: "This Ticket already has five active Attachments.",
        });
        continue;
      }

      availableSlots -= 1;
      nextRows.push({
        id: Date.now() + nextRows.length,
        file,
        state: "queued",
      });
    }

    setUploadRows((current) => [...current, ...nextRows]);
    for (const row of nextRows) {
      if (row.state === "queued") void uploadOne(row);
    }
  }

  function removeUploadRow(rowId: number) {
    setUploadRows((current) => current.filter((row) => row.id !== rowId));
  }

  function openRemoveDialog(
    attachment: TicketAttachment,
    trigger: HTMLButtonElement,
  ) {
    removeTriggerRef.current = trigger;
    setRemoveDialog({ attachment, reason: "", error: null });
  }

  function closeRemoveDialog() {
    if (removingId !== null) return;
    setRemoveDialog(null);
    removeTriggerRef.current?.focus();
  }

  async function confirmRemove() {
    if (removeDialog === null) return;
    const reason = removeDialog.reason.trim();
    if (reason.length < 3 || reason.length > 200) {
      setRemoveDialog((current) =>
        current === null
          ? current
          : {
              ...current,
              error: "Enter a removal reason from 3 to 200 characters.",
            },
      );
      return;
    }

    const attachmentId = removeDialog.attachment.id;
    setRemovingId(attachmentId);
    try {
      const removed = await removeAttachment(
        ticketId,
        attachmentId,
        requesterId,
        reason,
      );
      focusAttachmentIdRef.current = attachmentId;
      setTicket((current) => updateAttachment(current, removed));
      setRemoveDialog(null);
    } catch (removeError: unknown) {
      setRemoveDialog((current) =>
        current === null
          ? current
          : {
              ...current,
              error: safeErrorMessage(
                removeError,
                "Unable to remove this Attachment. Please try again.",
              ),
            },
      );
    } finally {
      setRemovingId(null);
    }
  }

  function renderAttachment(attachment: TicketAttachment) {
    const active = attachment.state === "active";
    const downloadUrl = getAttachmentDownloadUrl(
      ticketId,
      attachment.id,
      requesterId,
    );
    const previewUrl = getAttachmentPreviewUrl(
      ticketId,
      attachment.id,
      requesterId,
    );

    return (
      <li
        className={`zen-attachment-row zen-detail-attachment-row is-${attachment.state}`}
        key={attachment.id}
        ref={(element) => {
          if (element === null) {
            attachmentRowRefs.current.delete(attachment.id);
          } else {
            attachmentRowRefs.current.set(attachment.id, element);
          }
        }}
        tabIndex={-1}
      >
        <div className="zen-attachment-details">
          <strong>{attachment.originalFilename}</strong>
          <span>
            {formatFileSize(attachment.sizeBytes)} · {attachment.mimeType}
          </span>
          <span>Uploaded {formatDate(attachment.uploadedAt)}</span>
          {attachment.state === "removed" && (
            <span>
              Removed {formatDate(attachment.removedAt)}: {attachment.removalReason ?? "No reason provided"}
            </span>
          )}
          {attachment.state === "unavailable" && (
            <span>
              Unavailable: {attachment.unavailableReason ?? "File bytes are unavailable."}
            </span>
          )}
        </div>
        <span className="zen-attachment-state">
          {active ? "Active" : attachment.state === "removed" ? "Removed" : "Unavailable"}
        </span>
        {active ? (
          <div className="zen-detail-attachment-actions">
            {attachment.previewable && (
              <a
                className="zen-button zen-button-secondary zen-small-button"
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
              >
                Preview
              </a>
            )}
            <a
              className="zen-button zen-button-secondary zen-small-button"
              href={downloadUrl}
              download={attachment.originalFilename}
            >
              Download
            </a>
            <button
              type="button"
              className="zen-button zen-button-danger zen-small-button"
              onClick={(event) => openRemoveDialog(attachment, event.currentTarget)}
              disabled={removingId === attachment.id}
            >
              Remove
            </button>
          </div>
        ) : (
          <span className="zen-detail-attachment-blocked">Download unavailable</span>
        )}
      </li>
    );
  }

  return (
    <div className="zen-detail-page">
      <header className="zen-detail-heading">
        <button
          type="button"
          className="zen-button zen-button-secondary"
          onClick={goBack}
        >
          Back to My Tickets
        </button>
        <div>
          <p className="zen-eyebrow">Requester workspace</p>
          <h1>Ticket Detail</h1>
          {ticket !== null && (
            <p className="zen-detail-ticket-number">
              {ticket.ticketNumber} · <span className="zen-badge zen-badge-status">{ticket.currentStatus === "NEW" ? "New" : ticket.currentStatus}</span>
            </p>
          )}
        </div>
      </header>

      {state === "loading" && (
        <section className="zen-ticket-skeleton" aria-busy="true" aria-live="polite">
          <div className="zen-status" role="status">
            <span className="zen-spinner" aria-hidden="true" /> Loading Ticket Detail...
          </div>
          <span /><span /><span /><span />
        </section>
      )}

      {state === "error" && (
        <section className="zen-callout zen-callout-error" role="alert">
          <p>{error ?? "Unable to load Ticket Detail. Please try again."}</p>
          <div className="zen-action-row">
            <button
              type="button"
              className="zen-button zen-button-primary"
              onClick={() => setRetry((value) => value + 1)}
            >
              Retry
            </button>
            <button type="button" className="zen-button zen-button-secondary" onClick={goBack}>
              Back to My Tickets
            </button>
          </div>
        </section>
      )}

      {state === "success" && ticket !== null && (
        <article className="zen-detail-card">
          <section className="zen-form-section" aria-labelledby="ticket-information-heading">
            <h2 id="ticket-information-heading">Ticket information</h2>
            <dl className="zen-read-only-grid zen-detail-read-only-grid">
              <ReadOnlyValue label="Ticket Number" value={ticket.ticketNumber} />
              <ReadOnlyValue label="Ticket Date" value={formatDate(ticket.ticketDate)} />
              <ReadOnlyValue label="Requester" value={ticket.requester.displayName} />
              <ReadOnlyValue label="Category" value={ticket.category.name} />
              <ReadOnlyValue label="Related System" value={ticket.relatedSystem.name} />
              <ReadOnlyValue label="Requested Priority" value={formatPriority(ticket.requestedPriority)} />
              <ReadOnlyValue label="IT Priority" value={formatPriority(ticket.itPriority)} />
              <ReadOnlyValue label="Current Status" value={ticket.currentStatus === "NEW" ? "New" : ticket.currentStatus} />
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

          <section className="zen-form-section zen-detail-attachments" aria-labelledby="detail-attachments-heading">
            <h2 id="detail-attachments-heading">Attachments</h2>
            <p className="zen-field-help">
              Add permitted JPG/JPEG, PNG, WEBP, or PDF files. Maximum 5 MiB per file and 5 active files.
            </p>
            <label className="zen-file-input-label" htmlFor={fileInputId}>Add Attachment</label>
            <input
              id={fileInputId}
              className="zen-file-input"
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
              onChange={handleFilesSelected}
            />

            <div className="zen-attachment-list" aria-live="polite">
              {ticket.attachments.length === 0 && uploadRows.length === 0 ? (
                <p className="zen-empty-files">No Attachments on this Ticket.</p>
              ) : (
                <ul>
                  {ticket.attachments.map(renderAttachment)}
                  {uploadRows.map((row) => (
                    <li
                      className={`zen-attachment-row zen-detail-attachment-row is-${row.state}`}
                      key={row.id}
                    >
                      <div className="zen-attachment-details">
                        <strong>{row.file.name}</strong>
                        <span>{formatFileSize(row.file.size)} · {row.file.type || "Unknown type"}</span>
                      </div>
                      <span className="zen-attachment-state">{attachmentStateLabel(row.state)}</span>
                      {row.error !== undefined && (
                        <p className="zen-field-error" role="alert">{row.error}</p>
                      )}
                      <div className="zen-detail-attachment-actions">
                        {row.state === "failed" && (
                          <button
                            type="button"
                            className="zen-button zen-button-secondary zen-small-button"
                            onClick={() => void uploadOne(row)}
                          >
                            Retry
                          </button>
                        )}
                        {row.state !== "uploading" && (
                          <button
                            type="button"
                            className="zen-text-button"
                            onClick={() => removeUploadRow(row.id)}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </article>
      )}

      {removeDialog !== null && (
        <div className="zen-dialog-backdrop">
          <section
            className="zen-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${fileInputId}-remove-title`}
          >
            <h2 id={`${fileInputId}-remove-title`}>Remove Attachment?</h2>
            <p>
              This keeps the Attachment metadata but blocks future download and preview for <strong>{removeDialog.attachment.originalFilename}</strong>.
            </p>
            <label htmlFor={removeReasonId}>Removal reason <span className="required-mark">*</span></label>
            <textarea
              id={removeReasonId}
              ref={removeReasonRef}
              value={removeDialog.reason}
              maxLength={200}
              aria-required="true"
              aria-invalid={removeDialog.error !== null}
              aria-describedby={removeDialog.error === null ? undefined : `${removeReasonId}-error`}
              onChange={(event) =>
                setRemoveDialog((current) =>
                  current === null
                    ? current
                    : { ...current, reason: event.target.value, error: null },
                )
              }
            />
            <p className="zen-field-help">3–200 characters</p>
            {removeDialog.error !== null && (
              <p id={`${removeReasonId}-error`} className="zen-field-error" role="alert">
                {removeDialog.error}
              </p>
            )}
            <div className="zen-action-row zen-dialog-actions">
              <button
                type="button"
                className="zen-button zen-button-secondary"
                onClick={closeRemoveDialog}
                disabled={removingId !== null}
              >
                Cancel
              </button>
              <button
                type="button"
                className="zen-button zen-button-danger"
                onClick={() => void confirmRemove()}
                disabled={removingId !== null}
              >
                {removingId !== null ? "Removing..." : "Remove Attachment"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
