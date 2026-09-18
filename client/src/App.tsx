import { useCallback, useEffect, useState } from "react";

import ApplicationShell, { type AppPage } from "./ApplicationShell.js";
import { AuthProvider, useAuth } from "./AuthContext.js";
import ChangePassword from "./ChangePassword.js";
import CreateTicket from "./CreateTicket.js";
import Login from "./Login.js";
import MyTickets from "./MyTickets.js";
import TicketDetail from "./TicketDetail.js";
import "./styles.css";

function pageFromPath(pathname: string): AppPage {
  if (pathname === "/create-ticket") return "create-ticket";
  if (/^\/tickets\/[1-9]\d*$/u.test(pathname)) return "ticket-detail";
  return "my-tickets";
}

function pathForPage(page: AppPage): string {
  return page === "create-ticket" ? "/create-ticket" : "/my-tickets";
}

function ticketIdFromPath(pathname: string): number | null {
  const match = /^\/tickets\/([1-9]\d*)$/u.exec(pathname);
  if (match === null) return null;
  const ticketId = Number(match[1]);
  return Number.isSafeInteger(ticketId) ? ticketId : null;
}

function SessionLoading() {
  return (
    <main className="zen-page" aria-labelledby="session-loading-title">
      <section className="zen-card zen-auth-card">
        <p className="zen-eyebrow">TokTickIT</p>
        <h1 id="session-loading-title">Loading your session</h1>
        <p className="zen-status" role="status" aria-live="polite">
          <span className="zen-spinner" aria-hidden="true" /> Checking authentication…
        </p>
      </section>
    </main>
  );
}

function RoleLanding({ role }: { role: string }) {
  return (
    <section className="zen-placeholder" aria-labelledby="role-landing-title">
      <p className="zen-eyebrow">Authenticated application</p>
      <h1 id="role-landing-title">Your {role} workspace</h1>
      <p>
        Your role navigation is ready. The operational screen for this role is
        delivered in the next Issue.
      </p>
    </section>
  );
}

function AuthenticatedApp() {
  const { user, logout } = useAuth();
  const [pathname, setPathname] = useState(
    () => window.location.pathname || "/my-tickets",
  );
  const [showChangePassword, setShowChangePassword] = useState(false);

  const navigateTo = useCallback((path: string, replace = false) => {
    if (window.location.pathname !== path) {
      if (replace) window.history.replaceState({}, "", path);
      else window.history.pushState({}, "", path);
    }
    setPathname(path);
  }, []);

  useEffect(() => {
    function handlePopState() {
      setPathname(window.location.pathname || "/my-tickets");
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  if (user === null) return null;
  if (user.mustChangePassword) return <ChangePassword />;

  const currentPage = pageFromPath(pathname);
  const ticketId = ticketIdFromPath(pathname);

  return (
    <ApplicationShell
      currentPage={currentPage}
      user={user}
      onNavigate={(page) => navigateTo(pathForPage(page))}
      onChangePassword={() => setShowChangePassword(true)}
      onLogout={() => {
        void logout();
      }}
    >
      {showChangePassword ? (
        <ChangePassword voluntary />
      ) : user.role !== "REQUESTER" ? (
        <RoleLanding role={user.role === "IT_STAFF" ? "IT Staff" : "Administrator"} />
      ) : (
        <div>
          {currentPage === "create-ticket" ? (
            <CreateTicket
              requester={user}
              onNavigate={(page) => navigateTo(pathForPage(page))}
              onViewTicket={(createdTicketId) =>
                navigateTo(`/tickets/${createdTicketId}`)
              }
            />
          ) : currentPage === "ticket-detail" && ticketId !== null ? (
            <TicketDetail
              ticketId={ticketId}
              requesterId={user.id}
              onNavigate={() => navigateTo("/my-tickets")}
            />
          ) : (
            <MyTickets
              requesterId={user.id}
              requesterName={user.displayName}
              onNavigate={(page) => navigateTo(pathForPage(page))}
              onOpenTicket={(openedTicketId) =>
                navigateTo(`/tickets/${openedTicketId}`)
              }
            />
          )}
        </div>
      )}
    </ApplicationShell>
  );
}

function AppRouter() {
  const { state } = useAuth();
  if (state === "loading") return <SessionLoading />;
  if (state === "unauthenticated") return <Login />;
  return <AuthenticatedApp />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
