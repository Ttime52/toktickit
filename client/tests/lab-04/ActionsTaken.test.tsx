import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ActionsTakenSection from "../../src/ActionsTaken.js";

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
});
