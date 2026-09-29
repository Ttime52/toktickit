import { ApiError } from "./errors.js";
import {
  REQUESTED_PRIORITIES,
  type RequestedPriorityValue,
} from "./ticket-validation.js";
import { TICKET_STATUSES, type TicketStatusValue } from "./ticket-query.js";

export const STAFF_ASSIGNMENT_VALUES = [
  "all",
  "assigned",
  "unassigned",
  "mine",
] as const;

export type StaffAssignment = (typeof STAFF_ASSIGNMENT_VALUES)[number];

export const STAFF_SORT_FIELDS = [
  "ticketNumber",
  "ticketDate",
  "updatedAt",
  "requestedPriority",
  "itPriority",
  "currentStatus",
  "ticketOwner",
  "assignee",
  "category",
] as const;

export type StaffSortField = (typeof STAFF_SORT_FIELDS)[number];
export type StaffSortOrder = "asc" | "desc";
export type StaffPageSize = 10 | 20 | 50;

const STAFF_QUERY_PARAMETERS = new Set([
  "search",
  "categoryId",
  "relatedSystemId",
  "requestedPriority",
  "itPriority",
  "currentStatus",
  "assignment",
  "sortBy",
  "sortOrder",
  "page",
  "pageSize",
]);

export interface StaffTicketQuery {
  search: string;
  categoryId: number | null;
  relatedSystemId: number | null;
  requestedPriority: RequestedPriorityValue | null;
  itPriority: RequestedPriorityValue | null;
  currentStatus: TicketStatusValue | null;
  assignment: StaffAssignment;
  sortBy: StaffSortField;
  sortOrder: StaffSortOrder;
  page: number;
  pageSize: StaffPageSize;
  currentUserId: number;
}

export type StaffTicketQueryResult =
  | { ok: true; value: StaffTicketQuery }
  | { ok: false; error: ApiError };

function invalidParameter(field: string, message: string): StaffTicketQueryResult {
  return {
    ok: false,
    error: new ApiError(400, "INVALID_QUERY_PARAMETER", message, { [field]: message }),
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
): number | null | StaffTicketQueryResult {
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

function parsePriority(
  query: Record<string, unknown>,
  field: "requestedPriority" | "itPriority",
): RequestedPriorityValue | null | StaffTicketQueryResult {
  const value = singleValue(query, field);
  if (value === undefined) return null;
  if (value === null || !REQUESTED_PRIORITIES.includes(value as RequestedPriorityValue)) {
    return invalidParameter(
      field,
      `${field} must be one of LOW, MEDIUM, HIGH, or URGENT.`,
    );
  }
  return value as RequestedPriorityValue;
}

export function parseStaffTicketQuery(
  query: Record<string, unknown>,
  currentUserId: number,
): StaffTicketQueryResult {
  for (const field of Object.keys(query)) {
    if (!STAFF_QUERY_PARAMETERS.has(field)) {
      return invalidParameter(field, `Unknown query parameter: ${field}.`);
    }
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

  const requestedPriority = parsePriority(query, "requestedPriority");
  if (typeof requestedPriority !== "string" && requestedPriority !== null) {
    return requestedPriority;
  }
  const itPriority = parsePriority(query, "itPriority");
  if (typeof itPriority !== "string" && itPriority !== null) return itPriority;

  const statusValue = singleValue(query, "currentStatus");
  if (
    statusValue === null ||
    (statusValue !== undefined &&
      !TICKET_STATUSES.includes(statusValue as TicketStatusValue))
  ) {
    return invalidParameter("currentStatus", "currentStatus must be a valid Ticket status.");
  }
  const currentStatus =
    statusValue === undefined ? null : (statusValue as TicketStatusValue);

  const assignmentValue = singleValue(query, "assignment");
  if (
    assignmentValue !== undefined &&
    (assignmentValue === null ||
      !STAFF_ASSIGNMENT_VALUES.includes(assignmentValue as StaffAssignment))
  ) {
    return invalidParameter(
      "assignment",
      "assignment must be all, assigned, unassigned, or mine.",
    );
  }
  const assignment = (assignmentValue ?? "all") as StaffAssignment;

  const sortByValue = singleValue(query, "sortBy");
  if (
    sortByValue !== undefined &&
    (sortByValue === null || !STAFF_SORT_FIELDS.includes(sortByValue as StaffSortField))
  ) {
    return invalidParameter("sortBy", "sortBy is not a supported Staff Ticket sort field.");
  }
  const sortBy = (sortByValue ?? "updatedAt") as StaffSortField;

  const sortOrderValue = singleValue(query, "sortOrder");
  if (
    sortOrderValue !== undefined &&
    (sortOrderValue === null ||
      (sortOrderValue !== "asc" && sortOrderValue !== "desc"))
  ) {
    return invalidParameter("sortOrder", "sortOrder must be asc or desc.");
  }
  const sortOrder = (sortOrderValue ?? "desc") as StaffSortOrder;

  const pageValue = singleValue(query, "page");
  const page =
    pageValue === undefined
      ? 1
      : pageValue === null
        ? null
        : positiveInteger(pageValue);
  if (page === null) return invalidParameter("page", "page must be a positive integer.");

  const pageSizeValue = singleValue(query, "pageSize");
  const pageSize =
    pageSizeValue === undefined
      ? 10
      : pageSizeValue === "10" || pageSizeValue === "20" || pageSizeValue === "50"
        ? Number(pageSizeValue)
        : null;
  if (pageSize === null) return invalidParameter("pageSize", "pageSize must be 10, 20, or 50.");

  return {
    ok: true,
    value: {
      search,
      categoryId,
      relatedSystemId,
      requestedPriority,
      itPriority,
      currentStatus,
      assignment,
      sortBy,
      sortOrder,
      page,
      pageSize: pageSize as StaffPageSize,
      currentUserId,
    },
  };
}
