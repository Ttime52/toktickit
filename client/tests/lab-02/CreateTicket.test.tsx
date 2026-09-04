import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "../../src/App.js";

const requesters = [
  {
    id: 1,
    displayName: "Arun Chaiyasit",
    email: "arun.chaiyasit@example.test",
  },
];

const categories = [
  { id: 1, name: "Account and Access" },
  { id: 2, name: "Hardware" },
];

const relatedSystems = [
  { id: 1, name: "Email" },
  { id: 7, name: "Corporate Laptop" },
];

const createdTicket = {
  id: 101,
  ticketNumber: "TT-2026-000001",
  ticketDate: "2026-09-03T13:00:00.000Z",
  requester: requesters[0],
  category: categories[1],
  relatedSystem: relatedSystems[1],
  summary: "Laptop battery drains quickly",
  requestedPriority: "MEDIUM",
  itPriority: null,
  description: "The laptop battery drops below 20 percent after a short meeting.",
  currentStatus: "NEW",
  attachments: [],
  createdAt: "2026-09-03T13:00:00.000Z",
  updatedAt: "2026-09-03T13:00:00.000Z",
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

function mockApi(options?: {
  referencesFail?: boolean;
  createResponse?: unknown;
  createStatus?: number;
}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/development-requesters")) {
      return jsonResponse(requesters);
    }
    if (url.includes("/api/categories")) {
      return options?.referencesFail
        ? jsonResponse({ error: { code: "INTERNAL_ERROR", message: "Unable to load Categories." } }, 500)
        : jsonResponse(categories);
    }
    if (url.includes("/api/related-systems")) {
      return options?.referencesFail
        ? jsonResponse({ error: { code: "INTERNAL_ERROR", message: "Unable to load Related Systems." } }, 500)
        : jsonResponse(relatedSystems);
    }
    if (url.endsWith("/api/tickets") && init?.method === "POST") {
      return jsonResponse(
        options?.createResponse ?? {
          data: createdTicket,
          meta: { idempotentReplay: false },
        },
        options?.createStatus ?? 201,
      );
    }
    if (url.includes("/api/tickets/101?requesterId=1")) {
      return jsonResponse({ data: createdTicket });
    }
    if (url.includes("/attachments") && init?.method === "POST") {
      return jsonResponse({
        data: {
          id: 501,
          ticketId: 101,
          originalFilename: "screen.png",
          mimeType: "image/png",
          sizeBytes: 8,
          uploadedAt: createdTicket.createdAt,
          state: "active",
          removedAt: null,
          unavailableAt: null,
          unavailableReason: null,
          removalReason: null,
          previewable: true,
          downloadUrl: "/api/tickets/101/attachments/501/download?requesterId=1",
        },
      }, 201);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function openCreateTicket(waitForReferences = true) {
  const user = userEvent.setup({ applyAccept: false });
  render(<App />);
  const requesterSelect = await screen.findByRole("combobox", {
    name: "Development Requester",
  });
  await user.selectOptions(requesterSelect, "1");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("link", { name: "Create Ticket" }));
  await screen.findByRole("heading", { name: "Create Ticket" });
  if (waitForReferences) {
    await screen.findByRole("option", { name: "Hardware" });
  }
  return user;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.history.replaceState({}, "", "/my-tickets");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Create Ticket screen (UI-03 through UI-10)", () => {
  it("loads active reference options and renders read-only context and required labels", async () => {
    mockApi();
    await openCreateTicket();

    expect(screen.getAllByText("Generated on submit")).toHaveLength(2);
    expect(screen.getAllByText("Arun Chaiyasit").length).toBeGreaterThan(0);
    expect(screen.getByRole("option", { name: "Corporate Laptop" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Category/)).toHaveAttribute("aria-required", "true");
    expect(screen.getByLabelText(/Related System/)).toHaveAttribute("aria-required", "true");
    expect(screen.getByText("5–120 characters")).toBeInTheDocument();
    expect(screen.getByText("20–2,000 characters")).toBeInTheDocument();
  });

  it("shows a safe retryable state when reference data cannot load", async () => {
    const fetchMock = mockApi({ referencesFail: true });
    await openCreateTicket(false);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to load Category and Related System references.",
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Ticket" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("shows field-level validation without calling the create API", async () => {
    const fetchMock = mockApi();
    const user = await openCreateTicket();

    await user.click(screen.getByRole("button", { name: "Create Ticket" }));

    expect(screen.getByText("Summary must be 5 to 120 characters after trimming.")).toBeInTheDocument();
    expect(screen.getByText(/Description must be 20 to 2,000 characters/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST" && String(init.body).includes("summary"))).toBe(false);
  });

  it("creates once, sends requester context/idempotency data, uploads selected files, and shows the official number", async () => {
    const fetchMock = mockApi();
    const user = await openCreateTicket();

    await user.selectOptions(screen.getByLabelText(/Category/), "2");
    await user.selectOptions(screen.getByLabelText(/Related System/), "7");
    await user.type(screen.getByLabelText("Summary *"), "Laptop battery drains quickly");
    await user.type(
      screen.getByLabelText("Description *"),
      "The laptop battery drops below 20 percent after a short meeting.",
    );
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "screen.png", {
      type: "image/png",
    });
    await user.upload(screen.getByLabelText("Choose files"), file);
    expect(screen.getByText("screen.png")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create Ticket" }));

    expect(await screen.findByRole("heading", { name: "Ticket created" })).toBeInTheDocument();
    expect(screen.getAllByText("TT-2026-000001").length).toBeGreaterThan(0);
    expect(screen.getByText("Uploaded / Active")).toBeInTheDocument();

    const createCall = fetchMock.mock.calls.find(
      ([input, init]) => String(input).endsWith("/api/tickets") && init?.method === "POST",
    );
    expect(createCall).toBeDefined();
    const [, createInit] = createCall as [RequestInfo | URL, RequestInit];
    const sentBody = JSON.parse(String(createInit.body)) as Record<string, unknown>;
    expect(sentBody).toEqual({
      requesterId: 1,
      categoryId: 2,
      relatedSystemId: 7,
      summary: "Laptop battery drains quickly",
      requestedPriority: "MEDIUM",
      description: "The laptop battery drops below 20 percent after a short meeting.",
    });
    expect(createInit.headers).toMatchObject({
      "Content-Type": "application/json",
    });
    expect((createInit.headers as Record<string, string>)["Idempotency-Key"]).toMatch(/^[\x21-\x7e]{16,64}$/u);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "View Ticket" }));
    expect(await screen.findByRole("heading", { name: "Ticket Detail" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/tickets/101");
    expect(screen.queryByText(/outside Issue 4/iu)).not.toBeInTheDocument();
  });

  it("shows immediate type/size/count attachment errors without uploading invalid rows", async () => {
    const fetchMock = mockApi();
    const user = await openCreateTicket();
    const invalid = new File(["text"], "notes.txt", { type: "text/plain" });
    await user.upload(screen.getByLabelText("Choose files"), invalid);
    expect(screen.getByText(/Allowed formats are JPG/)).toBeInTheDocument();

    const oversized = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", {
      type: "image/png",
    });
    await user.upload(screen.getByLabelText("Choose files"), oversized);
    expect(screen.getByText("This file exceeds the 5 MiB limit.")).toBeInTheDocument();

    const validFiles = Array.from({ length: 6 }, (_, index) =>
      new File([new Uint8Array([1, 2, 3])], `file-${index}.png`, { type: "image/png" }),
    );
    await user.upload(screen.getByLabelText("Choose files"), validFiles);
    expect(screen.getByText("The five active file limit has been reached.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => String(init?.body).includes("file-5.png"))).toBe(false);
  });

  it("keeps entered values after a safe create failure", async () => {
    mockApi({
      createStatus: 500,
      createResponse: {
        error: {
          code: "INTERNAL_ERROR",
          message: "Unable to complete the request.",
        },
      },
    });
    const user = await openCreateTicket();
    await user.selectOptions(screen.getByLabelText(/Category/), "2");
    await user.selectOptions(screen.getByLabelText(/Related System/), "7");
    await user.type(screen.getByLabelText("Summary *"), "Laptop battery drains quickly");
    await user.type(screen.getByLabelText("Description *"), "The laptop battery drops below 20 percent after a short meeting.");
    await user.click(screen.getByRole("button", { name: "Create Ticket" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to complete the request.");
    expect(screen.getByLabelText("Summary *")).toHaveValue("Laptop battery drains quickly");
    expect(screen.getByLabelText("Description *")).toHaveValue("The laptop battery drops below 20 percent after a short meeting.");
    expect(screen.queryByRole("heading", { name: "Ticket created" })).not.toBeInTheDocument();
  });
});
