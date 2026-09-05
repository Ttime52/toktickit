import { useId, useState, type FormEvent } from "react";

import { useRequesterContext } from "./RequesterContext.js";

interface RequesterSelectionProps {
  onContinue?: () => void;
}

export default function RequesterSelection({
  onContinue,
}: RequesterSelectionProps) {
  const {
    requesters,
    loadState,
    errorMessage,
    refreshRequesters,
    selectRequester,
  } = useRequesterContext();
  const [selectedId, setSelectedId] = useState("");
  const [validationMessage, setValidationMessage] = useState<string | null>(
    null,
  );
  const selectId = useId();
  const validationId = `${selectId}-validation`;
  const isLoading = loadState === "loading";
  const hasOptions = loadState === "success" && requesters.length > 0;
  const selectedRequester = requesters.find(
    (requester) => requester.id === Number(selectedId),
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      selectedRequester === undefined ||
      !selectRequester(selectedRequester.id)
    ) {
      setValidationMessage(
        "Select an active Development Requester to continue.",
      );
      return;
    }

    setValidationMessage(null);
    onContinue?.();
  }

  function handleRetry() {
    setValidationMessage(null);
    void refreshRequesters();
  }

  return (
    <main className="zen-page zen-selection-page">
      <section
        className="zen-card zen-selection-card"
      >
        <p className="zen-eyebrow">TokTickIT</p>
        <h1 id="selection-title">Development Requester Selection</h1>
        <p className="zen-lead">
          Select a Development Requester to test requester-specific ticket
          behavior. This is not a login screen.
        </p>

        <div className="zen-callout zen-callout-info">
          Authentication and role-based access arrive in Lab 3. This selector
          is a session-level testing context only.
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="zen-field">
            <label htmlFor={selectId}>
              Development Requester <span className="required-mark">*</span>
            </label>
            <select
              id={selectId}
              aria-label="Development Requester"
              value={selectedId}
              onChange={(event) => {
                setSelectedId(event.target.value);
                setValidationMessage(null);
              }}
              disabled={isLoading || !hasOptions}
              aria-required="true"
              aria-invalid={validationMessage !== null}
              aria-describedby={
                validationMessage !== null ? validationId : undefined
              }
            >
              <option value="">Select a Development Requester</option>
              {requesters.map((requester) => (
                <option key={requester.id} value={requester.id}>
                  {requester.displayName} ({requester.email})
                </option>
              ))}
            </select>
            {validationMessage !== null && (
              <p id={validationId} className="zen-field-error" role="alert">
                <span aria-hidden="true">!</span> {validationMessage}
              </p>
            )}
          </div>

          {isLoading && (
            <p className="zen-status" role="status" aria-live="polite">
              <span className="zen-spinner" aria-hidden="true" />
              Loading Development Requesters…
            </p>
          )}

          {loadState === "empty" && (
            <div className="zen-callout zen-callout-warning" role="status">
              <strong>No active Development Requesters are available.</strong>
              <button
                type="button"
                className="zen-button zen-button-secondary"
                onClick={handleRetry}
              >
                Retry
              </button>
            </div>
          )}

          {loadState === "error" && (
            <div className="zen-callout zen-callout-error" role="alert">
              <strong>
                {errorMessage ?? "Unable to load Development Requesters."}
              </strong>
              <button
                type="button"
                className="zen-button zen-button-secondary"
                onClick={handleRetry}
              >
                Retry
              </button>
            </div>
          )}

          <button
            type="submit"
            className="zen-button zen-button-primary zen-continue-button"
            disabled={
              isLoading || !hasOptions || selectedRequester === undefined
            }
          >
            Continue
          </button>
        </form>
      </section>
    </main>
  );
}
