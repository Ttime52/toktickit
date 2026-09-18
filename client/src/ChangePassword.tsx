import { useId, useMemo, useState, type FormEvent } from "react";

import { ApiRequestError } from "./api.js";
import { useAuth } from "./AuthContext.js";

const PASSWORD_RULES = [
  { label: "12–128 characters", test: (value: string) => value.length >= 12 && value.length <= 128 },
  { label: "One uppercase letter", test: (value: string) => /[A-Z]/u.test(value) },
  { label: "One lowercase letter", test: (value: string) => /[a-z]/u.test(value) },
  { label: "One number", test: (value: string) => /[0-9]/u.test(value) },
  { label: "One special character", test: (value: string) => /[^A-Za-z0-9]/u.test(value) },
];

export default function ChangePassword({ voluntary = false }: { voluntary?: boolean }) {
  const { changePassword, logout, user } = useAuth();
  const currentId = useId();
  const newId = useId();
  const confirmId = useId();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const ruleState = useMemo(
    () => PASSWORD_RULES.map((rule) => ({ ...rule, valid: rule.test(newPassword) })),
    [newPassword],
  );

  function validate(): string | null {
    if (currentPassword.length === 0) return "Enter your current password.";
    if (ruleState.some((rule) => !rule.valid)) {
      return "New password does not meet all password rules.";
    }
    if (newPassword !== confirmation) return "New password and confirmation must match.";
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(null);
    setFormError(null);
    setSuccessMessage(null);
    const validationError = validate();
    if (validationError !== null) {
      setFieldError(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      setSuccessMessage("Password changed. You can now use TokTickIT.");
    } catch (error) {
      const apiError = error instanceof ApiRequestError ? error : null;
      const serverFieldError = apiError?.fields.newPassword;
      setFormError(
        serverFieldError ??
          (apiError?.status === 401
            ? "Your current password is incorrect."
            : "Unable to change your password. Please try again."),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="zen-page" aria-labelledby="change-password-title">
      <section className="zen-card zen-auth-card">
        <p className="zen-eyebrow">TokTickIT</p>
        <h1 id="change-password-title">
          {voluntary ? "Change password" : "Change your password"}
        </h1>
        <p className="zen-lead">
          {voluntary
            ? `Update the password for ${user?.email ?? "your account"}.`
            : "Your account needs a new password before you can continue."}
        </p>
        <form onSubmit={handleSubmit} noValidate>
          {formError !== null && (
            <div className="zen-callout zen-callout-error" role="alert">
              {formError}
            </div>
          )}
          {successMessage !== null && (
            <div className="zen-callout zen-callout-info" role="status">
              {successMessage}
            </div>
          )}
          <div className="zen-form-field">
            <label htmlFor={currentId}>Current password <span className="required-mark">*</span></label>
            <input id={currentId} type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} disabled={isSubmitting} required />
          </div>
          <div className="zen-form-field">
            <label htmlFor={newId}>New password <span className="required-mark">*</span></label>
            <input id={newId} type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} aria-invalid={fieldError !== null} disabled={isSubmitting} required />
          </div>
          <ul className="zen-password-rules" aria-label="Password rules">
            {ruleState.map((rule) => (
              <li key={rule.label} className={rule.valid ? "is-valid" : ""}>
                <span aria-hidden="true">{rule.valid ? "✓" : "○"}</span> {rule.label}
              </li>
            ))}
          </ul>
          <div className="zen-form-field">
            <label htmlFor={confirmId}>Confirm new password <span className="required-mark">*</span></label>
            <input id={confirmId} type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} aria-invalid={fieldError !== null && confirmation !== newPassword} disabled={isSubmitting} required />
          </div>
          {fieldError !== null && <p className="zen-field-error" role="alert">{fieldError}</p>}
          <div className="zen-action-row zen-auth-actions">
            <button type="submit" className="zen-button zen-button-primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Change password"}
            </button>
            <button type="button" className="zen-button zen-button-secondary" onClick={() => void logout()} disabled={isSubmitting}>
              Logout
            </button>
          </div>
          {isSubmitting && <p className="zen-status" role="status" aria-live="polite"><span className="zen-spinner" aria-hidden="true" /> Saving…</p>}
        </form>
      </section>
    </main>
  );
}
