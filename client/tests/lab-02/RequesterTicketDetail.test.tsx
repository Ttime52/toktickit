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
import type { Ticket } from "../../src/api.js";

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
  attachments: [],
  createdAt: "2026-09-05T08:00:00.000Z",
  updatedAt: "2026-09-05T08:00:00.000Z",
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

function renderDetail(onNavigate = vi.fn()) {
  render(
    <TicketDetail
      ticketId={ticket.id}
      requesterId={ticket.requester.id}
      onNavigate={onNavigate}
    />,
  );
  return onNavigate;
}

function mockOwnedDetail(detail: Ticket = ticket) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (method === "GET" && url.includes("/api/tickets/701?requesterId=7")) {
      return jsonResponse({ data: detail });
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

describe("Requester Ticket Detail screen", () => {
  it("renders an owned Ticket as read-only with a separate Attachment section", async () => {
    mockOwnedDetail();
    const onNavigate = vi.fn();
    renderDetail(onNavigate);

    expect(
      await screen.findByRole("heading", { name: "Ticket Detail" }),
    ).toBeInTheDocument();

    const ticketInformation = screen.getByRole("region", {
      name: "Ticket information",
    });
    expect(within(ticketInformation).getByText("Ticket Number")).toBeInTheDocument();
    expect(within(ticketInformation).getByText(ticket.ticketNumber)).toBeInTheDocument();
    expect(within(ticketInformation).getByText("Narin Sutham")).toBeInTheDocument();
    expect(within(ticketInformation).getByText("Corporate Laptop")).toBeInTheDocument();
    expect(ticketInformation.querySelectorAll("input, select, textarea")).toHaveLength(0);

    const attachments = screen.getByRole("region", { name: "Attachments" });
    expect(within(attachments).getByLabelText("Add Attachment")).toBeInTheDocument();
    expect(within(attachments).getByText("No Attachments on this Ticket.")).toBeInTheDocument();

    expect(screen.queryByText("Public Comments")).not.toBeInTheDocument();
    expect(screen.queryByText("Internal Notes")).not.toBeInTheDocument();
    expect(screen.queryByText("Actions Taken")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /change status|edit ticket/iu })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Back to My Tickets" }));
    expect(onNavigate).toHaveBeenCalledWith("my-tickets");
  });

  it("exposes a stable loading state while the owned detail request is pending", async () => {
    let resolveRequest!: (response: unknown) => void;
    const pendingResponse = new Promise((resolve) => {
      resolveRequest = resolve;
    });
    const fetchMock = vi.fn(() => pendingResponse);
    vi.stubGlobal("fetch", fetchMock);

    renderDetail();

    expect(screen.getByRole("status")).toHaveTextContent("Loading Ticket Detail...");
    expect(screen.getByRole("status").closest("section")).toHaveAttribute(
      "aria-busy",
      "true",
    );

    resolveRequest(jsonResponse({ data: ticket }));
    expect(await screen.findByText(ticket.ticketNumber)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("handles a missing Ticket with a safe Retry and Back action", async () => {
    let attempt = 0;
    const fetchMock = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) {
        return jsonResponse(
          {
            error: {
              code: "TICKET_NOT_FOUND",
              message: "This Ticket could not be found.",
            },
          },
          404,
        );
      }
      return jsonResponse({ data: ticket });
    });
    vi.stubGlobal("fetch", fetchMock);

    const onNavigate = renderDetail();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This Ticket could not be found.");
    expect(alert).toHaveTextContent("Retry");
    expect(screen.queryByText(ticket.summary)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(ticket.ticketNumber)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await userEvent.click(screen.getByRole("button", { name: "Back to My Tickets" }));
    expect(onNavigate).toHaveBeenCalledWith("my-tickets");
  });

  it("rejects another Requester's detail without leaking private Ticket data", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        {
          error: {
            code: "OWNERSHIP_FORBIDDEN",
            message: "This Ticket is not available for the selected Requester.",
          },
        },
        403,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderDetail();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "This Ticket is not available for the selected Requester.",
    );
    expect(alert).toHaveTextContent("Retry");
    expect(alert).toHaveTextContent("Back to My Tickets");
    expect(screen.queryByText(ticket.ticketNumber)).not.toBeInTheDocument();
    expect(screen.queryByText(ticket.summary)).not.toBeInTheDocument();
    expect(screen.queryByText(/sql|password|stack|prisma/iu)).not.toBeInTheDocument();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});
