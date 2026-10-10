import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ActionsTakenSection from "../../src/ActionsTaken.js";
import AdminTicketInspection from "../../src/AdminTicketInspection.js";
import StaffTicketDetail from "../../src/StaffTicketDetail.js";

const firstAction = {
  id: 901,
  ticketId: 101,
  actionAt: "2026-10-07T02:30:00.000Z",
  actionDescription: "Checked the endpoint logs.",
  result: "The service returned to a healthy state.",
  performedBy: { id: 8, displayName: "Somchai Staff", role: "IT_STAFF" },
  followUpRequired: false,
  followUpNote: null,
  attachmentNotes: "Review attachment 501.",
  createdAt: "2026-10-07T02:30:02.000Z",
  updatedAt: "2026-10-07T02:30:02.000Z",
  updatedBy: null,
  version: 1,
  etag: '"action-taken-901-v1"',
};

const secondAction = {
  ...firstAction,
  id: 902,
  actionAt: "2026-10-07T03:30:00.000Z",
  actionDescription: "Rechecked the deployment.",
  result: "The error rate stayed within the expected range.",
  performedBy: { id: 9, displayName: "Nok Staff", role: "IT_STAFF" },
  followUpRequired: true,
  followUpNote: "Verify again after the next deployment.",
  attachmentNotes: null,
  etag: '"action-taken-902-v1"',
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

function actionListResponse(actions: unknown[], ticketVersion = 7) {
  return jsonResponse({
    data: actions,
    meta: {
      page: 1,
      pageSize: 100,
      totalItems: actions.length,
      totalPages: actions.length === 0 ? 0 : 1,
      hasNextPage: false,
      hasPreviousPage: false,
      ticketVersion,
    },
  });
}

function requestHeader(init: RequestInit | undefined, name: string): string | undefined {
  const headers = init?.headers as Record<string, string> | undefined;
  if (headers === undefined) return undefined;
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry?.[1];
}

const integrationTicket = {
  id: 101,
  version: 7,
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
  attachmentCount: 0,
  attachments: [],
  publicComments: [],
  internalNotes: [],
  assignedAt: "2026-09-18T01:05:00.000Z",
  createdAt: "2026-09-18T01:00:00.000Z",
  updatedAt: "2026-09-18T01:10:00.000Z",
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Actions Taken UI (Issue 25)", () => {
  it("shows multiple performers and conditionally validates Follow-up Note", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/tickets/101/actions")) {
        return Promise.resolve(jsonResponse({
          data: [firstAction, secondAction],
          meta: { page: 1, pageSize: 100, totalItems: 2, totalPages: 1, hasNextPage: false, hasPreviousPage: false, ticketVersion: 7 },
        }));
      }
      return Promise.resolve(jsonResponse({ data: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ActionsTakenSection
        ticketId={101}
        mode="staff"
        currentUser={{ displayName: "Current Staff", role: "IT_STAFF" }}
      />,
    );

    const region = await screen.findByRole("region", { name: "Actions Taken" });
    expect(within(region).getByText("Somchai Staff")).toBeInTheDocument();
    expect(within(region).getByText("Nok Staff")).toBeInTheDocument();
    expect(within(region).getByText("Verify again after the next deployment.")).toBeInTheDocument();
    expect(within(region).getAllByText("—").length).toBeGreaterThan(0);

    await userEvent.click(within(region).getByRole("button", { name: "Add Action Taken" }));
    expect(screen.getByRole("heading", { name: "Add Action Taken" })).toBeInTheDocument();
    expect(screen.getByText("Current Staff")).toBeInTheDocument();
    expect(screen.queryByLabelText("Follow-up Note")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: "Follow-Up Required?" }));
    expect(screen.getByLabelText("Follow-up Note")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save Action Taken" }));
    expect(await screen.findByText("Please fix the highlighted fields before saving.")).toBeInTheDocument();
    expect(await screen.findByText(/Action Description must be/iu)).toBeInTheDocument();
    expect(await screen.findByText(/Result must be/iu)).toBeInTheDocument();
    expect(await screen.findByText(/follow-up note is required/iu)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("keeps Requester mode read-only", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse({
      data: [firstAction],
      meta: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false, ticketVersion: 7 },
    }))));

    render(<ActionsTakenSection ticketId={101} mode="requester" />);
    const region = await screen.findByRole("region", { name: "Actions Taken" });
    expect(within(region).getByText("Somchai Staff")).toBeInTheDocument();
    expect(within(region).queryByRole("button", { name: /Add|Edit/iu })).not.toBeInTheDocument();
  });

  it("preserves a dirty draft through STALE_WRITE recovery and resubmits with the latest version", async () => {
    const latestAction = {
      ...firstAction,
      result: "Another staff member updated the result.",
      version: 2,
      etag: '"action-taken-901-v2"',
    };
    const savedAction = {
      ...latestAction,
      result: "My draft result",
      version: 3,
      etag: '"action-taken-901-v3"',
    };
    let listRequestCount = 0;
    let patchRequestCount = 0;
    const patchRequests: RequestInit[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (method === "PATCH" && url.endsWith("/api/tickets/101/actions/901")) {
        patchRequestCount += 1;
        patchRequests.push(init ?? {});
        if (patchRequestCount === 1) {
          return Promise.resolve(jsonResponse({
            error: {
              code: "STALE_WRITE",
              message: "The Action Taken changed. Reload it before saving again.",
            },
          }, 412));
        }
        return Promise.resolve(jsonResponse({
          data: savedAction,
          meta: { ticketVersion: 9 },
        }));
      }

      if (method === "GET" && url.includes("/api/tickets/101/actions")) {
        listRequestCount += 1;
        return Promise.resolve(actionListResponse(
          listRequestCount === 1 ? [firstAction] : [latestAction],
          listRequestCount === 1 ? 7 : 8,
        ));
      }

      return Promise.resolve(jsonResponse({ data: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(
      <ActionsTakenSection
        ticketId={101}
        mode="staff"
        currentUser={{ displayName: "Current Staff", role: "IT_STAFF" }}
      />,
    );

    const region = await screen.findByRole("region", { name: "Actions Taken" });
    await user.click(within(region).getByRole("button", { name: "Edit Action Taken" }));
    const resultInput = screen.getByLabelText("Result");
    await user.clear(resultInput);
    await user.type(resultInput, "My draft result");
    await user.click(screen.getByRole("button", { name: "Save Action Taken" }));

    expect(await screen.findByText(/This Action Taken record changed elsewhere/iu)).toBeInTheDocument();
    expect(screen.getByLabelText("Result")).toHaveValue("My draft result");

    await user.click(screen.getByRole("button", { name: "Reload latest" }));
    expect(await screen.findByText("Latest version loaded. Review your draft before saving again.")).toBeInTheDocument();
    expect(screen.getByLabelText("Result")).toHaveValue("My draft result");

    await user.click(screen.getByRole("button", { name: "Save Action Taken" }));
    expect(await screen.findByText("Action Taken updated.")).toBeInTheDocument();
    expect(patchRequests).toHaveLength(2);

    const retryBody = JSON.parse(String(patchRequests[1]?.body)) as Record<string, unknown>;
    expect(requestHeader(patchRequests[1], "If-Match")).toBe('"action-taken-901-v2"');
    expect(retryBody).toMatchObject({
      result: "My draft result",
      expectedTicketVersion: 8,
    });
  });

  it("reuses the same Idempotency-Key after a failed create retry", async () => {
    const createdAction = {
      ...firstAction,
      id: 903,
      actionDescription: "Restarted the affected service.",
      result: "The service is healthy again.",
      performedBy: { id: 8, displayName: "Current Staff", role: "IT_STAFF" },
      etag: '"action-taken-903-v1"',
    };
    let listRequestCount = 0;
    const postRequests: RequestInit[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (method === "POST" && url.endsWith("/api/tickets/101/actions")) {
        postRequests.push(init ?? {});
        if (postRequests.length === 1) {
          return Promise.reject(new Error("network temporarily unavailable"));
        }
        return Promise.resolve(jsonResponse({
          data: createdAction,
          meta: { idempotentReplay: true, ticketVersion: 8 },
        }, 200));
      }

      if (method === "GET" && url.includes("/api/tickets/101/actions")) {
        listRequestCount += 1;
        return Promise.resolve(actionListResponse(
          listRequestCount === 1 ? [] : [createdAction],
          listRequestCount === 1 ? 7 : 8,
        ));
      }

      return Promise.resolve(jsonResponse({ data: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(
      <ActionsTakenSection
        ticketId={101}
        mode="staff"
        currentUser={{ displayName: "Current Staff", role: "IT_STAFF" }}
      />,
    );

    const region = await screen.findByRole("region", { name: "Actions Taken" });
    await user.click(within(region).getByRole("button", { name: "Add Action Taken" }));
    await user.type(screen.getByLabelText("Action Description"), "Restarted the affected service.");
    await user.type(screen.getByLabelText("Result"), "The service is healthy again.");

    await user.click(screen.getByRole("button", { name: "Save Action Taken" }));
    expect(await screen.findByText("Unable to save Action Taken. Please try again.")).toBeInTheDocument();
    expect(screen.getByLabelText("Action Description")).toHaveValue("Restarted the affected service.");

    await user.click(screen.getByRole("button", { name: "Save Action Taken" }));
    expect(await screen.findByText("Action Taken added.")).toBeInTheDocument();
    expect(postRequests).toHaveLength(2);

    const firstKey = requestHeader(postRequests[0], "Idempotency-Key");
    const secondKey = requestHeader(postRequests[1], "Idempotency-Key");
    expect(firstKey).toBeDefined();
    expect(firstKey).toBe(secondKey);
    expect(firstKey).toMatch(/^[\x21-\x7e]{16,64}$/u);

    const firstBody = JSON.parse(String(postRequests[0]?.body)) as Record<string, unknown>;
    const secondBody = JSON.parse(String(postRequests[1]?.body)) as Record<string, unknown>;
    expect(secondBody).toEqual(firstBody);
    expect(secondBody).not.toHaveProperty("ticketId");
    expect(secondBody).not.toHaveProperty("performedBy");
    expect(secondBody).not.toHaveProperty("version");
  });

  it("enforces documented validation boundaries before persistence", async () => {
    let postBody: Record<string, unknown> | null = null;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST" && url.endsWith("/api/tickets/101/actions")) {
        postBody = JSON.parse(String(init.body)) as Record<string, unknown>;
        return Promise.resolve(jsonResponse({
          data: {
            ...firstAction,
            id: 904,
            actionAt: "2020-01-01T02:30:00.000Z",
            actionDescription: String(postBody.actionDescription),
            result: String(postBody.result),
            followUpRequired: true,
            followUpNote: String(postBody.followUpNote),
            attachmentNotes: String(postBody.attachmentNotes),
          },
          meta: { ticketVersion: 8 },
        }, 201));
      }
      return Promise.resolve(actionListResponse([], 7));
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(
      <ActionsTakenSection
        ticketId={101}
        mode="staff"
        currentUser={{ displayName: "Current Staff", role: "IT_STAFF" }}
      />,
    );

    const region = await screen.findByRole("region", { name: "Actions Taken" });
    await user.click(within(region).getByRole("button", { name: "Add Action Taken" }));

    const actionAt = screen.getByLabelText("Action Date/Time");
    const description = screen.getByLabelText("Action Description");
    const result = screen.getByLabelText("Result");
    const attachmentNotes = screen.getByLabelText("Attachment Notes");

    fireEvent.change(actionAt, { target: { value: "not-a-date" } });
    await user.click(screen.getByRole("button", { name: "Save Action Taken" }));
    expect(await screen.findByText("Action Date/Time is required and must be valid.")).toBeInTheDocument();
    expect(postBody).toBeNull();

    fireEvent.change(actionAt, { target: { value: "2099-01-01T00:00" } });
    fireEvent.change(description, { target: { value: "d".repeat(2001) } });
    fireEvent.change(result, { target: { value: "r".repeat(2001) } });
    fireEvent.change(attachmentNotes, { target: { value: "a".repeat(1001) } });
    await user.click(screen.getByRole("button", { name: "Save Action Taken" }));

    expect(await screen.findByText("Action Date/Time cannot be more than five minutes in the future.")).toBeInTheDocument();
    expect(await screen.findByText(/Action Description must be 1 to 2,000 characters/iu)).toBeInTheDocument();
    expect(await screen.findByText(/Result must be 1 to 2,000 characters/iu)).toBeInTheDocument();
    expect(await screen.findByText(/Attachment Notes must be at most 1,000 characters/iu)).toBeInTheDocument();
    expect(postBody).toBeNull();

    fireEvent.change(actionAt, { target: { value: "2020-01-01T09:30" } });
    fireEvent.change(description, { target: { value: "d".repeat(2000) } });
    fireEvent.change(result, { target: { value: "r".repeat(2000) } });
    fireEvent.change(attachmentNotes, { target: { value: "a".repeat(1000) } });
    await user.click(screen.getByRole("checkbox", { name: "Follow-Up Required?" }));
    const followUpNote = screen.getByLabelText("Follow-up Note");
    fireEvent.change(followUpNote, { target: { value: "n".repeat(1001) } });
    await user.click(screen.getByRole("button", { name: "Save Action Taken" }));

    expect(await screen.findByText(/follow-up note is required when follow-up is required and must be at most 1,000 characters/iu)).toBeInTheDocument();
    expect(postBody).toBeNull();

    fireEvent.change(followUpNote, { target: { value: "n".repeat(1000) } });
    await user.click(screen.getByRole("button", { name: "Save Action Taken" }));
    expect(await screen.findByText("Action Taken added.")).toBeInTheDocument();
    expect(postBody).not.toBeNull();
    expect(postBody).toMatchObject({
      actionAt: "2020-01-01T02:30:00.000Z",
      actionDescription: "d".repeat(2000),
      result: "r".repeat(2000),
      followUpRequired: true,
      followUpNote: "n".repeat(1000),
      attachmentNotes: "a".repeat(1000),
    });
  });

  it("accepts minimum-length required values and serializes empty optional fields as null", async () => {
    let postBody: Record<string, unknown> | null = null;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST" && url.endsWith("/api/tickets/101/actions")) {
        postBody = JSON.parse(String(init.body)) as Record<string, unknown>;
        return Promise.resolve(jsonResponse({
          data: { ...firstAction, id: 905, actionDescription: "D", result: "R" },
          meta: { ticketVersion: 8 },
        }, 201));
      }
      return Promise.resolve(actionListResponse([], 7));
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(
      <ActionsTakenSection
        ticketId={101}
        mode="staff"
        currentUser={{ displayName: "Current Staff", role: "IT_STAFF" }}
      />,
    );

    const region = await screen.findByRole("region", { name: "Actions Taken" });
    await user.click(within(region).getByRole("button", { name: "Add Action Taken" }));
    fireEvent.change(screen.getByLabelText("Action Date/Time"), { target: { value: "2020-01-01T09:30" } });
    fireEvent.change(screen.getByLabelText("Action Description"), { target: { value: "D" } });
    fireEvent.change(screen.getByLabelText("Result"), { target: { value: "R" } });

    await user.click(screen.getByRole("button", { name: "Save Action Taken" }));
    expect(await screen.findByText("Action Taken added.")).toBeInTheDocument();
    expect(postBody).toMatchObject({
      actionAt: "2020-01-01T02:30:00.000Z",
      actionDescription: "D",
      result: "R",
      followUpRequired: false,
      followUpNote: null,
      attachmentNotes: null,
    });
  });

  it("integrates Actions Taken into Staff Ticket Detail with staff controls", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/tickets/101/actions")) return Promise.resolve(actionListResponse([firstAction]));
      if (url.includes("/api/staff/users")) {
        return Promise.resolve(jsonResponse({ data: [{ id: 8, displayName: "Staff Example", role: "IT_STAFF" }] }));
      }
      if (url.includes("/api/staff/tickets/101") && init?.method !== "PATCH") {
        return Promise.resolve(jsonResponse({ data: integrationTicket }));
      }
      return Promise.resolve(jsonResponse({ data: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(
      <StaffTicketDetail
        ticketId={101}
        onBack={vi.fn()}
        currentUser={{ displayName: "Current Staff", role: "IT_STAFF" }}
      />,
    );

    const region = await screen.findByRole("region", { name: "Actions Taken" });
    expect(within(region).getByText("Checked the endpoint logs.")).toBeInTheDocument();
    expect(within(region).getByText("Somchai Staff")).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "Add Action Taken" })).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "Edit Action Taken" })).toBeInTheDocument();

    await user.click(within(region).getByRole("button", { name: "Add Action Taken" }));
    expect(screen.getByRole("heading", { name: "Add Action Taken" })).toBeInTheDocument();
    expect(screen.getByText("Current Staff")).toBeInTheDocument();
  });

  it("integrates Actions Taken into Administrator Ticket Inspection with admin controls", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/tickets/101/actions")) return Promise.resolve(actionListResponse([firstAction]));
      if (url.endsWith("/api/tickets/101/comments")) return Promise.resolve(jsonResponse({ data: [] }));
      if (url.endsWith("/api/tickets/101/internal-notes")) return Promise.resolve(jsonResponse({ data: [] }));
      if (url.endsWith("/api/tickets/101")) return Promise.resolve(jsonResponse({ data: integrationTicket }));
      return Promise.resolve(jsonResponse({ data: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(
      <AdminTicketInspection
        ticketId={101}
        onBack={vi.fn()}
        currentUser={{ displayName: "Administrator Example", role: "ADMINISTRATOR" }}
      />,
    );

    const region = await screen.findByRole("region", { name: "Actions Taken" });
    expect(within(region).getByText("Checked the endpoint logs.")).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "Add Action Taken" })).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "Edit Action Taken" })).toBeInTheDocument();

    await user.click(within(region).getByRole("button", { name: "Add Action Taken" }));
    expect(screen.getByRole("heading", { name: "Add Action Taken" })).toBeInTheDocument();
    expect(screen.getByText("Administrator Example")).toBeInTheDocument();
  });
});
