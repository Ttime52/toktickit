import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import TicketDetail from "../../src/TicketDetail.js";
import type { Ticket, TicketAttachment } from "../../src/api.js";

const activeAttachment: TicketAttachment = {
  id: 501,
  ticketId: 101,
  originalFilename: "battery-photo.png",
  mimeType: "image/png",
  sizeBytes: 8,
  uploadedAt: "2026-09-03T13:05:00.000Z",
  state: "active",
  removedAt: null,
  unavailableAt: null,
  unavailableReason: null,
  removalReason: null,
  previewable: true,
  downloadUrl:
    "/api/tickets/101/attachments/501/download?requesterId=1",
};

const ticket: Ticket = {
  id: 101,
  ticketNumber: "TT-2026-000101",
  ticketDate: "2026-09-03T13:00:00.000Z",
  requester: {
    id: 1,
    displayName: "Arun Chaiyasit",
    email: "arun@example.test",
  },
  category: { id: 2, name: "Hardware" },
  relatedSystem: { id: 7, name: "Corporate Laptop" },
  summary: "Laptop battery drains quickly",
  requestedPriority: "HIGH",
  itPriority: null,
  description: "The laptop battery drains within an hour during normal use.",
  currentStatus: "NEW",
  attachments: [activeAttachment],
  createdAt: "2026-09-03T13:00:00.000Z",
  updatedAt: "2026-09-03T13:05:00.000Z",
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

function renderDetail() {
  return render(
    <TicketDetail
      ticketId={ticket.id}
      requesterId={ticket.requester.id}
      onNavigate={vi.fn()}
    />,
  );
}

function mockDetailApi(options?: {
  detailStatus?: number;
  detailBody?: unknown;
  uploadBody?: TicketAttachment;
  removeBody?: TicketAttachment;
}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (method === "GET" && url.includes("/api/tickets/101?requesterId=1")) {
      return jsonResponse(
        options?.detailBody ?? { data: ticket },
        options?.detailStatus ?? 200,
      );
    }

    if (method === "POST" && url.includes("/api/tickets/101/attachments")) {
      return jsonResponse({
        data:
          options?.uploadBody ?? {
            ...activeAttachment,
            id: 502,
            originalFilename: "new-file.png",
          },
      }, 201);
    }

    if (method === "DELETE" && url.includes("/api/tickets/101/attachments/501")) {
      return jsonResponse({
        data:
          options?.removeBody ?? {
            ...activeAttachment,
            state: "removed",
            removedAt: "2026-09-03T13:10:00.000Z",
            removalReason: "Uploaded the wrong screenshot",
            previewable: false,
            downloadUrl: null,
          },
      });
    }

    throw new Error(`Unexpected fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Requester Ticket Detail (UI-13/UI-14/UI-15)", () => {
  it("renders owned read-only Ticket fields and state-aware Attachment actions", async () => {
    const removedAttachment: TicketAttachment = {
      ...activeAttachment,
      id: 502,
      originalFilename: "old-file.pdf",
      mimeType: "application/pdf",
      state: "removed",
      removedAt: "2026-09-03T13:08:00.000Z",
      removalReason: "Duplicate upload",
      previewable: false,
      downloadUrl: null,
    };
    mockDetailApi({
      detailBody: { data: { ...ticket, attachments: [activeAttachment, removedAttachment] } },
    });
    renderDetail();

    expect(await screen.findByRole("heading", { name: "Ticket Detail" })).toBeInTheDocument();
    expect(screen.getByText(ticket.ticketNumber)).toBeInTheDocument();
    expect(screen.getByText(ticket.summary)).toBeInTheDocument();
    expect(screen.getByText(ticket.description)).toBeInTheDocument();
    expect(screen.getByText("Arun Chaiyasit")).toBeInTheDocument();
    expect(screen.getByText("Hardware")).toBeInTheDocument();
    expect(screen.getByText("Corporate Laptop")).toBeInTheDocument();

    const ticketInfo = screen.getByRole("region", { name: "Ticket information" });
    expect(within(ticketInfo).getByText("Ticket Number")).toBeInTheDocument();
    expect(within(ticketInfo).getByText("Current Status")).toBeInTheDocument();
    expect(ticketInfo.querySelectorAll("input, select, textarea")).toHaveLength(0);

    expect(screen.getByRole("link", { name: "Preview" })).toHaveAttribute(
      "href",
      expect.stringContaining(
        "/api/tickets/101/attachments/501/download?requesterId=1&disposition=inline",
      ),
    );
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute(
      "download",
      "battery-photo.png",
    );
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      expect.not.stringContaining("disposition=inline"),
    );
    expect(screen.getByText("old-file.pdf")).toBeInTheDocument();
    expect(screen.getAllByText("Download unavailable")).toHaveLength(1);
    expect(screen.queryByText("Public Comments")).not.toBeInTheDocument();
    expect(screen.queryByText("Internal Notes")).not.toBeInTheDocument();
    expect(screen.queryByText("Actions Taken")).not.toBeInTheDocument();
  });

  it("validates a selected file and uploads a permitted file to the owned Ticket", async () => {
    const fetchMock = mockDetailApi();
    const user = userEvent.setup({ applyAccept: false });
    renderDetail();
    await screen.findByText(ticket.ticketNumber);

    const input = screen.getByLabelText("Add Attachment");
    const invalidFile = new File(["not an image"], "notes.txt", {
      type: "text/plain",
    });
    await user.upload(input, invalidFile);
    expect(
      await screen.findByText(/Allowed formats are JPG, JPEG, PNG, WEBP, and PDF/iu),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);

    const validFile = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      "new-file.png",
      { type: "image/png" },
    );
    await user.upload(input, validFile);
    expect(await screen.findByText("new-file.png")).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    });
  });

  it("requires a reason and soft-removes an Attachment without losing its metadata", async () => {
    const fetchMock = mockDetailApi();
    const user = userEvent.setup();
    renderDetail();
    await screen.findByText(ticket.ticketNumber);

    await user.click(screen.getByRole("button", { name: "Remove" }));
    const dialog = screen.getByRole("dialog", { name: "Remove Attachment?" });
    await user.click(within(dialog).getByRole("button", { name: "Remove Attachment" }));
    expect(
      await within(dialog).findByText("Enter a removal reason from 3 to 200 characters."),
    ).toBeInTheDocument();

    await user.type(
      within(dialog).getByLabelText(/Removal reason/iu),
      "  Uploaded the wrong screenshot  ",
    );
    await user.click(within(dialog).getByRole("button", { name: "Remove Attachment" }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input, init]) =>
        String(input).includes("/api/tickets/101/attachments/501?requesterId=1") &&
        init?.method === "DELETE" &&
        String(init.body).includes("Uploaded the wrong screenshot"),
      )).toBe(true);
    });
    expect(await screen.findByText(/Uploaded the wrong screenshot/iu)).toBeInTheDocument();
    expect(screen.getByText("Download unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Download" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Preview" })).not.toBeInTheDocument();
  });

  it("shows a safe actionable ownership error without Ticket data", async () => {
    mockDetailApi({
      detailStatus: 403,
      detailBody: {
        error: {
          code: "OWNERSHIP_FORBIDDEN",
          message: "This Ticket is not available for the selected Requester.",
        },
      },
    });
    renderDetail();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This Ticket is not available for the selected Requester.");
    expect(alert).toHaveTextContent("Retry");
    expect(screen.queryByText(ticket.summary)).not.toBeInTheDocument();
    expect(screen.queryByText("SQL password")).not.toBeInTheDocument();
  });
});
