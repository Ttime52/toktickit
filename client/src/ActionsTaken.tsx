import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  ApiRequestError,
  createActionTaken,
  fetchActionsTaken,
  updateActionTaken,
  type ActionTaken,
  type ActionTakenInput,
  type AuthUser,
} from "./api.js";

const PRODUCT_TIME_ZONE = "Asia/Bangkok";
const PRODUCT_UTC_OFFSET_HOURS = 7;

export type ActionsTakenMode = "requester" | "staff" | "administrator";
type LoadState = "loading" | "success" | "error";
type FormMode = "create" | "edit";

interface ActionFormValues {
  actionAt: string;
  actionDescription: string;
  result: string;
  followUpRequired: boolean;
  followUpNote: string;
  attachmentNotes: string;
}

interface EditorState {
  mode: FormMode;
  action: ActionTaken | null;
}

export interface ActionsTakenSectionProps {
  ticketId: number;
  mode: ActionsTakenMode;
  currentUser?: Pick<AuthUser, "displayName" | "role"> | null;
}

const EMPTY_FORM: ActionFormValues = {
  actionAt: "",
  actionDescription: "",
  result: "",
  followUpRequired: false,
  followUpNote: "",
  attachmentNotes: "",
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * The product timezone is fixed to ICT (UTC+07:00). Keeping this conversion
 * explicit means a browser running in another timezone cannot shift the
 * business time before it reaches the API.
 */
export function toProductDateTimeInput(value: string | Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const productTime = new Date(
    date.getTime() + PRODUCT_UTC_OFFSET_HOURS * 60 * 60 * 1000,
  );
  return [
    productTime.getUTCFullYear(),
    pad(productTime.getUTCMonth() + 1),
    pad(productTime.getUTCDate()),
  ].join("-") + `T${pad(productTime.getUTCHours())}:${pad(productTime.getUTCMinutes())}`;
}

export function productDateTimeInputToUtc(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(value)) return null;
  const date = new Date(`${value}:00+07:00`);
  if (Number.isNaN(date.getTime()) || toProductDateTimeInput(date) !== value) return null;
  return date.toISOString();
}

function formatActionDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: PRODUCT_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function actionDateAccessibleLabel(value: string): string {
  return `${formatActionDate(value)} ${PRODUCT_TIME_ZONE} (UTC+07:00)`;
}

