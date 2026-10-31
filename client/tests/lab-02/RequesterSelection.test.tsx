import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import App from "../../src/App.js";

const authenticatedUser = {
  id: 11,
  displayName: "Session Requester",
  email: "session.requester@example.test",
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
  window.history.replaceState({}, "", "/my-tickets");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Session-based requester replacement (UI-01)", () => {
  it("shows a loading session state before choosing a route", () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise(() => undefined)));

    render(<App />);

    expect(screen.getByRole("heading", { name: "Loading your session" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Checking authentication");
  });

  it("renders the login form instead of a requester selector after an unauthenticated response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ error: { code: "AUTHENTICATION_REQUIRED" } }, 401),
      ),
    );

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByText(/Development Requester Selection/iu)).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /Requester/iu })).not.toBeInTheDocument();
  });

  it("uses the current session identity for My Tickets and navigation", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/auth/me")) return jsonResponse({ data: { user: authenticatedUser } });
      if (url.includes("/api/categories")) return jsonResponse([]);
      if (url.includes("/api/related-systems")) return jsonResponse([]);
      if (url.includes("/api/tickets?")) {
        return jsonResponse({
          data: [],
          meta: {
            page: 1,
            pageSize: 10,
            totalItems: 0,
            totalPages: 0,
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
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("development-requesters"))).toBe(false);
    expect(screen.getByRole("link", { name: "Create Ticket" })).toBeInTheDocument();
  });
});
