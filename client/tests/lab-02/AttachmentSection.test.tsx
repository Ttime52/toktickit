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

const MAX_FILE_BYTES = 5 * 1024 * 1024;

function makeAttachment(
  overrides: Partial<TicketAttachment> = {},
): TicketAttachment {
  return {
    id: 801,
    ticketId: 701,
    originalFilename: "active-proof.png",
    mimeType: "image/png",
    sizeBytes: 8,
    uploadedAt: "2026-09-05T08:05:00.000Z",
    state: "active",
    removedAt: null,
    unavailableAt: null,
    unavailableReason: null,
    removalReason: null,
    previewable: true,
    downloadUrl:
      "/api/tickets/701/attachments/801/download?requesterId=7",
    ...overrides,
  };
}

const activeAttachment = makeAttachment();

const removedAttachment = makeAttachment({
  id: 802,
  originalFilename: "removed-proof.pdf",
  mimeType: "application/pdf",
  state: "removed",
  removedAt: "2026-09-05T08:10:00.000Z",
  removalReason: "Duplicate upload",
  previewable: false,
  downloadUrl: null,
});

const unavailableAttachment = makeAttachment({
  id: 803,
  originalFilename: "unavailable-proof.jpg",
  mimeType: "image/jpeg",
  state: "unavailable",
  unavailableAt: "2026-09-05T08:11:00.000Z",
  unavailableReason: "The stored bytes are unavailable.",
  previewable: false,
  downloadUrl: null,
});

