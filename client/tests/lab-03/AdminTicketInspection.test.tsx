import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import AdminTicketInspection from "../../src/AdminTicketInspection.js";

const inspection = {
  id: 101,
  ticketNumber: "TT-2026-000101",
  ticketDate: "2026-09-17T05:00:00.000Z",
  requester: { id: 7, displayName: "Narin Example", email: "narin@example.test" },
  category: { id: 2, name: "Hardware" },
  relatedSystem: { id: 4, name: "Corporate Laptop" },
  summary: "Laptop battery drains quickly",
  requestedPriority: "MEDIUM",
  itPriority: "HIGH",
  description: "The laptop battery drops below 20 percent after a short meeting.",
  currentStatus: "IN_PROGRESS",
  ticketOwner: { id: 8, displayName: "Staff Example", role: "IT_STAFF" },
  assignedTo: { id: 8, displayName: "Staff Example", role: "IT_STAFF" },
  assignedAt: "2026-09-17T05:10:00.000Z",
  requesterResolutionIndicatedAt: null,
  createdAt: "2026-09-17T05:00:00.000Z",
  updatedAt: "2026-09-17T05:10:00.000Z",
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Administrator Ticket Inspection (UI-06)", () => {
  it("shows Ticket, Public Comments and Internal Notes without edit or composer controls", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/comments")) {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                id: 11,
                ticketId: 101,
                content: "Public progress update.",
                author: { id: 8, displayName: "Staff Example", role: "IT_STAFF" },
                createdAt: "2026-09-18T05:00:00.000Z",
              },
            ],
          }),
        );
      }
      if (url.endsWith("/internal-notes")) {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                id: 12,
                ticketId: 101,
                content: "Private operational context.",
                author: { id: 8, displayName: "Staff Example", role: "IT_STAFF" },
                createdAt: "2026-09-18T05:01:00.000Z",
              },
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse({ data: inspection }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminTicketInspection ticketId={101} onBack={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "Ticket Inspection" })).toBeInTheDocument();
    expect(screen.getByText("Administrator read-only inspection")).toBeInTheDocument();
    expect(screen.getByText("Public progress update.")).toBeInTheDocument();
    expect(screen.getByText("Private operational context.")).toBeInTheDocument();
    expect(screen.getByText(/Work controls, comment\/note composers/iu)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /post|save|assign|claim|remove/i })).not.toBeInTheDocument();
    expect(calls).toContain("http://localhost:3000/api/tickets/101");
    expect(calls).toContain("http://localhost:3000/api/tickets/101/comments");
    expect(calls).toContain("http://localhost:3000/api/tickets/101/internal-notes");
    expect(calls.some((url) => url.includes("/api/staff/"))).toBe(false);
  });
});