function roleLabel(role: ActionTaken["performedBy"]["role"]): string {
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

function sortActions(actions: ActionTaken[]): ActionTaken[] {
  return [...actions].sort((left, right) => {
    const dateDifference = Date.parse(left.actionAt) - Date.parse(right.actionAt);
    return dateDifference !== 0 ? dateDifference : left.id - right.id;
  });
}

function actionFormFromRecord(action: ActionTaken): ActionFormValues {
  return {
    actionAt: toProductDateTimeInput(action.actionAt),
    actionDescription: action.actionDescription,
    result: action.result,
    followUpRequired: action.followUpRequired,
    followUpNote: action.followUpRequired ? action.followUpNote ?? "" : "",
    attachmentNotes: action.attachmentNotes ?? "",
  };
}

function createEmptyActionForm(): ActionFormValues {
  return { ...EMPTY_FORM, actionAt: toProductDateTimeInput() };
}

function createIdempotencyKey(): string {
  const randomId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `action-taken-${randomId}`.slice(0, 64);
}

function fieldErrorId(prefix: string, field: string): string {
  return `${prefix}-${field}-error`;
}

function validateForm(form: ActionFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  const description = form.actionDescription.trim();
  const result = form.result.trim();
  const followUpNote = form.followUpNote.trim();
  const attachmentNotes = form.attachmentNotes.trim();

  if (productDateTimeInputToUtc(form.actionAt) === null) {
    errors.actionAt = "Action Date/Time is required and must be valid.";
  } else {
    const actionAt = productDateTimeInputToUtc(form.actionAt);
    if (actionAt !== null && Date.parse(actionAt) > Date.now() + 5 * 60 * 1000) {
      errors.actionAt = "Action Date/Time cannot be more than five minutes in the future.";
    }
  }
  if (description.length < 1 || description.length > 2000) {
    errors.actionDescription = "Action Description must be 1 to 2,000 characters after trimming.";
  }
  if (result.length < 1 || result.length > 2000) {
    errors.result = "Result must be 1 to 2,000 characters after trimming.";
  }
  if (form.followUpRequired && (followUpNote.length < 1 || followUpNote.length > 1000)) {
    errors.followUpNote = "A follow-up note is required when follow-up is required and must be at most 1,000 characters.";
  }
  if (!form.followUpRequired && followUpNote.length > 0) {
    errors.followUpNote = "Follow-up Note must be empty when follow-up is not required.";
  }
  if (attachmentNotes.length > 1000) {
    errors.attachmentNotes = "Attachment Notes must be at most 1,000 characters after trimming.";
  }
  return errors;
}

function toApiInput(form: ActionFormValues): ActionTakenInput | null {
  const actionAt = productDateTimeInputToUtc(form.actionAt);
  if (actionAt === null) return null;
  return {
    actionAt,
    actionDescription: form.actionDescription.trim(),
    result: form.result.trim(),
    followUpRequired: form.followUpRequired,
    followUpNote: form.followUpRequired ? form.followUpNote.trim() : null,
    attachmentNotes: form.attachmentNotes.trim() || null,
  };
}

function ActionText({ value, emptyLabel = "None" }: { value: string | null; emptyLabel?: string }) {
  return <span className="zen-action-text">{value === null || value.length === 0 ? emptyLabel : value}</span>;
}

export function ActionsTakenList({
  actions,
  canEdit,
  onEdit,
}: {
  actions: ActionTaken[];
  canEdit: boolean;
  onEdit: (action: ActionTaken, trigger: HTMLButtonElement) => void;
}) {
  return (
    <div className="zen-actions-table-wrap">
      <table className="zen-actions-table">
        <caption className="sr-only">Actions Taken recorded for this Ticket</caption>
        <thead>
          <tr>
            <th scope="col">Action Date/Time</th>
            <th scope="col">Action Description</th>
            <th scope="col">Result</th>
            <th scope="col">Performed by</th>
            <th scope="col">Follow-Up Required?</th>
            <th scope="col">Follow-up Note</th>
            <th scope="col">Attachment Notes</th>
            {canEdit && <th scope="col">Record actions</th>}
          </tr>
        </thead>
        <tbody>
          {actions.map((action) => (
            <tr key={action.id}>
              <td data-label="Action Date/Time">
                <time dateTime={action.actionAt} aria-label={actionDateAccessibleLabel(action.actionAt)}>
                  {formatActionDate(action.actionAt)}
                </time>
                <span className="zen-action-time-zone">{PRODUCT_TIME_ZONE} (UTC+07:00)</span>
              </td>
              <td data-label="Action Description"><ActionText value={action.actionDescription} /></td>
              <td data-label="Result"><ActionText value={action.result} /></td>
              <td data-label="Performed by">
                <strong>{action.performedBy.displayName}</strong>
                <span className="zen-badge zen-badge-role">{roleLabel(action.performedBy.role)}</span>
              </td>
              <td data-label="Follow-Up Required?">
                <span className="zen-action-follow-up" aria-label={`Follow-Up Required: ${action.followUpRequired ? "Yes" : "No"}`}>
                  <span aria-hidden="true">{action.followUpRequired ? "✓" : "—"}</span> {action.followUpRequired ? "Yes" : "No"}
                </span>
              </td>
              <td data-label="Follow-up Note"><ActionText value={action.followUpRequired ? action.followUpNote : null} emptyLabel="—" /></td>
              <td data-label="Attachment Notes"><ActionText value={action.attachmentNotes} /></td>
              {canEdit && (
                <td data-label="Record actions" className="zen-actions-record-cell">
                  <button
                    type="button"
                    className="zen-button zen-button-secondary zen-small-button"
                    onClick={(event) => onEdit(action, event.currentTarget)}
                  >
                    Edit Action Taken
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ActionTakenForm({
  editor,
  form,
  currentUser,
  fieldErrors,
  formError,
  conflict,
  reloadNotice,
  isSaving,
  onChange,
  onSubmit,
  onCancel,
  onReloadLatest,
}: {
  editor: EditorState;
  form: ActionFormValues;
  currentUser?: Pick<AuthUser, "displayName" | "role"> | null;
  fieldErrors: Record<string, string>;
  formError: string | null;
  conflict: boolean;
  reloadNotice: string | null;
  isSaving: boolean;
  onChange: (next: Partial<ActionFormValues>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  onReloadLatest: () => void;
}) {
  const idPrefix = `action-taken-form-${useId().replace(/:/gu, "")}`;
  const performer = editor.action?.performedBy ?? currentUser;
  const isFollowUpNoteVisible = form.followUpRequired;
  const errorFor = (field: string) => fieldErrors[field];
  const describedBy = (field: string, helpId: string) => {
    const error = errorFor(field);
    return error === undefined ? helpId : `${helpId} ${fieldErrorId(idPrefix, field)}`;
  };

  return (
    <section className="zen-action-form-panel" aria-labelledby={`${idPrefix}-heading`}>
      <h3 id={`${idPrefix}-heading`}>
        {editor.mode === "create" ? "Add Action Taken" : "Edit Action Taken"}
      </h3>
      <p className="zen-field-help">
        Record operational work in {PRODUCT_TIME_ZONE}. Performed by is set from the signed-in session and cannot be changed.
      </p>
      {formError !== null && (
        <div className="zen-callout zen-callout-error" role="alert">
          <p>{formError}</p>
          {Object.keys(fieldErrors).length > 0 && <p>Review the highlighted fields before saving.</p>}
        </div>
      )}
      {conflict && (
        <div className="zen-callout zen-callout-warning" role="alert">
          <p>This Action Taken record changed elsewhere; review the latest version before resubmitting.</p>
          <div className="zen-action-row">
            <button type="button" className="zen-button zen-button-secondary zen-small-button" onClick={onReloadLatest} disabled={isSaving}>
              Reload latest
            </button>
            <button type="button" className="zen-button zen-button-secondary zen-small-button" onClick={onCancel} disabled={isSaving}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {reloadNotice !== null && <p className="zen-callout zen-callout-info" role="status">{reloadNotice}</p>}

      <form className="zen-action-taken-form" onSubmit={onSubmit} noValidate aria-busy={isSaving}>
        <div className="zen-action-form-grid">
          <div className="zen-form-field">
            <label htmlFor={`${idPrefix}-action-at`}>Action Date/Time <span className="required-mark">*</span></label>
            <input
              id={`${idPrefix}-action-at`}
              type="datetime-local"
              value={form.actionAt}
              onChange={(event) => onChange({ actionAt: event.target.value })}
              aria-label="Action Date/Time"
              aria-required="true"
              aria-invalid={errorFor("actionAt") !== undefined}
              aria-describedby={describedBy("actionAt", `${idPrefix}-action-at-help`)}
              disabled={isSaving}
              required
            />
            <p id={`${idPrefix}-action-at-help`} className="zen-field-help">Displayed in {PRODUCT_TIME_ZONE} (UTC+07:00); saved as UTC.</p>
            {errorFor("actionAt") !== undefined && <p id={fieldErrorId(idPrefix, "actionAt")} className="zen-field-error" role="alert">{errorFor("actionAt")}</p>}
          </div>

          <div className="zen-action-performer zen-read-only-item">
            <span className="zen-action-performer-label">Performed by</span>
            <div>
              <strong>{performer?.displayName ?? "Current signed-in user"}</strong>
              {performer?.role !== undefined && <span className="zen-badge zen-badge-role">{roleLabel(performer.role)}</span>}
              <span className="zen-field-help">Automatically populated from the current session.</span>
            </div>
          </div>

          <div className="zen-form-field zen-action-form-field-full">
            <label htmlFor={`${idPrefix}-description`}>Action Description <span className="required-mark">*</span></label>
            <textarea
              id={`${idPrefix}-description`}
              className="zen-action-description-input"
              value={form.actionDescription}
              maxLength={2000}
              rows={5}
              placeholder="What was done?"
              onChange={(event) => onChange({ actionDescription: event.target.value })}
              aria-label="Action Description"
              aria-required="true"
              aria-invalid={errorFor("actionDescription") !== undefined}
              aria-describedby={describedBy("actionDescription", `${idPrefix}-description-help`)}
              disabled={isSaving}
              required
            />
            <p id={`${idPrefix}-description-help`} className="zen-field-help">What was done? 1 to 2,000 characters.</p>
            {errorFor("actionDescription") !== undefined && <p id={fieldErrorId(idPrefix, "actionDescription")} className="zen-field-error" role="alert">{errorFor("actionDescription")}</p>}
          </div>

          <div className="zen-form-field zen-action-form-field-full">
            <label htmlFor={`${idPrefix}-result`}>Result <span className="required-mark">*</span></label>
            <textarea
              id={`${idPrefix}-result`}
              value={form.result}
              maxLength={2000}
              rows={4}
              placeholder="What happened as a result?"
              onChange={(event) => onChange({ result: event.target.value })}
              aria-label="Result"
              aria-required="true"
              aria-invalid={errorFor("result") !== undefined}
              aria-describedby={describedBy("result", `${idPrefix}-result-help`)}
              disabled={isSaving}
              required
            />
            <p id={`${idPrefix}-result-help`} className="zen-field-help">What happened as a result? 1 to 2,000 characters.</p>
            {errorFor("result") !== undefined && <p id={fieldErrorId(idPrefix, "result")} className="zen-field-error" role="alert">{errorFor("result")}</p>}
          </div>

          <fieldset className="zen-form-field zen-action-follow-up-field">
            <legend>Follow-Up Required? <span className="required-mark">*</span></legend>
            <label className="zen-switch-label" htmlFor={`${idPrefix}-follow-up-required`}>
              <input
                id={`${idPrefix}-follow-up-required`}
                type="checkbox"
                checked={form.followUpRequired}
                onChange={(event) => onChange({ followUpRequired: event.target.checked, ...(event.target.checked ? {} : { followUpNote: "" }) })}
                aria-label="Follow-Up Required?"
                aria-invalid={errorFor("followUpRequired") !== undefined}
                aria-describedby={errorFor("followUpRequired") === undefined ? `${idPrefix}-follow-up-help` : `${idPrefix}-follow-up-help ${fieldErrorId(idPrefix, "followUpRequired")}`}
                disabled={isSaving}
              />
              <span>{form.followUpRequired ? "Yes" : "No"}</span>
            </label>
            <p id={`${idPrefix}-follow-up-help`} className="zen-field-help">Choose Yes only when another follow-up is required.</p>
            {errorFor("followUpRequired") !== undefined && <p id={fieldErrorId(idPrefix, "followUpRequired")} className="zen-field-error" role="alert">{errorFor("followUpRequired")}</p>}
          </fieldset>

          {isFollowUpNoteVisible && (
            <div className="zen-form-field zen-action-form-field-full">
              <label htmlFor={`${idPrefix}-follow-up-note`}>Follow-up Note <span className="required-mark">*</span></label>
              <textarea
                id={`${idPrefix}-follow-up-note`}
                value={form.followUpNote}
                maxLength={1000}
                rows={3}
                onChange={(event) => onChange({ followUpNote: event.target.value })}
                aria-label="Follow-up Note"
                aria-required="true"
                aria-invalid={errorFor("followUpNote") !== undefined}
                aria-describedby={describedBy("followUpNote", `${idPrefix}-follow-up-note-help`)}
                disabled={isSaving}
                required
              />
              <p id={`${idPrefix}-follow-up-note-help`} className="zen-field-help">Required when Follow-Up Required? is Yes. Maximum 1,000 characters.</p>
              {errorFor("followUpNote") !== undefined && <p id={fieldErrorId(idPrefix, "followUpNote")} className="zen-field-error" role="alert">{errorFor("followUpNote")}</p>}
            </div>
          )}

          <div className="zen-form-field zen-action-form-field-full">
            <label htmlFor={`${idPrefix}-attachment-notes`}>Attachment Notes</label>
            <textarea
              id={`${idPrefix}-attachment-notes`}
              value={form.attachmentNotes}
              maxLength={1000}
              rows={3}
              onChange={(event) => onChange({ attachmentNotes: event.target.value })}
              aria-invalid={errorFor("attachmentNotes") !== undefined}
              aria-describedby={describedBy("attachmentNotes", `${idPrefix}-attachment-notes-help`)}
              disabled={isSaving}
            />
            <p id={`${idPrefix}-attachment-notes-help`} className="zen-field-help">Describe an existing Ticket Attachment to inspect; this does not upload a file.</p>
            {errorFor("attachmentNotes") !== undefined && <p id={fieldErrorId(idPrefix, "attachmentNotes")} className="zen-field-error" role="alert">{errorFor("attachmentNotes")}</p>}
          </div>
        </div>

        <div className="zen-action-row zen-form-actions">
          <button type="submit" className="zen-button zen-button-primary" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Action Taken"}
          </button>
          <button type="button" className="zen-button zen-button-secondary" onClick={onCancel} disabled={isSaving}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}

export default function ActionsTakenSection({
  ticketId,
  mode,
  currentUser,
}: ActionsTakenSectionProps) {
  const canEdit = mode !== "requester";
  const [actions, setActions] = useState<ActionTaken[]>([]);
  const [listState, setListState] = useState<LoadState>("loading");
  const [listError, setListError] = useState<string | null>(null);
  const [listRetry, setListRetry] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [ticketVersion, setTicketVersion] = useState<number | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [form, setForm] = useState<ActionFormValues>(createEmptyActionForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [reloadNotice, setReloadNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const createKeyRef = useRef<string | null>(null);
  const editorTriggerRef = useRef<HTMLButtonElement | null>(null);

  const loadActions = useCallback(async (signal?: AbortSignal) => {
    setListState("loading");
    setListError(null);
    try {
      let page = 1;
      let result = await fetchActionsTaken(ticketId, signal, page, 100);
      const allActions = [...result.data];
      while (
        result.meta.hasNextPage &&
        (result.meta.totalPages === 0 || page < result.meta.totalPages) &&
        page < 100
      ) {
        page += 1;
        result = await fetchActionsTaken(ticketId, signal, page, 100);
        allActions.push(...result.data);
      }
      const completeResult = { ...result, data: allActions };
      setActions(sortActions(allActions));
      setTotalItems(Math.max(result.meta.totalItems, allActions.length));
      setTicketVersion(result.meta.ticketVersion > 0 ? result.meta.ticketVersion : null);
      setListState("success");
      return completeResult;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      setListState("error");
      setListError(safeErrorMessage(error, "Unable to load Actions Taken. Please try again."));
      throw error;
    }
  }, [ticketId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadActions(controller.signal).catch(() => undefined);
    return () => controller.abort();
  }, [listRetry, loadActions]);

  useEffect(() => {
    setEditor(null);
    setConflict(false);
    setFormError(null);
    setFieldErrors({});
    setTotalItems(0);
    createKeyRef.current = null;
  }, [ticketId]);

  function clearFormMessages() {
    setFieldErrors({});
    setFormError(null);
    setConflict(false);
    setReloadNotice(null);
  }

  function openCreate(event?: React.MouseEvent<HTMLButtonElement>) {
    if (!canEdit) return;
    editorTriggerRef.current = event?.currentTarget ?? null;
    clearFormMessages();
    setSuccessMessage(null);
    createKeyRef.current = createIdempotencyKey();
    setForm(createEmptyActionForm());
    setEditor({ mode: "create", action: null });
  }

  function openEdit(action: ActionTaken, trigger: HTMLButtonElement) {
    if (!canEdit) return;
    editorTriggerRef.current = trigger;
    clearFormMessages();
    setSuccessMessage(null);
    createKeyRef.current = null;
    setForm(actionFormFromRecord(action));
    setEditor({ mode: "edit", action });
  }

  function closeEditor() {
    if (isSaving) return;
    setEditor(null);
    clearFormMessages();
    editorTriggerRef.current?.focus();
    editorTriggerRef.current = null;
  }

  function updateForm(next: Partial<ActionFormValues>) {
    setForm((current) => ({ ...current, ...next }));
    setFieldErrors((current) => {
      const updated = { ...current };
      for (const key of Object.keys(next)) delete updated[key];
      return updated;
    });
    setFormError(null);
    setReloadNotice(null);
  }

  function mergeAction(nextAction: ActionTaken) {
    setActions((current) => sortActions([
      ...current.filter((candidate) => candidate.id !== nextAction.id),
      nextAction,
    ]));
  }

  async function refreshAfterMutation() {
    try {
      await loadActions();
    } catch {
      // The successful mutation remains visible locally; the inline list error
      // gives the user a safe retry path for the authoritative refresh.
    }
  }

  async function reloadLatest() {
    setReloadNotice(null);
    try {
      const result = await loadActions();
      if (editor?.mode === "edit" && editor.action !== null) {
        const latest = result.data.find((action) => action.id === editor.action?.id);
        if (latest !== undefined) {
          setEditor((current) => current === null ? current : { ...current, action: latest });
        }
      }
      setConflict(false);
      setReloadNotice("Latest version loaded. Review your draft before saving again.");
    } catch {
      setConflict(true);
    }
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editor === null || isSaving) return;

    const errors = validateForm(form);
    setFieldErrors(errors);
    setFormError(null);
    setReloadNotice(null);
    if (Object.keys(errors).length > 0) {
      setFormError("Please fix the highlighted fields before saving.");
      return;
    }

    const input = toApiInput(form);
    if (input === null) {
      setFieldErrors({ actionAt: "Action Date/Time is required and must be valid." });
      setFormError("Please fix the highlighted fields before saving.");
      return;
    }
    if (ticketVersion === null) {
      setFormError("The latest Ticket version is unavailable. Reload Actions Taken before saving.");
      return;
    }

    setIsSaving(true);
    try {
      const result = editor.mode === "create"
        ? await createActionTaken(
            ticketId,
            input,
            ticketVersion,
            createKeyRef.current ?? (createKeyRef.current = createIdempotencyKey()),
          )
        : editor.action === null
          ? null
          : await updateActionTaken(ticketId, editor.action, input, ticketVersion);

      if (result === null) return;
      mergeAction(result.action);
      setTicketVersion(result.ticketVersion);
      setSuccessMessage(editor.mode === "create" ? "Action Taken added." : "Action Taken updated.");
      setEditor(null);
      clearFormMessages();
      createKeyRef.current = null;
      void refreshAfterMutation();
    } catch (error: unknown) {
      if (error instanceof ApiRequestError) {
        setFieldErrors(error.fields);
        if (error.status === 412 || error.code === "STALE_WRITE") {
          setConflict(true);
          setFormError(null);
          void loadActions().catch(() => undefined);
        } else {
          setFormError(safeErrorMessage(error, "Unable to save Action Taken. Please try again."));
        }
      } else {
        setFormError("Unable to save Action Taken. Please try again.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  const visibleTotalItems = Math.max(totalItems, actions.length);
  const latestAction = actions.length > 0 ? actions[actions.length - 1] : null;
  const headingId = `actions-taken-heading-${ticketId}`;

  return (
    <section className="zen-form-section zen-actions-taken" aria-labelledby={headingId}>
      <div className="zen-actions-taken-heading">
        <div>
          <h2 id={headingId}>Actions Taken</h2>
          <p className="zen-field-help">Operational work recorded for this Ticket</p>
          <p className="zen-actions-summary" aria-live="polite">
            {visibleTotalItems} {visibleTotalItems === 1 ? "Action Taken" : "Actions Taken"}
            {latestAction !== null && <> · Latest: <time dateTime={latestAction.actionAt}>{formatActionDate(latestAction.actionAt)}</time></>}
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            className="zen-button zen-button-primary"
            onClick={(event) => openCreate(event)}
            disabled={listState === "loading" || ticketVersion === null}
          >
            Add Action Taken
          </button>
        )}
      </div>

      {successMessage !== null && <p className="zen-callout zen-callout-info" role="status" aria-live="polite">{successMessage}</p>}

      {editor !== null && canEdit && (
        <ActionTakenForm
          editor={editor}
          form={form}
          currentUser={currentUser}
          fieldErrors={fieldErrors}
          formError={formError}
          conflict={conflict}
          reloadNotice={reloadNotice}
          isSaving={isSaving}
          onChange={updateForm}
          onSubmit={(event) => void submitForm(event)}
          onCancel={closeEditor}
          onReloadLatest={() => void reloadLatest()}
        />
      )}

      {listState === "loading" && actions.length === 0 && (
        <div className="zen-actions-loading" role="status" aria-live="polite" aria-busy="true">
          <span className="zen-spinner" aria-hidden="true" /> Loading Actions Taken...
          <div className="zen-actions-skeleton-list" aria-hidden="true"><span /><span /><span /></div>
        </div>
      )}

      {listState === "error" && (
        <div className="zen-callout zen-callout-error" role="alert">
          <p>{listError ?? "Unable to load Actions Taken."}</p>
          <button type="button" className="zen-button zen-button-secondary zen-small-button" onClick={() => setListRetry((value) => value + 1)}>
            Retry
          </button>
        </div>
      )}

      {listState === "success" && actions.length === 0 && (
        <p className="zen-empty-actions">No Actions Taken have been recorded for this Ticket yet.</p>
      )}

      {actions.length > 0 && (
        <ActionsTakenList actions={actions} canEdit={canEdit} onEdit={openEdit} />
      )}
    </section>
  );
}
