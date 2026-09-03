import { useRef, useState, type ReactNode } from "react";

export type AppPage = "my-tickets" | "create-ticket";

interface ApplicationShellProps {
  currentPage: AppPage;
  requesterName: string;
  onNavigate: (page: AppPage) => void;
  onChangeRequester: () => void;
  children: ReactNode;
}

export default function ApplicationShell({
  currentPage,
  requesterName,
  onNavigate,
  onChangeRequester,
  children,
}: ApplicationShellProps) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  function navigate(page: AppPage) {
    onNavigate(page);
    setNavigationOpen(false);
    menuButtonRef.current?.focus();
  }

  return (
    <div className="zen-app">
      <header className="zen-header">
        <div className="zen-header-inner">
          <a
            className="zen-brand"
            href="/my-tickets"
            onClick={(event) => {
              event.preventDefault();
              navigate("my-tickets");
            }}
          >
            TokTickIT
          </a>

          <button
            type="button"
            className="zen-menu-button"
            ref={menuButtonRef}
            aria-label="Open navigation"
            aria-expanded={navigationOpen}
            onClick={() => setNavigationOpen((open) => !open)}
          >
            <span aria-hidden="true">☰</span>
          </button>

          <nav
            className={`zen-nav${navigationOpen ? " is-open" : ""}`}
            aria-label="Primary navigation"
          >
            <a
              href="/my-tickets"
              aria-current={currentPage === "my-tickets" ? "page" : undefined}
              className={currentPage === "my-tickets" ? "is-active" : ""}
              onClick={(event) => {
                event.preventDefault();
                navigate("my-tickets");
              }}
            >
              My Tickets
            </a>
            <a
              href="/create-ticket"
              aria-current={currentPage === "create-ticket" ? "page" : undefined}
              className={currentPage === "create-ticket" ? "is-active" : ""}
              onClick={(event) => {
                event.preventDefault();
                navigate("create-ticket");
              }}
            >
              Create Ticket
            </a>
          </nav>

          <div className="zen-requester-context">
            <span>
              Development Requester: <strong>{requesterName}</strong>
            </span>
            <button
              type="button"
              className="zen-change-button"
              onClick={onChangeRequester}
            >
              Change Requester
            </button>
          </div>
        </div>
      </header>
      <main className="zen-shell-content">{children}</main>
    </div>
  );
}
