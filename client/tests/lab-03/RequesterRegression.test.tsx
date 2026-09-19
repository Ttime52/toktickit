import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import TicketDetail from "../../src/TicketDetail.js";

const baseTicket = {
  id: 101,
  ticketNumber: "TT-2026-000101",
  ticketDate: "2026-09-17T05:00:00.000Z",
  requester: { id: 7, displayName: "Narin Example", email: "narin@example.test" },
  category: { id: 2, name: "Hardware" },
  relatedSystem: { id: 4, name: "Corporate Laptop" },
  summary: "Laptop battery drains quickly",
  requestedPriority: "MEDIUM",
  itPriority: "MEDIUM",
  description: "The laptop battery drops below 20 percent after a short meeting.",
  currentStatus: "IN_PROGRESS",
  requesterResolutionIndicatedAt: null,
  attachments: [],
  createdAt: "2026-09-17T05:00:00.000Z",
  updatedAt: "2026-09-17T05:00:00.000Z",
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

describe("Requester Ticket Detail regression (UI-02)", () => {
  it("shows Public Comments and sends a non-resolving indication without requesterId", async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push([url, init]);

      if (url.endsWith("/comments") && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse({
            data: {
              id: 12,
              ticketId: 101,
              content: "Requester update",
              author: { id: 7, displayName: "Narin Example", role: "REQUESTER" },
              createdAt: "2026-09-19T05:00:00.000Z",
            },
          }),
        );
      }
      if (url.endsWith("/comments")) {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                id: 11,
                ticketId: 101,
                content: "IT Staff reply",
                author: { id: 8, displayName: "Staff Example", role: "IT_STAFF" },
                createdAt: "2026-09-18T05:00:00.000Z",
              },
            ],
          }),
        );
      }
      if (url.includes("problem-appears-resolved")) {
        return Promise.resolve(
          jsonResponse({
            data: {
              ...baseTicket,
              requesterResolutionIndicatedAt: "2026-09-19T05:01:00.000Z",
            },
          }),
        );
      }
      return Promise.resolve(jsonResponse({ data: baseTicket }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<TicketDetail ticketId={101} />);

    expect(await screen.findByRole("heading", { name: "Public Comments" })).toBeInTheDocument();
    expect(screen.getByText("IT Staff reply")).toBeInTheDocument();
    expect(screen.queryByText(/Internal Notes/i)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Add a Public Comment"), "Requester update");
    await user.click(screen.getByRole("button", { name: "Post Public Comment" }));
    expect(await screen.findByText("Requester update")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Problem Appears Resolved" }));
    await user.click(screen.getByRole("button", { name: "Confirm indication" }));
    expect(await screen.findByText(/Indication sent to IT Staff/)).toBeInTheDocument();
    expect(screen.getByText(/formal Ticket status remains In Progress/)).toBeInTheDocument();

    expect(calls.every(([url]) => !url.includes("requesterId"))).toBe(true);
  });
});
