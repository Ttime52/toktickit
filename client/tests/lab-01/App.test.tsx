import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import App from "../../src/App.js";

const authenticatedUser = {
  id: 1,
  displayName: "Lab 1 Requester",
  email: "lab1.requester@example.test",
  role: "REQUESTER",
  isActive: true,
  mustChangePassword: false,
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("App authentication boundary", () => {
  it("renders the TokTickIT heading while checking the current session", () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise(() => undefined)));

    render(<App />);

    expect(screen.getByText(/TokTickIT/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Loading your session" })).toBeInTheDocument();
  });

  it("shows the sign-in boundary when no session exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ error: { code: "AUTHENTICATION_REQUIRED" } }, 401),
      ),
    );

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByText(/Development Requester Selection/iu)).not.toBeInTheDocument();
    expect(screen.queryByText("Check System")).not.toBeInTheDocument();
  });

  it("shows the authenticated requester workspace and current role navigation", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/auth/me")) {
        return jsonResponse({ data: { user: authenticatedUser } });
      }
      if (url.includes("/api/categories") || url.includes("/api/related-systems")) {
        return jsonResponse([]);
      }
      if (url.includes("/api/tickets?")) {
        return jsonResponse({
          data: [],
          meta: {
            page: 1,
            pageSize: 10,
            totalItems: 0,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByRole("heading", { name: "My Tickets" })).toBeInTheDocument();
    expect(screen.getByText(authenticatedUser.displayName)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create Ticket" })).toBeInTheDocument();
    expect(screen.queryByText("Check System")).not.toBeInTheDocument();
  });
});
