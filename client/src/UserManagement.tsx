import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import {
  ApiRequestError,
  createAdminUser,
  fetchAdminUsers,
  resetAdminUserPassword,
  updateAdminUser,
  type ManagedUser,
  type UserRole,
} from "./api.js";
import { passwordPolicyError } from "./password-policy.js";

interface UserManagementProps {
  onSessionRefresh?: () => void;
}

type LoadState = "loading" | "success" | "error";
type EditorMode = "create" | "edit";

interface EditorState {
  mode: EditorMode;
  user: ManagedUser | null;
}

interface UserFormState {
  displayName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  initialPassword: string;
  confirmation: string;
  confirmDeactivation: boolean;
}

const ROLES: UserRole[] = ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"];
const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const EMPTY_FORM: UserFormState = {
  displayName: "",
  email: "",
  role: "REQUESTER",
  isActive: true,
  initialPassword: "",
  confirmation: "",
  confirmDeactivation: false,
};

function roleLabel(role: UserRole): string {
  if (role === "IT_STAFF") return "IT Staff";
  if (role === "ADMINISTRATOR") return "Administrator";
  return "Requester";
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function safeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiRequestError && error.status === 403) {
    return "You are not allowed to manage Users.";
  }
  if (!(error instanceof ApiRequestError) || error.message.length === 0) return fallback;
  return /\b(sql|select|insert|update|delete|password|secret|stack|trace|prisma|node_modules)\b/iu.test(
    error.message,
  )
    ? fallback
    : error.message;
}

function isFiltered(search: string, role: "" | UserRole): boolean {
  return search.trim().length > 0 || role !== "";
}

function fieldErrorMessage(error: unknown, field: string): string | null {
  return error instanceof ApiRequestError ? error.fields[field] ?? null : null;
}

