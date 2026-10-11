import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import AdministratorDashboard from "../../src/AdministratorDashboard.js";
import RequesterDashboard from "../../src/RequesterDashboard.js";
import StaffDashboard from "../../src/StaffDashboard.js";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

const windowEvidence = {
  key: "7d" as const,
  start: "2026-10-01T17:00:00.000Z",
  end: "2026-10-08T17:00:00.000Z",
};

const metric = (value: number, path: string, query: Record<string, string>) => ({
  value,
  drillDown: { path, query },
});

const requesterDashboard = {
  asOf: "2026-10-07T10:00:00.000Z",
  reportTimeZone: "Asia/Bangkok" as const,
  window: windowEvidence,
  metrics: {
    openTicketCount: metric(2, "/my-tickets", { scope: "active" }),
    waitingForRequesterCount: metric(1, "/my-tickets", { currentStatus: "WAITING_FOR_REQUESTER" }),
    recentlyUpdatedTicketCount: metric(1, "/my-tickets", { updatedWithin: "7d" }),
    recentlyResolvedTicketCount: metric(0, "/my-tickets", { resolvedWithin: "7d" }),
    resolutionIndicationCount: metric(1, "/my-tickets", { resolutionIndicated: "true" }),
  },
  recentTickets: [
    {
      id: 7,
      ticketNumber: "TT-2026-000007",
      summary: "VPN issue",
      currentStatus: "IN_PROGRESS" as const,
      requestedPriority: "HIGH" as const,
      itPriority: "URGENT" as const,
      ticketOwner: null,
      updatedAt: "2026-10-07T09:00:00.000Z",
    },
  ],
};

const staffDashboard = {
  asOf: "2026-10-07T10:00:00.000Z",
  reportTimeZone: "Asia/Bangkok" as const,
  window: windowEvidence,
  metrics: {
    unassignedActiveCount: metric(0, "/staff/tickets", { assignment: "unassigned", scope: "active" }),
    myAssignedActiveCount: metric(3, "/staff/tickets", { assignment: "mine", scope: "active" }),
    urgentActiveCount: metric(1, "/staff/tickets", { itPriority: "URGENT", scope: "active" }),
    recentlyUpdatedCount: metric(2, "/staff/tickets", { updatedWithin: "7d" }),
    ticketsByStatus: [
      "NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED",
    ].map((status) => ({ status: status as never, value: 0, drillDown: { path: "/staff/tickets", query: { currentStatus: status } } })),
    ticketsByItPriority: ["LOW", "MEDIUM", "HIGH", "URGENT"].map((itPriority) => ({
      itPriority: itPriority as never,
      value: itPriority === "URGENT" ? 1 : 0,
      drillDown: { path: "/staff/tickets", query: { itPriority, scope: "active" } },
    })),
  },
  recentTickets: [],
  urgentTickets: [],
};

const administratorDashboard = {
  ...staffDashboard,
  metrics: {
    ...staffDashboard.metrics,
    activeUserCount: metric(4, "/admin/users", { isActive: "true" }),
    inactiveUserCount: metric(1, "/admin/users", { isActive: "false" }),
  },
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Issue 27 Dashboard UI", () => {
  it("renders requester cards, advisory indication, and API drill-down links", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ data: requesterDashboard })));
    const onNavigate = vi.fn();

    render(<RequesterDashboard onNavigate={onNavigate} />);

    expect(await screen.findByRole("heading", { name: "My Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Problem Appears Resolved")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Open Tickets" })).toHaveAttribute("href", "/my-tickets?scope=active");
    expect(screen.getByRole("link", { name: "Open Ticket" })).toHaveAttribute("href", "/tickets/7");
    expect(screen.getAllByText("Asia/Bangkok · last 7 calendar days").length).toBe(4);
  });

  it("keeps staff zero buckets visible and uses staff detail previews", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ data: staffDashboard })));
    const onNavigate = vi.fn();

    render(<StaffDashboard onNavigate={onNavigate} />);

    expect(await screen.findByRole("heading", { name: "IT Staff Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Tickets by Status")).toBeInTheDocument();
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(8);
    expect(screen.getByRole("link", { name: "View Unassigned active Tickets" })).toHaveAttribute(
      "href",
      "/staff/tickets?assignment=unassigned&scope=active",
    );
    expect(screen.getByText("No urgent work.")).toBeInTheDocument();
  });

  it("does not render partial dashboard data on a forbidden response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ error: { code: "FORBIDDEN", message: "You are not allowed." } }, 403),
      ),
    );

    render(<StaffDashboard onNavigate={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("cannot view the IT Staff Dashboard");
    expect(screen.queryByText("Unassigned active Tickets")).not.toBeInTheDocument();
  });

  it("renders the administrator read-only view and exact user drill-downs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ data: administratorDashboard })));

    render(<AdministratorDashboard onNavigate={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "Administrator Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Active Users" })).toHaveAttribute(
      "href",
      "/admin/users?isActive=true",
    );
    expect(screen.getByRole("link", { name: "Search Tickets" })).toHaveAttribute("href", "/admin/tickets");
    expect(screen.queryByRole("button", { name: /assign|change status/i })).not.toBeInTheDocument();
  });
});

