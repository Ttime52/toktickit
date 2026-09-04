import { describe, expect, it } from "vitest";

import { parseTicketListQuery } from "../../src/ticket-query.js";

describe("Ticket list query parsing (UNIT-03)", () => {
  it("applies the documented defaults and trims search", () => {
    const result = parseTicketListQuery({
      requesterId: "7",
      search: "  laptop  ",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        requesterId: 7,
        search: "laptop",
        categoryId: null,
        relatedSystemId: null,
        requestedPriority: null,
        currentStatus: null,
        sortBy: "updatedAt",
        sortOrder: "desc",
        page: 1,
        pageSize: 10,
      },
    });
  });

  it("parses all supported filters, sorting, and pagination values", () => {
    const result = parseTicketListQuery({
      requesterId: "7",
      search: "network",
      categoryId: "2",
      relatedSystemId: "9",
      requestedPriority: "URGENT",
      currentStatus: "NEW",
      sortBy: "category",
      sortOrder: "asc",
      page: "2",
      pageSize: "50",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        requesterId: 7,
        search: "network",
        categoryId: 2,
        relatedSystemId: 9,
        requestedPriority: "URGENT",
        currentStatus: "NEW",
        sortBy: "category",
        sortOrder: "asc",
        page: 2,
        pageSize: 50,
      },
    });
  });

  it.each([
    ["unknown parameter", { requesterId: "1", status: "NEW" }, "status"],
    ["missing requester", {}, "requesterId"],
    ["malformed requester", { requesterId: "0" }, "requesterId"],
    ["invalid category", { requesterId: "1", categoryId: "abc" }, "categoryId"],
    ["invalid priority", { requesterId: "1", requestedPriority: "NORMAL" }, "requestedPriority"],
    ["invalid status", { requesterId: "1", currentStatus: "CLOSED" }, "currentStatus"],
    ["invalid sort field", { requesterId: "1", sortBy: "summary" }, "sortBy"],
    ["invalid direction", { requesterId: "1", sortOrder: "sideways" }, "sortOrder"],
    ["invalid page", { requesterId: "1", page: "0" }, "page"],
    ["invalid page size", { requesterId: "1", pageSize: "15" }, "pageSize"],
    ["duplicate value", { requesterId: ["1", "2"] }, "requesterId"],
  ])("rejects %s", (_label, query, field) => {
    const result = parseTicketListQuery(query);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.status).toBe(400);
    expect(result.error.code).toBe("INVALID_QUERY_PARAMETER");
    expect(result.error.fields).toHaveProperty(field);
  });
});
