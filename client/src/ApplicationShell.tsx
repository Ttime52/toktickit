import { useRef, useState, type ReactNode } from "react";

import type { AuthUser, UserRole } from "./api.js";

export type AppPage = "my-tickets" | "create-ticket" | "ticket-detail";

interface ApplicationShellProps {
  currentPage: AppPage;
  user: AuthUser;
  onNavigate: (page: AppPage) => void;
  onChangePassword: () => void;
  onLogout: () => void;
  children: ReactNode;
}

function roleLabel(role: UserRole): string {
  if (role === "IT_STAFF") return "IT Staff";
  if (role === "ADMINISTRATOR") return "Administrator";
  return "Requester";
}

export default function ApplicationShell({
  currentPage,
  user,
  onNavigate,
  onChangePassword,
  onLogout,
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
            {user.role === "REQUESTER" ? (
              <>
                <a
                  href="/my-tickets"
                  aria-current={
                    currentPage === "my-tickets" || currentPage === "ticket-detail"
                      ? "page"
                      : undefined
                  }
                  className={
                    currentPage === "my-tickets" || currentPage === "ticket-detail"
                      ? "is-active"
                      : ""
                  }
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
              </>
            ) : user.role === "IT_STAFF" ? (
              <a href="/staff/tickets">Ticket Queue</a>
            ) : (
              <a href="/admin/users">User Management</a>
            )}
          </nav>

          <div className="zen-user-context">
            <span className="zen-user-identity">
              <strong>{user.displayName}</strong>
              <span>{user.email}</span>
            </span>
            <span className={`zen-role-badge zen-role-${user.role.toLowerCase()}`}>
              {roleLabel(user.role)}
            </span>
            <button
              type="button"
              className="zen-change-button"
              onClick={onChangePassword}
            >
              Change Password
            </button>
            <button
              type="button"
              className="zen-change-button"
              onClick={onLogout}
            >
              Logout
            </button>
          </div>
        </div>
      </header>
      <main className="zen-shell-content">{children}</main>
    </div>
  );
}