const ticket: Ticket = {
  id: 701,
  ticketNumber: "TT-2026-000701",
  ticketDate: "2026-09-05T08:00:00.000Z",
  requester: {
    id: 7,
    displayName: "Narin Sutham",
    email: "narin.sutham@example.test",
  },
  category: { id: 2, name: "Hardware" },
  relatedSystem: { id: 7, name: "Corporate Laptop" },
  summary: "The development laptop cannot connect to the office display.",
  requestedPriority: "MEDIUM",
  itPriority: null,
  description:
    "The laptop detects the display intermittently and loses the connection during normal use.",
  currentStatus: "NEW",
  attachments: [activeAttachment],
  createdAt: "2026-09-05T08:00:00.000Z",
  updatedAt: "2026-09-05T08:05:00.000Z",
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

function renderDetail(detail: Ticket = ticket) {
  render(
    <TicketDetail
      ticketId={detail.id}
      requesterId={detail.requester.id}
      onNavigate={vi.fn()}
    />,
  );
  return detail;
}

function getAttachmentRow(filename: string): HTMLElement {
  const row = screen.getByText(filename, { exact: true }).closest("li");
  if (row === null) throw new Error(`Attachment row not found: ${filename}`);
  return row;
}

function mockAttachmentApi(options: {
  detail?: Ticket;
  upload?: TicketAttachment;
  remove?: TicketAttachment;
} = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (method === "GET" && url.includes("/api/tickets/701?requesterId=7")) {
      return jsonResponse({ data: options.detail ?? ticket });
    }

    if (method === "POST" && url.includes("/api/tickets/701/attachments")) {
      return jsonResponse(
        {
          data:
            options.upload ??
            makeAttachment({
              id: 804,
              originalFilename: "new-proof.png",
            }),
        },
        201,
      );
    }

    if (method === "DELETE" && url.includes("/api/tickets/701/attachments/801")) {
      return jsonResponse({
        data:
          options.remove ??
          makeAttachment({
            state: "removed",
            removedAt: "2026-09-05T08:12:00.000Z",
            removalReason: "Duplicate upload",
            previewable: false,
            downloadUrl: null,
          }),
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

describe("Attachment section", () => {
  it("renders active, removed, and unavailable rows with state-appropriate actions", async () => {
    const detail = {
      ...ticket,
      attachments: [activeAttachment, removedAttachment, unavailableAttachment],
    };
    mockAttachmentApi({ detail });
    renderDetail(detail);

    await screen.findByText(ticket.ticketNumber);

    const activeRow = getAttachmentRow("active-proof.png");
    expect(within(activeRow).getByText("Active", { exact: true })).toBeInTheDocument();
    expect(within(activeRow).getByRole("link", { name: "Preview" })).toHaveAttribute(
      "href",
      expect.stringContaining("disposition=inline"),
    );
    expect(within(activeRow).getByRole("link", { name: "Download" })).toHaveAttribute(
      "download",
      "active-proof.png",
    );
    expect(within(activeRow).getByRole("button", { name: "Remove" })).toBeInTheDocument();

    const removedRow = getAttachmentRow("removed-proof.pdf");
    expect(within(removedRow).getByText("Removed", { exact: true })).toBeInTheDocument();
    expect(within(removedRow).getByText(/Duplicate upload/iu)).toBeInTheDocument();
    expect(within(removedRow).getByText("Download unavailable")).toBeInTheDocument();
    expect(within(removedRow).queryByRole("link")).not.toBeInTheDocument();
    expect(within(removedRow).queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();

    const unavailableRow = getAttachmentRow("unavailable-proof.jpg");
    expect(within(unavailableRow).getByText("Unavailable", { exact: true })).toBeInTheDocument();
    expect(within(unavailableRow).getByText(/stored bytes are unavailable/iu)).toBeInTheDocument();
    expect(within(unavailableRow).getByText("Download unavailable")).toBeInTheDocument();
    expect(within(unavailableRow).queryByRole("link")).not.toBeInTheDocument();
  });

  it("rejects invalid and oversized files before calling the upload API", async () => {
    const fetchMock = mockAttachmentApi();
    const user = userEvent.setup({ applyAccept: false });
    renderDetail();
    await screen.findByText(ticket.ticketNumber);

    const input = screen.getByLabelText("Add Attachment");
    await user.upload(
      input,
      new File(["not an image"], "notes.txt", { type: "text/plain" }),
    );
    expect(
      await screen.findByText(/Allowed formats are JPG, JPEG, PNG, WEBP, and PDF/iu),
    ).toBeInTheDocument();

    await user.upload(
      input,
      new File([new Uint8Array(MAX_FILE_BYTES + 1)], "too-large.png", {
        type: "image/png",
      }),
    );
    expect(await screen.findByText("This file exceeds the 5 MiB limit.")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(0);
  });

  it("explains the five-active-file limit without making an upload request", async () => {
    const fiveAttachments = Array.from({ length: 5 }, (_, index) =>
      makeAttachment({
        id: 810 + index,
        originalFilename: `existing-${index + 1}.png`,
      }),
    );
    const detail = { ...ticket, attachments: fiveAttachments };
    const fetchMock = mockAttachmentApi({ detail });
    const user = userEvent.setup();
    renderDetail(detail);
    await screen.findByText(ticket.ticketNumber);

    await user.upload(
      screen.getByLabelText("Add Attachment"),
      new File(["png"], "sixth.png", { type: "image/png" }),
    );

    expect(
      await screen.findByText("This Ticket already has five active Attachments."),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(0);
  });

  it("keeps a failed upload retryable and removes the temporary row after success", async () => {
    let uploadAttempt = 0;
    const uploadedAttachment = makeAttachment({
      id: 805,
      originalFilename: "retry-proof.png",
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (method === "GET" && url.includes("/api/tickets/701?requesterId=7")) {
        return jsonResponse({ data: { ...ticket, attachments: [] } });
      }
      if (method === "POST" && url.includes("/api/tickets/701/attachments")) {
        uploadAttempt += 1;
        if (uploadAttempt === 1) throw new Error("Storage service unavailable");
        return jsonResponse({ data: uploadedAttachment }, 201);
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderDetail();
    await screen.findByText(ticket.ticketNumber);
    await user.upload(
      screen.getByLabelText("Add Attachment"),
      new File(["png"], "retry-proof.png", { type: "image/png" }),
    );

    expect(await screen.findByText("Upload failed")).toBeInTheDocument();
    expect(
      screen.getByText("Unable to upload this Attachment. Please retry."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Storage service unavailable")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("retry-proof.png")).toBeInTheDocument();
    await waitFor(() => expect(uploadAttempt).toBe(2));
    expect(screen.queryByText("Upload failed")).not.toBeInTheDocument();
  });

  it("requires a removal reason, preserves metadata, and returns focus after soft removal", async () => {
    const fetchMock = mockAttachmentApi({
      remove: makeAttachment({
        state: "removed",
        removedAt: "2026-09-05T08:12:00.000Z",
        removalReason: "Replaced with the correct file",
        previewable: false,
        downloadUrl: null,
      }),
    });
    const user = userEvent.setup();
    renderDetail();
    await screen.findByText(ticket.ticketNumber);

    const removeButton = screen.getByRole("button", { name: "Remove" });
    await user.click(removeButton);
    const dialog = screen.getByRole("dialog", { name: "Remove Attachment?" });
    await waitFor(() =>
      expect(screen.getByLabelText(/Removal reason/iu)).toHaveFocus(),
    );

    await user.click(within(dialog).getByRole("button", { name: "Remove Attachment" }));
    expect(
      await within(dialog).findByText("Enter a removal reason from 3 to 200 characters."),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(0);

    await user.type(
      within(dialog).getByLabelText(/Removal reason/iu),
      "  Replaced with the correct file  ",
    );
    await user.click(within(dialog).getByRole("button", { name: "Remove Attachment" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            String(input).includes("/api/tickets/701/attachments/801?requesterId=7") &&
            init?.method === "DELETE" &&
            String(init.body).includes("Replaced with the correct file"),
        ),
      ).toBe(true);
    });
    expect(await screen.findByText("Removed", { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/Replaced with the correct file/iu)).toBeInTheDocument();
    expect(screen.getByText("Download unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Preview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Download" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    await waitFor(() => expect(getAttachmentRow("active-proof.png")).toHaveFocus());
  });
});