export default function UserManagement({ onSessionRefresh }: UserManagementProps) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | UserRole>("");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadStatus, setLoadStatus] = useState(0);
  const [retry, setRetry] = useState(0);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [form, setForm] = useState<UserFormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const editorTriggerRef = useRef<HTMLButtonElement | null>(null);
  const editorRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (editor === null) return;

    const dialog = editorRef.current;
    if (dialog === null) return;
    const dialogElement = dialog;

    const getFocusableElements = () =>
      Array.from(dialogElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.getAttribute("aria-hidden") !== "true",
      );

    getFocusableElements()[0]?.focus();

    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab") return;

      const focusableElements = getFocusableElements();
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

    document.addEventListener("keydown", handleDialogKeyDown);
    return () => document.removeEventListener("keydown", handleDialogKeyDown);
  }, [editor]);

  const queryKey = useMemo(
    () => JSON.stringify({ search: search.trim(), role: roleFilter }),
    [roleFilter, search],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoadState("loading");
    setLoadError(null);
    fetchAdminUsers(
      { search, role: roleFilter === "" ? null : roleFilter },
      controller.signal,
    )
      .then((result) => {
        setUsers(result);
        setLoadState("success");
        setLoadStatus(200);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setLoadState("error");
        setLoadStatus(error instanceof ApiRequestError ? error.status : 0);
        setLoadError(safeErrorMessage(error, "Unable to load User Management. Please try again."));
      });
    return () => controller.abort();
  }, [queryKey, retry]);

  function clearFilters() {
    setSearch("");
    setRoleFilter("");
  }

  function openCreate(trigger?: HTMLButtonElement) {
    if (trigger !== undefined) editorTriggerRef.current = trigger;
    setEditor({ mode: "create", user: null });
    setForm(EMPTY_FORM);
    setFormErrors({});
    setFormError(null);
  }

  function openEdit(user: ManagedUser, trigger?: HTMLButtonElement) {
    if (trigger !== undefined) editorTriggerRef.current = trigger;
    setEditor({ mode: "edit", user });
    setForm({
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      initialPassword: "",
      confirmation: "",
      confirmDeactivation: false,
    });
    setFormErrors({});
    setFormError(null);
  }

  function dismissEditor() {
    const trigger = editorTriggerRef.current;
    setEditor(null);
    setFormErrors({});
    setFormError(null);
    window.setTimeout(() => trigger?.focus(), 0);
  }

  function closeEditor() {
    if (isSaving) return;
    dismissEditor();
  }

  function updateForm<K extends keyof UserFormState>(field: K, value: UserFormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    setFormErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFormError(null);
  }

  function validateBaseForm(): Record<string, string> {
    const errors: Record<string, string> = {};
    const displayName = form.displayName.trim();
    if (displayName.length < 2 || displayName.length > 120) {
      errors.displayName = "Display name must be 2 to 120 characters.";
    }
    const email = form.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
      errors.email = "Enter a valid email address.";
    }
    if (!ROLES.includes(form.role)) errors.role = "Select one valid role.";
    if (
      editor?.mode === "edit" &&
      editor.user?.isActive === true &&
      form.isActive === false &&
      form.confirmDeactivation === false
    ) {
      errors.confirmDeactivation = "Confirm deactivation before saving.";
    }
    return errors;
  }

  function validateInitialPassword(errors: Record<string, string>) {
    const passwordError = passwordPolicyError(form.initialPassword);
    if (passwordError !== null) errors.initialPassword = passwordError;
    if (form.initialPassword !== form.confirmation) {
      errors.confirmation = "Password confirmation must match.";
    }
  }

  function applyApiError(error: unknown, fallback: string) {
    setFormErrors(error instanceof ApiRequestError ? error.fields : {});
    setFormError(safeErrorMessage(error, fallback));
  }

  async function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editor === null || isSaving) return;

    const errors = validateBaseForm();
    if (editor.mode === "create") validateInitialPassword(errors);
    setFormErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setIsSaving(true);
    try {
      if (editor.mode === "create") {
        await createAdminUser({
          displayName: form.displayName.trim(),
          email: form.email.trim(),
          role: form.role,
          isActive: form.isActive,
          initialPassword: form.initialPassword,
        });
        setSuccessMessage("User created successfully. The initial password was not displayed.");
      } else if (editor.user !== null) {
        await updateAdminUser(editor.user.id, {
          displayName: form.displayName.trim(),
          email: form.email.trim(),
          role: form.role,
          isActive: form.isActive,
        });
        setSuccessMessage("User updated successfully.");
      }
      dismissEditor();
      setRetry((value) => value + 1);
      onSessionRefresh?.();
    } catch (error: unknown) {
      applyApiError(error, "Unable to save this User. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function resetPassword() {
    if (editor?.mode !== "edit" || editor.user === null || isSaving) return;
    const errors: Record<string, string> = {};
    validateInitialPassword(errors);
    setFormErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setIsSaving(true);
    try {
      await resetAdminUserPassword(editor.user.id, form.initialPassword);
      setSuccessMessage("Initial password reset successfully. The password was not displayed.");
      dismissEditor();
      setRetry((value) => value + 1);
      onSessionRefresh?.();
    } catch (error: unknown) {
      applyApiError(error, "Unable to reset this User's password. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  function renderFieldError(field: string) {
    const message = formErrors[field];
    return message === undefined ? null : <p id={`admin-user-${field}-error`} className="zen-field-error" role="alert">{message}</p>;
  }

  function renderUserStatus(user: ManagedUser) {
    return (
      <span className={`zen-user-status ${user.isActive ? "is-active" : "is-inactive"}`}>
        {user.isActive ? "Active" : "Inactive"}
      </span>
    );
  }

  return (
    <div className="zen-user-management" aria-labelledby="user-management-title">
      <header className="zen-list-heading zen-user-management-heading">
        <div>
          <p className="zen-eyebrow">Administrator workspace</p>
          <h1 id="user-management-title">User Management</h1>
          <p className="zen-lead">Create and maintain one-role accounts for Requesters, IT Staff and Administrators.</p>
        </div>
        <button type="button" className="zen-button zen-button-primary" onClick={(event) => openCreate(event.currentTarget)}>Create User</button>
      </header>

      {successMessage !== null && (
        <div className="zen-callout zen-callout-info" role="status" aria-live="polite">
          {successMessage}
        </div>
      )}

      <section className="zen-user-toolbar" aria-label="User filters">
        <div className="zen-list-field zen-list-search">
          <label htmlFor="admin-user-search">Search Users</label>
          <input id="admin-user-search" type="search" value={search} maxLength={100} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div className="zen-list-field">
          <label htmlFor="admin-user-role-filter">Role</label>
          <select id="admin-user-role-filter" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as "" | UserRole)}>
            <option value="">All roles</option>
            {ROLES.map((role) => <option value={role} key={role}>{roleLabel(role)}</option>)}
          </select>
        </div>
        <button type="button" className="zen-button zen-button-secondary zen-clear-filters" onClick={clearFilters} disabled={!isFiltered(search, roleFilter)}>Clear Filters</button>
      </section>

      {loadState === "error" ? (
        <section className={`zen-callout ${loadStatus === 403 ? "zen-callout-warning" : "zen-callout-error"}`} role="alert">
          <p>{loadError ?? "Unable to load User Management."}</p>
          <button type="button" className="zen-button zen-button-secondary" onClick={() => setRetry((value) => value + 1)}>Retry</button>
        </section>
      ) : loadState === "loading" ? (
        <section className="zen-ticket-skeleton" aria-busy="true" aria-live="polite">
          <div className="zen-status" role="status"><span className="zen-spinner" aria-hidden="true" /> Loading Users...</div>
          <span /><span /><span /><span />
        </section>
      ) : users.length === 0 ? (
        <section className="zen-empty-panel" role="status">
          <h2>{isFiltered(search, roleFilter) ? "No Users match these filters" : "No Users yet"}</h2>
          <p>{isFiltered(search, roleFilter) ? "Try a different search or clear the filters." : "Create the first User to get started."}</p>
          {!isFiltered(search, roleFilter) && <button type="button" className="zen-button zen-button-primary" onClick={(event) => openCreate(event.currentTarget)}>Create User</button>}
        </section>
      ) : (
        <section className="zen-user-results" aria-live="polite">
          <div className="zen-user-table-wrap">
            <table className="zen-user-table">
              <caption className="zen-visually-hidden">TokTickIT users</caption>
              <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Edit</th></tr></thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td><strong>{user.displayName}</strong></td>
                    <td>{user.email}</td>
                    <td><span className={`zen-role-badge zen-role-${user.role.toLowerCase()}`}>{roleLabel(user.role)}</span></td>
                    <td>{renderUserStatus(user)}</td>
                    <td><button type="button" className="zen-button zen-button-secondary zen-small-button" onClick={(event) => openEdit(user, event.currentTarget)}>Edit {user.displayName}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="zen-user-card-list">
            {users.map((user) => (
              <article className="zen-user-card" key={user.id}>
                <h2>{user.displayName}</h2>
                <dl>
                  <div><dt>Email</dt><dd>{user.email}</dd></div>
                  <div><dt>Role</dt><dd>{roleLabel(user.role)}</dd></div>
                  <div><dt>Status</dt><dd>{renderUserStatus(user)}</dd></div>
                </dl>
                <button type="button" className="zen-button zen-button-secondary" onClick={(event) => openEdit(user, event.currentTarget)}>Edit {user.displayName}</button>
              </article>
            ))}
          </div>
        </section>
      )}

      {editor !== null && (
        <div className="zen-dialog-backdrop zen-user-drawer-backdrop" role="presentation">
          <aside ref={editorRef} className="zen-user-drawer" role="dialog" aria-modal="true" aria-labelledby="user-editor-title">
            <div className="zen-user-drawer-heading">
              <div>
                <p className="zen-eyebrow">Administrator action</p>
                <h2 id="user-editor-title">{editor.mode === "create" ? "Create User" : "Edit User"}</h2>
              </div>
              <button type="button" className="zen-button zen-button-secondary" onClick={closeEditor} disabled={isSaving}>Close</button>
            </div>
            <p className="zen-field-help">User passwords are never displayed or returned after save.</p>
            {formError !== null && <div className="zen-callout zen-callout-error" role="alert">{formError}</div>}
            <form onSubmit={(event) => void saveUser(event)} noValidate>
              <div className="zen-form-field">
                <label htmlFor="admin-user-display-name">Display Name <span className="required-mark">*</span></label>
                <input id="admin-user-display-name" value={form.displayName} onChange={(event) => updateForm("displayName", event.target.value)} aria-invalid={formErrors.displayName !== undefined} aria-describedby={formErrors.displayName !== undefined ? "admin-user-displayName-error" : undefined} disabled={isSaving} required />
                {renderFieldError("displayName")}
              </div>
              <div className="zen-form-field">
                <label htmlFor="admin-user-email">Email <span className="required-mark">*</span></label>
                <input id="admin-user-email" type="email" value={form.email} onChange={(event) => updateForm("email", event.target.value)} aria-invalid={formErrors.email !== undefined} aria-describedby={formErrors.email !== undefined ? "admin-user-email-error" : undefined} disabled={isSaving} required />
                {renderFieldError("email")}
              </div>
              <div className="zen-form-field">
                <label htmlFor="admin-user-role">Role <span className="required-mark">*</span></label>
                <select id="admin-user-role" value={form.role} onChange={(event) => updateForm("role", event.target.value as UserRole)} aria-invalid={formErrors.role !== undefined} aria-describedby={formErrors.role !== undefined ? "admin-user-role-error" : undefined} disabled={isSaving} required>
                  {ROLES.map((role) => <option value={role} key={role}>{roleLabel(role)}</option>)}
                </select>
                {renderFieldError("role")}
              </div>
              <div className="zen-form-field zen-user-activation-field">
                <span className="zen-form-label">Account status <span className="required-mark">*</span></span>
                <label className="zen-switch-label" htmlFor="admin-user-active">
                  <input id="admin-user-active" type="checkbox" checked={form.isActive} onChange={(event) => updateForm("isActive", event.target.checked)} aria-invalid={formErrors.isActive !== undefined} aria-describedby={formErrors.isActive !== undefined ? "admin-user-isActive-error" : undefined} disabled={isSaving} />
                  <span>{form.isActive ? "Active" : "Inactive"}</span>
                </label>
                <p className="zen-field-help">The selected activation state is saved explicitly.</p>
                {formErrors.isActive !== undefined && renderFieldError("isActive")}
              </div>
              {editor.mode === "edit" && editor.user?.isActive === true && !form.isActive && (
                <div className="zen-callout zen-callout-warning">
                  <label className="zen-confirmation-check" htmlFor="admin-confirm-deactivation">
                    <input id="admin-confirm-deactivation" type="checkbox" checked={form.confirmDeactivation} onChange={(event) => updateForm("confirmDeactivation", event.target.checked)} aria-invalid={formErrors.confirmDeactivation !== undefined} aria-describedby={formErrors.confirmDeactivation !== undefined ? "admin-user-confirmDeactivation-error" : undefined} disabled={isSaving} />
                    I confirm that this account should be deactivated.
                  </label>
                  {renderFieldError("confirmDeactivation")}
                </div>
              )}
              {editor.mode === "create" && (
                <>
                  <div className="zen-form-field">
                    <label htmlFor="admin-user-initial-password">Initial Password <span className="required-mark">*</span></label>
                    <input id="admin-user-initial-password" type="password" autoComplete="new-password" value={form.initialPassword} onChange={(event) => updateForm("initialPassword", event.target.value)} aria-invalid={formErrors.initialPassword !== undefined} aria-describedby={formErrors.initialPassword !== undefined ? "admin-user-initialPassword-error" : undefined} disabled={isSaving} required />
                    {renderFieldError("initialPassword")}
                  </div>
                  <div className="zen-form-field">
                    <label htmlFor="admin-user-confirm-password">Confirm Initial Password <span className="required-mark">*</span></label>
                    <input id="admin-user-confirm-password" type="password" autoComplete="new-password" value={form.confirmation} onChange={(event) => updateForm("confirmation", event.target.value)} aria-invalid={formErrors.confirmation !== undefined} aria-describedby={formErrors.confirmation !== undefined ? "admin-user-confirmation-error" : undefined} disabled={isSaving} required />
                    {renderFieldError("confirmation")}
                  </div>
                  <p className="zen-field-help">12–128 characters with uppercase, lowercase, number and special character.</p>
                </>
              )}
              <div className="zen-action-row zen-user-form-actions">
                <button type="submit" className="zen-button zen-button-primary" disabled={isSaving}>{isSaving ? "Saving..." : editor.mode === "create" ? "Create User" : "Save User"}</button>
                <button type="button" className="zen-button zen-button-secondary" onClick={closeEditor} disabled={isSaving}>Cancel</button>
              </div>
            </form>

            {editor.mode === "edit" && editor.user !== null && (
              <section className="zen-user-reset-section" aria-labelledby="reset-password-title">
                <h3 id="reset-password-title">Reset Initial Password</h3>
                <p className="zen-field-help">The User must change this password at the next login. Existing sessions will be revoked.</p>
                <div className="zen-form-field">
                  <label htmlFor="admin-user-reset-password">New Initial Password</label>
                  <input id="admin-user-reset-password" type="password" autoComplete="new-password" value={form.initialPassword} onChange={(event) => updateForm("initialPassword", event.target.value)} aria-invalid={formErrors.initialPassword !== undefined} aria-describedby={formErrors.initialPassword !== undefined ? "admin-user-initialPassword-error" : undefined} disabled={isSaving} />
                  {renderFieldError("initialPassword")}
                </div>
                <div className="zen-form-field">
                  <label htmlFor="admin-user-reset-confirm-password">Confirm New Initial Password</label>
                  <input id="admin-user-reset-confirm-password" type="password" autoComplete="new-password" value={form.confirmation} onChange={(event) => updateForm("confirmation", event.target.value)} aria-invalid={formErrors.confirmation !== undefined} aria-describedby={formErrors.confirmation !== undefined ? "admin-user-confirmation-error" : undefined} disabled={isSaving} />
                  {renderFieldError("confirmation")}
                </div>
                <p className="zen-field-help">12–128 characters with uppercase, lowercase, number and special character.</p>
                <button type="button" className="zen-button zen-button-secondary" onClick={() => void resetPassword()} disabled={isSaving}>Reset Initial Password</button>
              </section>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
