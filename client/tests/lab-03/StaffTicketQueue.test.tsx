import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import StaffTicketQueue from "../../src/StaffTicketQueue.js";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

const queueRow = {
  id: 101,
  ticketNumber: "TT-2026-000101",
  ticketDate: "2026-09-18T01:00:00.000Z",
  summary: "Battery issue",
  category: { id: 1, name: "Hardware" },
  relatedSystem: { id: 1, name: "Laptop" },
  requester: { id: 7, displayName: "Narin Requester", email: "narin@example.test" },
  ticketOwner: { id: 8, displayName: "Staff Example", role: "IT_STAFF" },
  assignedTo: { id: 8, displayName: "Staff Example", role: "IT_STAFF" },
  requestedPriority: "HIGH",
  itPriority: "URGENT",
  currentStatus: "IN_PROGRESS",
  requesterResolutionIndicatedAt: null,
  attachmentCount: 1,
  updatedAt: "2026-09-18T01:10:00.000Z",
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("IT Staff Ticket Queue (UI-03)", () => {
  it("renders queue fields, filters, pagination and opens a Ticket", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/categories")) {
        return Promise.resolve(jsonResponse([{ id: 1, name: "Hardware" }]));
      }
      if (url.includes("/api/related-systems")) {
        return Promise.resolve(jsonResponse([{ id: 1, name: "Laptop" }]));
      }
      return Promise.resolve(
        jsonResponse({
          data: [queueRow],
          meta: {
            page: 1,
            pageSize: 10,
            totalItems: 1,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        }),
      );
    });
    const onOpenTicket = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<StaffTicketQueue onOpenTicket={onOpenTicket} />);

    expect(await screen.findByRole("heading", { name: "Ticket Queue" })).toBeInTheDocument();
    expect(screen.getAllByText("Narin Requester").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Staff Example").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Urgent").length).toBeGreaterThan(0);
    expect(screen.getAllByText("In Progress").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Assignment")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search Tickets"), "battery");
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes("search=battery"))).toBe(true);
    });
    await user.click(screen.getAllByRole("button", { name: "Open TT-2026-000101" })[0]);
    expect(onOpenTicket).toHaveBeenCalledWith(101);
  });

  it("shows a safe forbidden state when the backend denies the queue", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        Promise.resolve(
          String(input).includes("/api/staff/tickets")
            ? jsonResponse({ error: { code: "FORBIDDEN", message: "You are not allowed to perform this action." } }, 403)
            : jsonResponse([]),
        ),
      ),
    );

    render(<StaffTicketQueue />);
    expect(await screen.findByRole("alert")).toHaveTextContent("not allowed to view the IT Staff Ticket Queue");
  });
});
