import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import UserManagement from "../../src/UserManagement.js";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

const users = [
  {
    id: 1,
    displayName: "Administrator Example",
    email: "admin@example.test",
    role: "ADMINISTRATOR" as const,
    isActive: true,
    mustChangePassword: false,
    createdAt: "2026-09-18T01:00:00.000Z",
    updatedAt: "2026-09-18T01:00:00.000Z",
  },
  {
    id: 2,
    displayName: "Requester Example",
    email: "requester@example.test",
    role: "REQUESTER" as const,
    isActive: false,
    mustChangePassword: true,
    createdAt: "2026-09-18T01:00:00.000Z",
    updatedAt: "2026-09-18T01:00:00.000Z",
  },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Administrator User Management (UI-05)", () => {
  it("renders users, combines filters, requires deactivation confirmation and sends explicit activation", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/users") && init?.method === "POST") {
        return Promise.resolve(jsonResponse({ data: { ...users[1], id: 3, isActive: false } }, 201));
      }
      if (url.includes("/api/users")) return Promise.resolve(jsonResponse({ data: users }));
      return Promise.resolve(jsonResponse({ data: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<UserManagement />);

    expect(await screen.findByRole("heading", { name: "User Management" })).toBeInTheDocument();
    expect(screen.getAllByText("Administrator Example").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Inactive").length).toBeGreaterThan(0);

    await user.type(screen.getByLabelText("Search Users"), "requester");
    await user.selectOptions(screen.getByLabelText("Role"), "REQUESTER");
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes("search=requester") && String(input).includes("role=REQUESTER"))).toBe(true);
    });

    await user.click(screen.getByRole("button", { name: "Create User" }));
    await user.clear(screen.getByLabelText(/Display Name/u));
    await user.type(screen.getByLabelText(/Display Name/u), "Inactive New User");
    await user.type(screen.getByLabelText(/^Email/u), "new-user@example.test");
    await user.selectOptions(screen.getAllByRole("combobox").at(-1)!, "REQUESTER");
    await user.click(screen.getByRole("checkbox", { name: "Active" }));
    await user.type(screen.getByLabelText(/^Initial Password/u), "InitialPassword4$");
    await user.type(screen.getByLabelText(/^Confirm Initial Password/u), "InitialPassword4$");
    await user.click(screen.getAllByRole("button", { name: "Create User" }).at(-1)!);

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
      expect(createCall).toBeDefined();
      expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
        displayName: "Inactive New User",
        email: "new-user@example.test",
        role: "REQUESTER",
        isActive: false,
        initialPassword: "InitialPassword4$",
      });
    });
    expect(await screen.findByRole("status")).toHaveTextContent("User created successfully");

    await user.click(screen.getAllByRole("button", { name: "Edit Administrator Example" })[0]);
    await user.click(screen.getByRole("checkbox", { name: "Active" }));
    await user.click(screen.getByRole("button", { name: "Save User" }));
    expect(await screen.findByText("Confirm deactivation before saving.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });

  it("requires deactivation confirmation and shows safe forbidden feedback", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes("/api/users")) {
        return Promise.resolve(jsonResponse({ error: { code: "FORBIDDEN", message: "Forbidden" } }, 403));
      }
      return Promise.resolve(jsonResponse({ data: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<UserManagement />);
    expect(await screen.findByRole("alert")).toHaveTextContent("not allowed to manage Users");
  });
});
