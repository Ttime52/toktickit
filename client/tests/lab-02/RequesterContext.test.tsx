import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import App from "../../src/App.js";

const requester = {
  id: 1,
  displayName: "Arun Chaiyasit",
  email: "arun.chaiyasit@example.test",
  role: "REQUESTER",
  isActive: true,
  mustChangePassword: false,
};

const staff = {
  id: 2,
  displayName: "Narin IT Staff",
  email: "narin.staff@example.test",
  role: "IT_STAFF",
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

function mockSession(user: typeof requester | typeof staff) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/auth/me")) return jsonResponse({ data: { user } });
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
    if (url.includes("/api/staff/tickets?")) {
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
  return fetchMock;
}

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/my-tickets");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Authenticated User context and role navigation (UI-02)", () => {
  it("shows the sign-in boundary when no authenticated session exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ error: { code: "AUTHENTICATION_REQUIRED" } }, 401),
      ),
    );

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password/)).toBeInTheDocument();
  });

  it("restores the authenticated requester and keeps ownership in the session boundary", async () => {
    mockSession(requester);

    render(<App />);

    expect(await screen.findByRole("heading", { name: "My Tickets" })).toBeInTheDocument();
    expect(screen.getByText(requester.displayName)).toBeInTheDocument();
    expect(screen.getByText("Requester")).toBeInTheDocument();
    expect(screen.queryByText(/Development Requester/iu)).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /Requester/iu })).not.toBeInTheDocument();
  });

  it("does not expose requester screens to an IT Staff session", async () => {
    mockSession(staff);

    render(<App />);

    expect(await screen.findByRole("heading", { name: /You cannot view Requester Ticket screens/iu })).toBeInTheDocument();
    expect(screen.getByText(staff.displayName)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ticket Queue" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Create Ticket" })).not.toBeInTheDocument();
  });
});
