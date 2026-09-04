import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import MyTickets from "../../src/MyTickets.js";

const categories = [
  { id: 1, name: "Account and Access" },
  { id: 2, name: "Hardware" },
];

const relatedSystems = [
  { id: 1, name: "Email" },
  { id: 7, name: "Corporate Laptop" },
];

const ticket = {
  id: 101,
  ticketNumber: "TT-2026-000101",
  ticketDate: "2026-09-03T13:00:00.000Z",
  summary: "Laptop battery drains quickly",
  category: categories[1],
  relatedSystem: relatedSystems[1],
  requestedPriority: "HIGH" as const,
  itPriority: null,
  currentStatus: "NEW" as const,
  attachmentCount: 1,
  updatedAt: "2026-09-03T13:00:00.000Z",
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

function listResponse(
  data: unknown[] = [ticket],
  meta: Partial<{
    page: number;
    pageSize: 10 | 20 | 50;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  }> = {},
) {
  return {
    data,
    meta: {
      page: 1,
      pageSize: 10,
      totalItems: data.length,
      totalPages: data.length > 0 ? 1 : 0,
      hasNextPage: false,
      hasPreviousPage: false,
      ...meta,
    },
  };
}

function mockApi(options?: {
  listResponse?: unknown;
  listStatus?: number;
  referencesFail?: boolean;
  listBySearch?: boolean;
}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/categories")) {
      return options?.referencesFail
        ? jsonResponse({ error: { message: "SQL should not leak" } }, 500)
        : jsonResponse(categories);
    }
    if (url.includes("/api/related-systems")) {
      return options?.referencesFail
        ? jsonResponse({ error: { message: "SQL should not leak" } }, 500)
        : jsonResponse(relatedSystems);
    }
    if (url.includes("/api/tickets?")) {
      const search = new URL(url).searchParams.get("search");
      if (options?.listBySearch && search !== null) {
        return jsonResponse(listResponse([]));
      }
      return jsonResponse(
        options?.listResponse ?? listResponse(),
        options?.listStatus ?? 200,
      );
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderMyTickets(
  props: Partial<React.ComponentProps<typeof MyTickets>> = {},
) {
  return render(
    <MyTickets
      requesterId={1}
      requesterName="Arun Chaiyasit"
      {...props}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("My Tickets screen (UI-11/UI-12)", () => {
  it("renders owned list data and sends the documented default query", async () => {
    const fetchMock = mockApi();
    renderMyTickets();

    const table = await screen.findByRole("table");
    expect(within(table).getByText("TT-2026-000101")).toBeInTheDocument();
    expect(within(table).getByText("Laptop battery drains quickly")).toBeInTheDocument();
    expect(within(table).getByText("Hardware")).toBeInTheDocument();
    expect(within(table).getByText("Corporate Laptop")).toBeInTheDocument();
    expect(within(table).getByText("High")).toBeInTheDocument();
    expect(within(table).getByText("New")).toBeInTheDocument();

    const listCall = fetchMock.mock.calls.find(([input]) =>
      String(input).includes("/api/tickets?"),
    );
    expect(listCall).toBeDefined();
    const params = new URL(String(listCall?.[0])).searchParams;
    expect(params.get("requesterId")).toBe("1");
    expect(params.get("sortBy")).toBe("updatedAt");
    expect(params.get("sortOrder")).toBe("desc");
    expect(params.get("page")).toBe("1");
    expect(params.get("pageSize")).toBe("10");
  });

  it("updates search/filter/sort controls and can clear them", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    renderMyTickets();
    await screen.findByRole("table");

    await user.selectOptions(screen.getByLabelText("Category"), "2");
    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([input]) => String(input).includes("/api/tickets?"));
      expect(new URL(String(calls.at(-1)?.[0])).searchParams.get("categoryId")).toBe("2");
    });

    await user.type(screen.getByLabelText("Search Tickets"), "laptop");
    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([input]) => String(input).includes("/api/tickets?"));
      expect(new URL(String(calls.at(-1)?.[0])).searchParams.get("search")).toBe("laptop");
    });

    await user.selectOptions(screen.getByLabelText("Sort By"), "category");
    await user.selectOptions(screen.getByLabelText("Sort Direction"), "asc");
    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([input]) => String(input).includes("/api/tickets?"));
      const params = new URL(String(calls.at(-1)?.[0])).searchParams;
      expect(params.get("sortBy")).toBe("category");
      expect(params.get("sortOrder")).toBe("asc");
    });

    const clear = screen.getByRole("button", { name: "Clear Filters" });
    expect(clear).toBeEnabled();
    await user.click(clear);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([input]) => String(input).includes("/api/tickets?"));
      const params = new URL(String(calls.at(-1)?.[0])).searchParams;
      expect(params.get("search")).toBeNull();
      expect(params.get("categoryId")).toBeNull();
      expect(params.get("sortBy")).toBe("updatedAt");
      expect(params.get("sortOrder")).toBe("desc");
    });
  });

  it("shows pagination metadata and requests the next page", async () => {
    const fetchMock = mockApi({
      listResponse: listResponse([ticket], {
        totalItems: 11,
        totalPages: 2,
        hasNextPage: true,
      }),
    });
    const user = userEvent.setup();
    renderMyTickets();

    expect(await screen.findByText("Showing 1–10 of 11 Tickets")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([input]) => String(input).includes("/api/tickets?"));
      expect(new URL(String(calls.at(-1)?.[0])).searchParams.get("page")).toBe("2");
    });
  });

  it("distinguishes first-use empty, no-results, and failure states", async () => {
    mockApi({ listResponse: listResponse([]) });
    renderMyTickets();
    expect(await screen.findByRole("heading", { name: "No Tickets yet" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Create Ticket" })).toHaveLength(2);

    cleanup();
    vi.unstubAllGlobals();
    mockApi({ listResponse: listResponse([]), listBySearch: true });
    const user = userEvent.setup();
    renderMyTickets();
    await screen.findByRole("heading", { name: "No Tickets yet" });
    await user.type(screen.getByLabelText("Search Tickets"), "missing");
    expect(await screen.findByRole("heading", { name: "No Tickets match your search" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Clear Filters" }).some((button) => !button.hasAttribute("disabled"))).toBe(true);

    cleanup();
    vi.unstubAllGlobals();
    mockApi({ listStatus: 500, listResponse: { error: { message: "SQL password" } } });
    renderMyTickets();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Unable to load My Tickets");
    expect(alert).not.toHaveTextContent("SQL password");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
