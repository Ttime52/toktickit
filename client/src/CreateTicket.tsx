import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import {
  ApiRequestError,
  createTicket,
  fetchCategories,
  fetchRelatedSystems,
  uploadAttachment,
  type Category,
  type RequestedPriority,
  type RelatedSystem,
  type Ticket,
} from "./api.js";
import { useRequesterContext } from "./RequesterContext.js";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILE_COUNT = 5;

const ACCEPTED_MIME_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

const PRIORITIES: RequestedPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

type ReferenceLoadState = "loading" | "success" | "empty" | "error";

type FormValues = {
  categoryId: string;
  relatedSystemId: string;
  requestedPriority: RequestedPriority;
  summary: string;
  description: string;
};

type FormErrors = Partial<
  Record<keyof FormValues | "requesterId" | "idempotencyKey", string>
>;

type FileRowState = "selected" | "uploading" | "uploaded" | "invalid" | "failed";

interface SelectedFileRow {
  id: number;
  file: File;
  state: FileRowState;
  error?: string;
}

interface CreateTicketProps {
  onNavigate?: (page: "my-tickets" | "create-ticket") => void;
  onViewTicket?: (ticketId: number) => void;
}

function safeErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError || error instanceof Error
    ? error.message
    : fallback;
}

function createIdempotencyKey(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
  } catch {
    // Fall through to a browser-compatible UUID-like value.
  }

  return `issue4-${Date.now()}-${Math.random().toString(36).slice(2, 18)}`;
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatUtcDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function validateClientFile(file: File): string | null {
  const filename = file.name.split(/[\\/]/u).pop() ?? file.name;
  const extension = filename.includes(".")
    ? filename.slice(filename.lastIndexOf(".")).toLowerCase()
    : "";
  const expectedMime = ACCEPTED_MIME_BY_EXTENSION[extension];

  if (expectedMime === undefined || file.type.toLowerCase() !== expectedMime) {
    return "Allowed formats are JPG, JPEG, PNG, WEBP, and PDF; filename and type must agree.";
  }

  if (file.size > MAX_FILE_BYTES) {
    return "This file exceeds the 5 MiB limit.";
  }

  return null;
}

