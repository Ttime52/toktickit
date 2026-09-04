import { ApiError } from "./errors.js";
import {
  REQUESTED_PRIORITIES,
  type RequestedPriorityValue,
} from "./ticket-validation.js";

export const TICKET_SORT_FIELDS = [
  "ticketNumber",
  "ticketDate",
  "updatedAt",
  "requestedPriority",
  "currentStatus",
  "category",
] as const;

export type TicketSortField = (typeof TICKET_SORT_FIELDS)[number];
export type TicketSortOrder = "asc" | "desc";
export type TicketPageSize = 10 | 20 | 50;

const TICKET_QUERY_PARAMETERS = new Set([
  "requesterId",
  "search",
  "categoryId",
  "relatedSystemId",
  "requestedPriority",
  "currentStatus",
  "sortBy",
  "sortOrder",
  "page",
  "pageSize",
]);

export interface TicketListQuery {
  requesterId: number;
  search: string;
  categoryId: number | null;
  relatedSystemId: number | null;
  requestedPriority: RequestedPriorityValue | null;
  currentStatus: "NEW" | null;
  sortBy: TicketSortField;
  sortOrder: TicketSortOrder;
  page: number;
  pageSize: TicketPageSize;
}

export type TicketListQueryResult =
  | { ok: true; value: TicketListQuery }
  | { ok: false; error: ApiError };

function invalidParameter(
  field: string,
  message: string,
): TicketListQueryResult {
  return {
    ok: false,
    error: new ApiError(400, "INVALID_QUERY_PARAMETER", message, {
      [field]: message,
    }),
  };
}

function singleValue(
  query: Record<string, unknown>,
  field: string,
): string | undefined | null {
  const value = query[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  return value;
}

function positiveInteger(value: string): number | null {
  if (!/^[1-9]\d*$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function optionalPositiveInteger(
  query: Record<string, unknown>,
  field: string,
): number | null | TicketListQueryResult {
  const value = singleValue(query, field);
  if (value === undefined) return null;
  if (value === null) {
    return invalidParameter(field, `${field} must be a positive integer.`);
  }

  const parsed = positiveInteger(value);
  return parsed === null
    ? invalidParameter(field, `${field} must be a positive integer.`)
    : parsed;
}

export function parseTicketListQuery(
  query: Record<string, unknown>,
): TicketListQueryResult {
  for (const field of Object.keys(query)) {
    if (!TICKET_QUERY_PARAMETERS.has(field)) {
      return invalidParameter(field, `Unknown query parameter: ${field}.`);
    }
  }

  const requesterIdValue = singleValue(query, "requesterId");
  if (typeof requesterIdValue !== "string") {
    return invalidParameter(
      "requesterId",
      "requesterId must be a positive integer.",
    );
  }
  const requesterId = positiveInteger(requesterIdValue);
  if (requesterId === null) {
    return invalidParameter(
      "requesterId",
      "requesterId must be a positive integer.",
    );
  }

  const searchValue = singleValue(query, "search");
  if (searchValue === null) {
    return invalidParameter("search", "search must be a single text value.");
  }
  const search = searchValue?.trim() ?? "";
  if (search.length > 100) {
    return invalidParameter("search", "search must be at most 100 characters.");
  }

  const categoryId = optionalPositiveInteger(query, "categoryId");
  if (typeof categoryId !== "number" && categoryId !== null) return categoryId;

  const relatedSystemId = optionalPositiveInteger(query, "relatedSystemId");
  if (typeof relatedSystemId !== "number" && relatedSystemId !== null) {
    return relatedSystemId;
  }

  const requestedPriorityValue = singleValue(query, "requestedPriority");
  if (requestedPriorityValue === null) {
    return invalidParameter(
      "requestedPriority",
      "requestedPriority must be one of LOW, MEDIUM, HIGH, or URGENT.",
    );
  }
  let requestedPriority: RequestedPriorityValue | null = null;
  if (requestedPriorityValue !== undefined) {
    if (!REQUESTED_PRIORITIES.includes(requestedPriorityValue as RequestedPriorityValue)) {
      return invalidParameter(
        "requestedPriority",
        "requestedPriority must be one of LOW, MEDIUM, HIGH, or URGENT.",
      );
    }
    requestedPriority = requestedPriorityValue as RequestedPriorityValue;
  }

  const currentStatusValue = singleValue(query, "currentStatus");
  if (currentStatusValue === null ||
      (currentStatusValue !== undefined && currentStatusValue !== "NEW")) {
    return invalidParameter("currentStatus", "currentStatus must be NEW.");
  }
  const currentStatus = currentStatusValue === undefined ? null : "NEW";

  const sortByValue = singleValue(query, "sortBy");
  if (
    sortByValue !== undefined &&
    (sortByValue === null ||
      !TICKET_SORT_FIELDS.includes(sortByValue as TicketSortField))
  ) {
    return invalidParameter(
      "sortBy",
      "sortBy is not a supported Ticket sort field.",
    );
  }
  const sortBy = (sortByValue ?? "updatedAt") as TicketSortField;

  const sortOrderValue = singleValue(query, "sortOrder");
  if (
    sortOrderValue !== undefined &&
    (sortOrderValue === null ||
      (sortOrderValue !== "asc" && sortOrderValue !== "desc"))
  ) {
    return invalidParameter("sortOrder", "sortOrder must be asc or desc.");
  }
  const sortOrder = (sortOrderValue ?? "desc") as TicketSortOrder;

  const pageValue = singleValue(query, "page");
  const page = pageValue === undefined ? 1 : pageValue === null ? null : positiveInteger(pageValue);
  if (page === null) {
    return invalidParameter("page", "page must be a positive integer.");
  }

  const pageSizeValue = singleValue(query, "pageSize");
  const pageSize =
    pageSizeValue === undefined
      ? 10
      : pageSizeValue === "10" || pageSizeValue === "20" || pageSizeValue === "50"
        ? Number(pageSizeValue)
        : null;
  if (pageSize === null) {
    return invalidParameter("pageSize", "pageSize must be 10, 20, or 50.");
  }

  return {
    ok: true,
    value: {
      requesterId,
      search,
      categoryId,
      relatedSystemId,
      requestedPriority,
      currentStatus,
      sortBy,
      sortOrder,
      page,
      pageSize: pageSize as TicketPageSize,
    },
  };
}
