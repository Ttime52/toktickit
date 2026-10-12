import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import RequesterDashboard from "../../src/RequesterDashboard.js";

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
    openTicketCount: { value: 0, drillDown: { path: "/my-tickets", query: { scope: "active" } } },
    waitingForRequesterCount: { value: 0, drillDown: { path: "/my-tickets", query: { currentStatus: "WAITING_FOR_REQUESTER" } } },
    recentlyUpdatedTicketCount: { value: 0, drillDown: { path: "/my-tickets", query: { updatedWithin: "7d" } } },
    recentlyResolvedTicketCount: { value: 0, drillDown: { path: "/my-tickets", query: { resolvedWithin: "7d" } } },
    resolutionIndicationCount: { value: 0, drillDown: { path: "/my-tickets", query: { resolutionIndicated: "true" } } },
  },
  recentTickets: [],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Requester Dashboard final regression", () => {
  it("shows an explicit empty state and authenticated quick actions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ data: dashboard })));
    render(<RequesterDashboard onNavigate={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "My Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("You have no Tickets yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create Ticket", exact: true })).toHaveAttribute("href", "/create-ticket");
    expect(screen.getByRole("link", { name: "View Open Tickets" })).toHaveAttribute(
      "href",
      "/my-tickets?scope=active",
    );
  });

  it("offers a safe retry without exposing a failed dashboard payload", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: { code: "INTERNAL_ERROR", message: "Unable to load My Dashboard." } }, 500))
      .mockResolvedValueOnce(jsonResponse({ data: dashboard }));
    vi.stubGlobal("fetch", fetchMock);
    render(<RequesterDashboard onNavigate={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load My Dashboard.");
    expect(screen.queryByText("You have no Tickets yet.")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry", exact: true }));
    expect(await screen.findByText("You have no Tickets yet.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
