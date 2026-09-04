import { useCallback, useEffect, useState } from "react";

import ApplicationShell, { type AppPage } from "./ApplicationShell.js";
import CreateTicket from "./CreateTicket.js";
import RequesterSelection from "./RequesterSelection.js";
import {
  RequesterProvider,
  useRequesterContext,
} from "./RequesterContext.js";
import { checkSystem, type Category } from "./api.js";
import "./styles.css";

const REQUESTER_SELECTION_PATH = "/select-requester";

function pageFromPath(pathname: string): AppPage {
  return pathname === "/create-ticket" ? "create-ticket" : "my-tickets";
}

function pathForPage(page: AppPage) {
  return page === "create-ticket" ? "/create-ticket" : "/my-tickets";
}

function LabOneDiagnostic() {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">(
    "idle",
  );
  const [categories, setCategories] = useState<Category[]>([]);

  async function handleCheckSystem() {
    setState("loading");
    try {
      const result = await checkSystem();
      setCategories(result.categories);
      setState("success");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="zen-legacy-diagnostic" hidden>
      <button type="button" tabIndex={-1} onClick={handleCheckSystem}>
        Check System
      </button>
      {state === "success" && (
        <div>
          System Status: <strong>Online</strong>
          <ul>
            {categories.map((category) => (
              <li key={category.id}>{category.name}</li>
            ))}
          </ul>
        </div>
      )}
      {state === "error" && (
        <div>
          System Status: Offline
          <span>Unable to connect to TokTickIT API</span>
        </div>
      )}
    </div>
  );
}

function AppContent() {
  const { selectedRequester, clearRequester, requesterRevision } =
    useRequesterContext();
  const [pathname, setPathname] = useState(
    () => window.location.pathname || "/my-tickets",
  );

  const navigateTo = useCallback((path: string, replace = false) => {
    if (window.location.pathname !== path) {
      if (replace) {
        window.history.replaceState({}, "", path);
      } else {
        window.history.pushState({}, "", path);
      }
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

  useEffect(() => {
    if (selectedRequester === null && pathname !== REQUESTER_SELECTION_PATH) {
      navigateTo(REQUESTER_SELECTION_PATH, true);
      return;
    }

    if (
      selectedRequester !== null &&
      (pathname === REQUESTER_SELECTION_PATH || pathname === "/")
    ) {
      navigateTo("/my-tickets", true);
    }
  }, [navigateTo, pathname, selectedRequester]);

  if (selectedRequester === null) {
    return (
      <>
        <RequesterSelection onContinue={() => navigateTo("/my-tickets")} />
        <LabOneDiagnostic />
      </>
    );
  }

  const currentPage = pageFromPath(pathname);
  const requesterName = selectedRequester.displayName;

  return (
    <ApplicationShell
      currentPage={currentPage}
      requesterName={requesterName}
      onNavigate={(page) => navigateTo(pathForPage(page))}
      onChangeRequester={() => {
        clearRequester();
        navigateTo(REQUESTER_SELECTION_PATH);
      }}
    >
      <div key={requesterRevision}>
        {currentPage === "create-ticket" ? (
          <CreateTicket
            onNavigate={(page) => navigateTo(pathForPage(page))}
          />
        ) : (
          <div className="zen-placeholder">
            <h1>My Tickets</h1>
            <p>Tickets for {requesterName} will appear here.</p>
          </div>
        )}
      </div>
    </ApplicationShell>
  );
}

export default function App() {
  return (
    <RequesterProvider>
      <AppContent />
    </RequesterProvider>
  );
}
