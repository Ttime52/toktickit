import { useId, useState, type FormEvent } from "react";

import { ApiRequestError } from "./api.js";
import { useAuth } from "./AuthContext.js";

export default function Login() {
  const { login } = useAuth();
  const emailId = useId();
  const passwordId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim();
    const nextEmailError =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalizedEmail)
        ? null
        : "Enter a valid email address.";
    const nextPasswordError = password.length === 0 ? "Password is required." : null;
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setFormError(null);
    if (nextEmailError !== null || nextPasswordError !== null) return;

    setIsSubmitting(true);
    try {
      await login(normalizedEmail, password);
    } catch (error) {
      const apiError = error instanceof ApiRequestError ? error : null;
      setFormError(
        apiError?.status === 429
          ? "Too many sign-in attempts. Please try again later."
          : "Unable to sign in with those details. Check your email and password and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="zen-page" aria-labelledby="login-title">
      <section className="zen-card zen-auth-card">
        <p className="zen-eyebrow">TokTickIT</p>
        <h1 id="login-title">Sign in</h1>
        <p className="zen-lead">Use your TokTickIT account to continue.</p>
        <form onSubmit={handleSubmit} noValidate>
          {formError !== null && (
            <div className="zen-callout zen-callout-error" role="alert">
              {formError}
            </div>
          )}
          <div className="zen-form-field">
            <label htmlFor={emailId}>
              Email <span className="required-mark">*</span>
            </label>
            <input
              id={emailId}
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={emailError !== null}
              aria-describedby={emailError !== null ? `${emailId}-error` : undefined}
              disabled={isSubmitting}
              required
            />
            {emailError !== null && (
              <p className="zen-field-error" id={`${emailId}-error`}>
                {emailError}
              </p>
            )}
          </div>
          <div className="zen-form-field">
            <label htmlFor={passwordId}>
              Password <span className="required-mark">*</span>
            </label>
            <div className="zen-password-control">
              <input
                id={passwordId}
                name="password"
                type={passwordVisible ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={passwordError !== null}
                aria-describedby={passwordError !== null ? `${passwordId}-error` : undefined}
                disabled={isSubmitting}
                required
              />
              <button
                type="button"
                className="zen-text-button zen-password-toggle"
                aria-label={passwordVisible ? "Hide password" : "Show password"}
                onClick={() => setPasswordVisible((visible) => !visible)}
                disabled={isSubmitting}
              >
                {passwordVisible ? "Hide" : "Show"}
              </button>
            </div>
            {passwordError !== null && (
              <p className="zen-field-error" id={`${passwordId}-error`}>
                {passwordError}
              </p>
            )}
          </div>
          <button
            type="submit"
            className="zen-button zen-button-primary zen-continue-button"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
          {isSubmitting && (
            <p className="zen-status" role="status" aria-live="polite">
              <span className="zen-spinner" aria-hidden="true" /> Signing in…
            </p>
          )}
        </form>
      </section>
    </main>
  );
}
