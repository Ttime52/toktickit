import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import StaffTicketDetail from "../../src/StaffTicketDetail.js";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

const detail = {
  id: 101,
  ticketNumber: "TT-2026-000101",
  ticketDate: "2026-09-18T01:00:00.000Z",
  summary: "Battery issue",
  description: "The staff needs to investigate the battery.",
  category: { id: 1, name: "Hardware" },
  relatedSystem: { id: 1, name: "Laptop" },
  requester: { id: 7, displayName: "Narin Requester", email: "narin@example.test" },
  ticketOwner: { id: 8, displayName: "Staff Example", role: "IT_STAFF" },
  assignedTo: { id: 8, displayName: "Staff Example", role: "IT_STAFF" },
  requestedPriority: "MEDIUM",
  itPriority: "HIGH",
  currentStatus: "IN_PROGRESS",
  requesterResolutionIndicatedAt: null,
  attachmentCount: 1,
  attachments: [
    {
      id: 9,
      ticketId: 101,
      originalFilename: "evidence.pdf",
      mimeType: "application/pdf",
      sizeBytes: 128,
      uploadedAt: "2026-09-18T01:05:00.000Z",
      state: "active",
      removedAt: null,
      unavailableAt: null,
      unavailableReason: null,
      removalReason: null,
      previewable: true,
      downloadUrl: "/api/tickets/101/attachments/9/download",
    },
  ],
  publicComments: [
    {
      id: 1,
      ticketId: 101,
      content: "Requester-visible update.",
      author: { id: 7, displayName: "Narin Requester", role: "REQUESTER" },
      createdAt: "2026-09-18T01:06:00.000Z",
    },
  ],
  internalNotes: [
    {
      id: 2,
      ticketId: 101,
      content: "Private triage context.",
      author: { id: 8, displayName: "Staff Example", role: "IT_STAFF" },
      createdAt: "2026-09-18T01:07:00.000Z",
    },
  ],
  createdAt: "2026-09-18T01:00:00.000Z",
  updatedAt: "2026-09-18T01:10:00.000Z",
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("IT Staff Ticket Detail (UI-04)", () => {
  it("keeps Ticket core read-only, exposes work controls and separates communications", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/staff/tickets/101") && init?.method === "PATCH") {
        return Promise.resolve(jsonResponse({ data: { ...detail, currentStatus: "WAITING_FOR_REQUESTER" } }));
      }
      if (url.includes("/api/staff/tickets/101")) return Promise.resolve(jsonResponse({ data: detail }));
      if (url.includes("/api/staff/users")) {
        return Promise.resolve(jsonResponse({ data: [
          { id: 8, displayName: "Staff Example", role: "IT_STAFF" },
          { id: 12, displayName: "Administrator Example", role: "ADMINISTRATOR" },
        ] }));
      }
      if (url.includes("/api/tickets/101/comments")) {
        return Promise.resolve(jsonResponse({ data: {
          id: 3,
          ticketId: 101,
          content: "Staff public update.",
          author: { id: 8, displayName: "Staff Example", role: "IT_STAFF" },
          createdAt: "2026-09-18T01:12:00.000Z",
        } }, 201));
      }
      if (url.includes("/api/tickets/101/internal-notes")) {
        return Promise.resolve(jsonResponse({ data: {
          id: 4,
          ticketId: 101,
          content: "Another private note.",
          author: { id: 8, displayName: "Staff Example", role: "IT_STAFF" },
          createdAt: "2026-09-18T01:13:00.000Z",
        } }, 201));
      }
      return Promise.resolve(jsonResponse({ data: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<StaffTicketDetail ticketId={101} onBack={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "Ticket Detail" })).toBeInTheDocument();
    expect(screen.getByText("Requested Priority")).toBeInTheDocument();
    expect(screen.getByText("Public Comments")).toBeInTheDocument();
    expect(screen.getByText("Internal Notes")).toBeInTheDocument();
    expect(screen.getByText("Private triage context.")).toBeInTheDocument();
    expect(screen.getByLabelText("Ticket Owner")).toBeInTheDocument();
    expect(screen.getByLabelText("IT Priority")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Current Status"), "WAITING_FOR_REQUESTER");
    await user.click(screen.getByRole("button", { name: "Save Work Changes" }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input, init]) => String(input).includes("/api/staff/tickets/101") && init?.method === "PATCH")).toBe(true);
    });
    const patchCall = fetchMock.mock.calls.find(([input, init]) => String(input).includes("/api/staff/tickets/101") && init?.method === "PATCH");
    expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({ currentStatus: "WAITING_FOR_REQUESTER" });

    await user.type(screen.getByLabelText("Add a Public Comment"), "Staff public update.");
    await user.click(screen.getByRole("button", { name: "Post Public Comment" }));
    await waitFor(() => expect(screen.getByText("Staff public update.")).toBeInTheDocument());

    await user.type(screen.getByLabelText("Add an Internal Note"), "Another private note.");
    await user.click(screen.getByRole("button", { name: "Post Internal Note" }));
    await waitFor(() => expect(screen.getByText("Another private note.")).toBeInTheDocument());
  });

  it("requires explicit confirmation before formal Resolved/Closed transitions", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/staff/tickets/101") && init?.method === "PATCH") {
        return Promise.resolve(jsonResponse({ data: { ...detail, currentStatus: "RESOLVED" } }));
      }
      if (url.includes("/api/staff/tickets/101")) return Promise.resolve(jsonResponse({ data: detail }));
      if (url.includes("/api/staff/users")) return Promise.resolve(jsonResponse({ data: [{ id: 8, displayName: "Staff Example", role: "IT_STAFF" }] }));
      return Promise.resolve(jsonResponse({ data: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<StaffTicketDetail ticketId={101} onBack={vi.fn()} />);
    await screen.findByRole("heading", { name: "Ticket Detail" });

    await user.selectOptions(screen.getByLabelText("Current Status"), "RESOLVED");
    expect(screen.getByText("I confirm this formal Resolved transition.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Work Changes" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Save Work Changes" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true));
    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({
      currentStatus: "RESOLVED",
      confirmStatusChange: true,
    });
  });
});