function readApiFieldErrors(error: unknown): FormErrors {
  if (!(error instanceof ApiRequestError)) return {};
  return error.fields as FormErrors;
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

export default function CreateTicket({
  onNavigate,
  onViewTicket,
}: CreateTicketProps) {
  const { selectedRequester } = useRequesterContext();
  const [categories, setCategories] = useState<Category[]>([]);
  const [relatedSystems, setRelatedSystems] = useState<RelatedSystem[]>([]);
  const [referenceState, setReferenceState] =
    useState<ReferenceLoadState>("loading");
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [form, setForm] = useState<FormValues>({
    categoryId: "",
    relatedSystemId: "",
    requestedPriority: "MEDIUM",
    summary: "",
    description: "",
  });
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdTicket, setCreatedTicket] = useState<Ticket | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [fileRows, setFileRows] = useState<SelectedFileRow[]>([]);
  const nextFileId = useRef(1);
  const idempotencyKey = useRef<string | null>(null);

  const categoryId = useId();
  const relatedSystemId = useId();
  const priorityId = useId();
  const summaryId = useId();
  const descriptionId = useId();
  const attachmentInputId = useId();

  const loadReferences = useCallback(async (signal?: AbortSignal) => {
    setReferenceState("loading");
    setReferenceError(null);

    try {
      const [loadedCategories, loadedRelatedSystems] = await Promise.all([
        fetchCategories(signal),
        fetchRelatedSystems(signal),
      ]);
      setCategories(loadedCategories);
      setRelatedSystems(loadedRelatedSystems);
      setReferenceState(
        loadedCategories.length > 0 && loadedRelatedSystems.length > 0
          ? "success"
          : "empty",
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setReferenceState("error");
      setReferenceError("Unable to load Category and Related System references.");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadReferences(controller.signal);
    return () => controller.abort();
  }, [loadReferences]);

  function updateField(field: keyof FormValues, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFormErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFormError(null);
    // A changed payload must use a new idempotency key. A failed unchanged
    // submission keeps its key so a retry is replay-safe.
    idempotencyKey.current = null;
  }

  function validateForm(): FormErrors {
    const errors: FormErrors = {};
    if (form.categoryId === "") errors.categoryId = "Category is required.";
    if (form.relatedSystemId === "") {
      errors.relatedSystemId = "Related System is required.";
    }
    if (form.summary.trim().length < 5 || form.summary.trim().length > 120) {
      errors.summary = "Summary must be 5 to 120 characters after trimming.";
    }
    if (
      form.description.trim().length < 20 ||
      form.description.trim().length > 2000
    ) {
      errors.description =
        "Description must be 20 to 2,000 characters after trimming.";
    }
    return errors;
  }

  function updateFileRow(id: number, update: Partial<SelectedFileRow>) {
    setFileRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...update } : row)),
    );
  }

  function handleFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (selectedFiles.length === 0) return;

    setFileRows((currentRows) => {
      const nextRows = [...currentRows];
      let activeSelectionCount = currentRows.filter(
        (row) => row.state !== "invalid",
      ).length;

      for (const file of selectedFiles) {
        const id = nextFileId.current;
        nextFileId.current += 1;
        const validationMessage = validateClientFile(file);

        if (validationMessage !== null) {
          nextRows.push({ id, file, state: "invalid", error: validationMessage });
          continue;
        }

        if (activeSelectionCount >= MAX_FILE_COUNT) {
          nextRows.push({
            id,
            file,
            state: "invalid",
            error: "The five active file limit has been reached.",
          });
          continue;
        }

        nextRows.push({ id, file, state: "selected" });
        activeSelectionCount += 1;
      }

      return nextRows;
    });
  }

  function removeLocalFile(id: number) {
    setFileRows((rows) => rows.filter((row) => row.id !== id));
  }

  async function uploadOneFile(row: SelectedFileRow, ticket: Ticket) {
    updateFileRow(row.id, { state: "uploading", error: undefined });
    try {
      await uploadAttachment(ticket.id, ticket.requester.id, row.file);
      updateFileRow(row.id, { state: "uploaded", error: undefined });
    } catch (error) {
      updateFileRow(row.id, {
        state: "failed",
        error: safeErrorMessage(error, "Unable to upload this Attachment."),
      });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedRequester === null || isSubmitting || createdTicket !== null) {
      return;
    }

    const validationErrors = validateForm();
    setFormErrors(validationErrors);
    setFormError(null);
    setSuccessNotice(null);
    if (Object.keys(validationErrors).length > 0) return;

    if (referenceState !== "success") {
      setFormError("Reference data unavailable. Retry before creating a Ticket.");
      return;
    }

    const key = idempotencyKey.current ?? createIdempotencyKey();
    idempotencyKey.current = key;
    setIsSubmitting(true);

    try {
      const result = await createTicket(
        {
          requesterId: selectedRequester.id,
          categoryId: Number(form.categoryId),
          relatedSystemId: Number(form.relatedSystemId),
          summary: form.summary.trim(),
          requestedPriority: form.requestedPriority,
          description: form.description.trim(),
        },
        key,
      );

      setCreatedTicket(result.ticket);
      setFormError(null);

      const filesToUpload = fileRows.filter((row) => row.state === "selected");
      for (const row of filesToUpload) {
        await uploadOneFile(row, result.ticket);
      }
      setIsSubmitting(false);
    } catch (error) {
      setIsSubmitting(false);
      setFormError(safeErrorMessage(error, "Unable to create the Ticket."));
      setFormErrors((current) => ({ ...current, ...readApiFieldErrors(error) }));
    }
  }

  const referenceDataAvailable = referenceState === "success";
  const canSubmit =
    referenceDataAvailable && !isSubmitting && createdTicket === null;

  return (
    <article className="zen-create-page">
      <div className="zen-create-heading">
        <p className="zen-eyebrow">Requester workflow</p>
        <h1>Create Ticket</h1>
        <p className="zen-lead">
          Describe the issue and submit it for the selected Development Requester.
          Ticket Number and Ticket Date are generated by the backend.
        </p>
      </div>

      {formError !== null && (
        <div className="zen-callout zen-callout-error" role="alert">
          {formError}
        </div>
      )}

      {createdTicket !== null && (
        <section className="zen-success-panel" role="status" aria-live="polite">
          <p className="zen-eyebrow">Success</p>
          <h2>Ticket created</h2>
          <p>
            Your official Ticket Number is{" "}
            <strong>{createdTicket.ticketNumber}</strong>.
          </p>
          <dl className="zen-success-details">
            <ReadOnlyValue label="Ticket Date (UTC)" value={formatUtcDate(createdTicket.ticketDate)} />
            <ReadOnlyValue label="Current Status" value={createdTicket.currentStatus} />
            <ReadOnlyValue label="Requested Priority" value={createdTicket.requestedPriority} />
          </dl>
          {successNotice !== null && (
            <p className="zen-field-error" role="alert">{successNotice}</p>
          )}
          <div className="zen-action-row">
            <button
              type="button"
              className="zen-button zen-button-secondary"
              onClick={() => {
                if (onViewTicket !== undefined) {
                  onViewTicket(createdTicket.id);
                  return;
                }
                setSuccessNotice(
                  "Ticket Detail is outside Issue 4. The Ticket was saved successfully.",
                );
              }}
            >
              View Ticket
            </button>
            <button
              type="button"
              className="zen-button zen-button-primary"
              onClick={() => onNavigate?.("my-tickets")}
            >
              My Tickets
            </button>
          </div>
        </section>
      )}

      <form
        className="zen-create-card"
        onSubmit={handleSubmit}
        noValidate
        aria-busy={isSubmitting}
      >
        <section className="zen-form-section" aria-labelledby="ticket-context-heading">
          <h2 id="ticket-context-heading">Ticket context</h2>
          <dl className="zen-read-only-grid">
            <ReadOnlyValue
              label="Ticket Number"
              value={createdTicket?.ticketNumber ?? "Generated on submit"}
            />
            <ReadOnlyValue
              label="Ticket Date"
              value={
                createdTicket === null
                  ? "Generated on submit"
                  : formatUtcDate(createdTicket.ticketDate)
              }
            />
            <ReadOnlyValue
              label="Requester"
              value={selectedRequester?.displayName ?? "No requester selected"}
            />
          </dl>
        </section>

        <section className="zen-form-section" aria-labelledby="classification-heading">
          <h2 id="classification-heading">Classification</h2>
          <div className="zen-classification-grid">
            <div className="zen-form-field">
              <label htmlFor={categoryId}>
                Category <span className="required-mark">*</span>
              </label>
              <select
                id={categoryId}
                value={form.categoryId}
                onChange={(event) => updateField("categoryId", event.target.value)}
                disabled={!referenceDataAvailable || isSubmitting || createdTicket !== null}
                aria-required="true"
                aria-invalid={formErrors.categoryId !== undefined}
                aria-describedby={formErrors.categoryId !== undefined ? `${categoryId}-error` : undefined}
              >
                <option value="">
                  {referenceState === "empty" ? "Reference data unavailable" : "Select a Category"}
                </option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
              {formErrors.categoryId !== undefined && (
                <p id={`${categoryId}-error`} className="zen-field-error" role="alert">
                  {formErrors.categoryId}
                </p>
              )}
            </div>

            <div className="zen-form-field">
              <label htmlFor={relatedSystemId}>
                Related System <span className="required-mark">*</span>
              </label>
              <select
                id={relatedSystemId}
                value={form.relatedSystemId}
                onChange={(event) => updateField("relatedSystemId", event.target.value)}
                disabled={!referenceDataAvailable || isSubmitting || createdTicket !== null}
                aria-required="true"
                aria-invalid={formErrors.relatedSystemId !== undefined}
                aria-describedby={formErrors.relatedSystemId !== undefined ? `${relatedSystemId}-error` : undefined}
              >
                <option value="">
                  {referenceState === "empty" ? "Reference data unavailable" : "Select a Related System"}
                </option>
                {relatedSystems.map((system) => (
                  <option key={system.id} value={system.id}>{system.name}</option>
                ))}
              </select>
              {formErrors.relatedSystemId !== undefined && (
                <p id={`${relatedSystemId}-error`} className="zen-field-error" role="alert">
                  {formErrors.relatedSystemId}
                </p>
              )}
            </div>

            <div className="zen-form-field">
              <label htmlFor={priorityId}>Requested Priority</label>
              <select
                id={priorityId}
                value={form.requestedPriority}
                onChange={(event) => updateField("requestedPriority", event.target.value)}
                disabled={!referenceDataAvailable || isSubmitting || createdTicket !== null}
              >
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>{priority}</option>
                ))}
              </select>
              {formErrors.requestedPriority !== undefined && (
                <p className="zen-field-error" role="alert">{formErrors.requestedPriority}</p>
              )}
            </div>
          </div>

          {(referenceState === "loading" || referenceState === "error" || referenceState === "empty") && (
            <div className="zen-reference-state">
              {referenceState === "loading" && (
                <p className="zen-status" role="status" aria-live="polite">
                  <span className="zen-spinner" aria-hidden="true" /> Loading reference data…
                </p>
              )}
              {referenceState === "empty" && (
                <div className="zen-callout zen-callout-warning" role="alert">
                  <strong>Reference data unavailable.</strong> Category and Related System are required.
                  <button type="button" className="zen-button zen-button-secondary" onClick={() => void loadReferences()}>
                    Retry
                  </button>
                </div>
              )}
              {referenceState === "error" && (
                <div className="zen-callout zen-callout-error" role="alert">
                  <strong>{referenceError ?? "Unable to load reference data."}</strong>
                  <button type="button" className="zen-button zen-button-secondary" onClick={() => void loadReferences()}>
                    Retry
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="zen-form-section" aria-labelledby="details-heading">
          <h2 id="details-heading">Issue details</h2>
          <div className="zen-form-field zen-form-field-full">
            <label htmlFor={summaryId}>Summary <span className="required-mark">*</span></label>
            <input
              id={summaryId}
              type="text"
              value={form.summary}
              onChange={(event) => updateField("summary", event.target.value)}
              disabled={isSubmitting || createdTicket !== null}
              aria-required="true"
              aria-invalid={formErrors.summary !== undefined}
              aria-describedby={`${summaryId}-hint${formErrors.summary !== undefined ? ` ${summaryId}-error` : ""}`}
              maxLength={120}
            />
            <p id={`${summaryId}-hint`} className="zen-field-help">5–120 characters</p>
            {formErrors.summary !== undefined && (
              <p id={`${summaryId}-error`} className="zen-field-error" role="alert">{formErrors.summary}</p>
            )}
          </div>

          <div className="zen-form-field zen-form-field-full">
            <label htmlFor={descriptionId}>Description <span className="required-mark">*</span></label>
            <textarea
              id={descriptionId}
              value={form.description}
              onChange={(event) => updateField("description", event.target.value)}
              disabled={isSubmitting || createdTicket !== null}
              aria-required="true"
              aria-invalid={formErrors.description !== undefined}
              aria-describedby={`${descriptionId}-hint${formErrors.description !== undefined ? ` ${descriptionId}-error` : ""}`}
              maxLength={2000}
              rows={8}
            />
            <p id={`${descriptionId}-hint`} className="zen-field-help">20–2,000 characters</p>
            {formErrors.description !== undefined && (
              <p id={`${descriptionId}-error`} className="zen-field-error" role="alert">{formErrors.description}</p>
            )}
          </div>
        </section>

        <section className="zen-form-section" aria-labelledby="attachments-heading">
          <h2 id="attachments-heading">Attachments</h2>
          <p className="zen-field-help">
            Allowed: JPG/JPEG, PNG, WEBP, PDF. 5 MiB per file, 5 active files maximum.
          </p>
          <label className="zen-file-input-label" htmlFor={attachmentInputId}>Choose files</label>
          <input
            id={attachmentInputId}
            className="zen-file-input"
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
            onChange={handleFilesSelected}
            disabled={isSubmitting || createdTicket !== null}
          />

          <div className="zen-attachment-list" aria-live="polite">
            {fileRows.length === 0 ? (
              <p className="zen-empty-files">No files selected.</p>
            ) : (
              <ul>
                {fileRows.map((row) => (
                  <li key={row.id} className={`zen-attachment-row is-${row.state}`}>
                    <div className="zen-attachment-details">
                      <strong>{row.file.name}</strong>
                      <span>{formatFileSize(row.file.size)} · {row.file.type || "Unknown type"}</span>
                    </div>
                    <span className="zen-attachment-state">
                      {row.state === "selected" && "Selected"}
                      {row.state === "uploading" && "Uploading…"}
                      {row.state === "uploaded" && "Uploaded / Active"}
                      {row.state === "invalid" && "Invalid"}
                      {row.state === "failed" && "Upload failed"}
                    </span>
                    {row.error !== undefined && <p className="zen-field-error" role="alert">{row.error}</p>}
                    {(row.state === "selected" || row.state === "invalid") && (
                      <button type="button" className="zen-text-button" onClick={() => removeLocalFile(row.id)}>
                        Remove
                      </button>
                    )}
                    {row.state === "failed" && createdTicket !== null && !isSubmitting && (
                      <button type="button" className="zen-button zen-button-secondary zen-small-button" onClick={() => void uploadOneFile(row, createdTicket)}>
                        Retry
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <div className="zen-action-row zen-form-actions">
          <button type="submit" className="zen-button zen-button-primary" disabled={!canSubmit}>
            {isSubmitting ? "Creating…" : "Create Ticket"}
          </button>
          <button type="button" className="zen-button zen-button-secondary" disabled={isSubmitting} onClick={() => onNavigate?.("my-tickets")}>
            Cancel
          </button>
        </div>
      </form>
    </article>
  );
}
