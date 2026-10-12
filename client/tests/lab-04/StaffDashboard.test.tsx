import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import StaffDashboard from "../../src/StaffDashboard.js";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

const dashboard = {
  asOf: "2026-10-07T10:00:00.000Z",
  reportTimeZone: "Asia/Bangkok",
  window: {
    key: "7d",
    start: "2026-10-01T17:00:00.000Z",
    end: "2026-10-08T17:00:00.000Z",
  },
  metrics: {
    unassignedActiveCount: { value: 0, drillDown: { path: "/staff/tickets", query: { assignment: "unassigned" } } },
    myAssignedActiveCount: { value: 2, drillDown: { path: "/staff/tickets", query: { assignment: "mine" } } },
    urgentActiveCount: { value: 1, drillDown: { path: "/staff/tickets", query: { itPriority: "URGENT" } } },
    recentlyUpdatedCount: { value: 1, drillDown: { path: "/staff/tickets", query: { updatedWithin: "7d" } } },
    ticketsByStatus: ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"].map((status) => ({
      status,
      value: 0,
      drillDown: { path: "/staff/tickets", query: { currentStatus: status } },
    })),
    ticketsByItPriority: ["LOW", "MEDIUM", "HIGH", "URGENT"].map((itPriority) => ({
      itPriority,
      value: itPriority === "URGENT" ? 1 : 0,
      drillDown: { path: "/staff/tickets", query: { itPriority } },
    })),
  },
  recentTickets: [],
  urgentTickets: [],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("IT Staff Dashboard final regression", () => {
  it("keeps zero buckets, non-color labels, and drill-down links visible", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ data: dashboard })));
    render(<StaffDashboard onNavigate={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "IT Staff Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Dashboard metrics" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Unassigned active Tickets" })).toHaveAttribute(
      "href",
      "/staff/tickets?assignment=unassigned",
    );
    expect(screen.getByText("No urgent work.")).toBeInTheDocument();
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(8);
  });

  it("does not flash partial data on a forbidden response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: "FORBIDDEN", message: "not allowed" } }, 403),
    ));
    render(<StaffDashboard onNavigate={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("cannot view the IT Staff Dashboard");
    expect(screen.queryByText("Unassigned active Tickets")).not.toBeInTheDocument();
  });
});
