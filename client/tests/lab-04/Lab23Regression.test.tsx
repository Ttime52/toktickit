import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import TicketDetail from "../../src/TicketDetail.js";

const ticket = {
  id: 801,
  version: 1,
  ticketNumber: "TT-2026-000801",
  ticketDate: "2026-10-10T02:00:00.000Z",
  requester: { id: 21, displayName: "Regression Requester", email: "requester@example.test" },
  category: { id: 1, name: "Hardware" },
  relatedSystem: { id: 1, name: "Corporate Laptop" },
  summary: "Lab 2/3 regression Ticket",
  requestedPriority: "MEDIUM",
  itPriority: "MEDIUM",
  description: "Current-schema Ticket Detail regression fixture.",
  currentStatus: "IN_PROGRESS",
  requesterResolutionIndicatedAt: null,
  attachments: [
    {
      id: 901,
      ticketId: 801,
      originalFilename: "regression-evidence.png",
      mimeType: "image/png",
      sizeBytes: 68,
      uploadedAt: "2026-10-10T02:01:00.000Z",
      state: "active",
      removedAt: null,
      removalReason: null,
      unavailableAt: null,
      unavailableReason: null,
      previewable: true,
      downloadUrl: "/api/tickets/801/attachments/901/download",
    },
  ],
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

describe("Lab 2/3 current-schema UI regression", () => {
  it("keeps Ticket Detail ownership, Attachments, Public Comments, and private Notes boundaries", async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push([url, init]);

      if (url.endsWith("/comments") && method === "POST") {
        return Promise.resolve(jsonResponse({
          data: {
            id: 902,
            ticketId: 801,
            content: "Requester regression comment.",
            author: { id: 21, displayName: "Regression Requester", role: "REQUESTER" },
            createdAt: "2026-10-10T02:02:00.000Z",
          },
        }, 201));
      }
      if (url.endsWith("/comments")) {
        return Promise.resolve(jsonResponse({
          data: [{
            id: 903,
            ticketId: 801,
            content: "Staff regression reply.",
            author: { id: 22, displayName: "Regression Staff", role: "IT_STAFF" },
            createdAt: "2026-10-10T02:01:30.000Z",
          }],
        }));
      }
      if (url.includes("/actions")) {
        return Promise.resolve(jsonResponse({
          data: [],
          meta: {
            page: 1,
            pageSize: 100,
            totalItems: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: false,
            ticketVersion: 1,
          },
        }));
      }
      return Promise.resolve(jsonResponse({ data: ticket }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(
      <TicketDetail
        ticketId={801}
        currentUser={{ displayName: "Regression Requester", role: "REQUESTER" }}
      />,
    );

    expect(await screen.findByText("regression-evidence.png", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Staff regression reply.", { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Internal Notes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Action Taken", exact: true })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Add a Public Comment"), "Requester regression comment.");
    await user.click(screen.getByRole("button", { name: "Post Public Comment", exact: true }));
    expect(await screen.findByText("Requester regression comment.", { exact: true })).toBeInTheDocument();
    expect(calls.every(([url]) => !url.includes("requesterId"))).toBe(true);
  });
});
