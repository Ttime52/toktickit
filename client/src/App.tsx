import { useCallback, useEffect, useState } from "react";

import ApplicationShell, { type AppPage } from "./ApplicationShell.js";
import { AuthProvider, useAuth } from "./AuthContext.js";
import ChangePassword from "./ChangePassword.js";
import CreateTicket from "./CreateTicket.js";
import Login from "./Login.js";
import MyTickets from "./MyTickets.js";
import StaffTicketQueue from "./StaffTicketQueue.js";
import StaffTicketDetail from "./StaffTicketDetail.js";
import TicketDetail from "./TicketDetail.js";
import "./styles.css";

function pageFromPath(pathname: string): AppPage {
  if (pathname === "/create-ticket") return "create-ticket";
  if (pathname === "/staff/tickets") return "staff-queue";
  if (/^\/staff\/tickets\/[1-9]\d*$/u.test(pathname)) return "staff-ticket-detail";
  if (/^\/tickets\/[1-9]\d*$/u.test(pathname)) return "ticket-detail";
  return "my-tickets";
}

function pathForPage(page: AppPage): string {
  if (page === "staff-queue") return "/staff/tickets";
  return page === "create-ticket" ? "/create-ticket" : "/my-tickets";
}

function ticketIdFromPath(pathname: string): number | null {
  const match = /^\/tickets\/([1-9]\d*)$/u.exec(pathname);
  if (match === null) return null;
  const ticketId = Number(match[1]);
  return Number.isSafeInteger(ticketId) ? ticketId : null;
}

function staffTicketIdFromPath(pathname: string): number | null {
  const match = /^\/staff\/tickets\/([1-9]\d*)$/u.exec(pathname);
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

function ForbiddenState({ area }: { area: string }) {
  return (
    <section className="zen-empty-panel" aria-labelledby="forbidden-title">
      <p className="zen-eyebrow">Access restricted</p>
      <h1 id="forbidden-title">You cannot view {area}</h1>
      <p>Your account is not permitted to access this screen.</p>
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
  const staffTicketId = staffTicketIdFromPath(pathname);

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
        (currentPage === "staff-queue" || currentPage === "staff-ticket-detail") && user.role !== "IT_STAFF" ? (
          <ForbiddenState
            area={currentPage === "staff-ticket-detail" ? "the IT Staff Ticket Detail" : "the IT Staff Ticket Queue"}
          />
        ) : user.role === "IT_STAFF" && currentPage === "staff-queue" ? (
          <StaffTicketQueue onOpenTicket={(openedTicketId) => navigateTo(`/staff/tickets/${openedTicketId}`)} />
        ) : user.role === "IT_STAFF" && currentPage === "staff-ticket-detail" && staffTicketId !== null ? (
          <StaffTicketDetail
            ticketId={staffTicketId}
            onBack={() => navigateTo("/staff/tickets")}
          />
        ) : (
          <RoleLanding role={user.role === "IT_STAFF" ? "IT Staff" : "Administrator"} />
        )
      ) : (
        currentPage === "staff-queue" || currentPage === "staff-ticket-detail" ? (
          <ForbiddenState area="the IT Staff Ticket Queue" />
        ) : <div>
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
              onNavigate={() => navigateTo("/my-tickets")}
            />
          ) : (
            <MyTickets
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
