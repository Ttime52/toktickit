import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import StaffTicketDetail from "../../src/StaffTicketDetail.js";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

const ticket = {
  id: 101,
  version: 1,
  ticketNumber: "TT-2026-000101",
  ticketDate: "2026-10-07T02:00:00.000Z",
  requester: { id: 7, displayName: "Requester Example", email: "requester@example.test" },
  category: { id: 1, name: "Hardware" },
  relatedSystem: { id: 1, name: "Laptop" },
  summary: "Laptop will not start",
  description: "The device shows no power.",
  requestedPriority: "MEDIUM",
  itPriority: "MEDIUM",
  currentStatus: "IN_PROGRESS",
  ticketOwner: { id: 8, displayName: "Staff Example", role: "IT_STAFF" },
  assignedTo: { id: 8, displayName: "Staff Example", role: "IT_STAFF" },
  requesterResolutionIndicatedAt: null,
  resolutionSummary: null,
  closureSummary: null,
  cancelReason: null,
  reopenReason: null,
  attachments: [],
  publicComments: [],
  internalNotes: [],
  createdAt: "2026-10-07T02:00:00.000Z",
  updatedAt: "2026-10-07T02:00:00.000Z",
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Ticket workflow final regression", () => {
  it("requires evidence and confirmation before a formal Resolved transition", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/staff/tickets/101")) return Promise.resolve(jsonResponse({ data: ticket }));
      if (url.endsWith("/api/staff/users")) return Promise.resolve(jsonResponse({ data: [{ id: 8, displayName: "Staff Example", email: "staff@example.test", role: "IT_STAFF", isActive: true }] }));
      if (url.includes("/api/tickets/101/actions")) return Promise.resolve(jsonResponse({ data: [], meta: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false, ticketVersion: 1 } }));
      return Promise.resolve(jsonResponse({ data: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(
      <StaffTicketDetail
        ticketId={101}
        onBack={vi.fn()}
        currentUser={{ displayName: "Staff Example", role: "IT_STAFF" }}
      />,
    );

    await screen.findByRole("heading", { name: "Ticket Detail" });
    await user.selectOptions(screen.getByLabelText("Current Status"), "RESOLVED");
    const dialog = await screen.findByRole("dialog", { name: "Confirm status change" });
    expect(screen.getByLabelText(/Resolution Summary/iu)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm", exact: true })).toBeDisabled();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);

    await user.keyboard("{Escape}");
    expect(dialog).not.toBeInTheDocument();
    expect(screen.getByLabelText("Current Status")).toHaveValue("IN_PROGRESS");
  });
});
