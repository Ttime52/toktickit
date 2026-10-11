import type {
  Prisma,
  PrismaClient,
  ItPriority,
  RequestedPriority,
  CurrentStatus,
  UserRole,
} from "@prisma/client";

import {
  type StaffSortField,
  type StaffTicketQuery,
} from "./staff-ticket-query.js";
import { ACTIVE_TICKET_STATUSES } from "./ticket-query.js";
import { dashboardWindowFor } from "./dashboard-window.js";

const staffTicketSelect = {
  id: true,
  ticketNumber: true,
  ticketDate: true,
  summary: true,
  requestedPriority: true,
  itPriority: true,
  currentStatus: true,
  requesterResolutionIndicatedAt: true,
  updatedAt: true,
  requester: {
    select: { id: true, displayName: true, email: true },
  },
  category: {
    select: { id: true, name: true },
  },
  relatedSystem: {
    select: { id: true, name: true },
  },
  assignedTo: {
    select: { id: true, displayName: true, role: true },
  },
  attachments: {
    where: { removedAt: null, availabilityState: "AVAILABLE" },
    select: { id: true },
  },
} satisfies Prisma.TicketSelect;

type StaffTicketRecord = Prisma.TicketGetPayload<{
  select: typeof staffTicketSelect;
}>;

export interface StaffTicketRow {
  id: number;
  ticketNumber: string;
  ticketDate: string;
  summary: string;
  category: { id: number; name: string };
  relatedSystem: { id: number; name: string };
  requester: { id: number; displayName: string; email: string };
  ticketOwner: { id: number; displayName: string; role: UserRole } | null;
  assignedTo: StaffTicketRow["ticketOwner"];
  requestedPriority: RequestedPriority;
  itPriority: ItPriority;
  currentStatus: CurrentStatus;
  requesterResolutionIndicatedAt: string | null;
  attachmentCount: number;
  updatedAt: string;
}

export interface StaffTicketListResult {
  data: StaffTicketRow[];
  meta: {
    page: number;
    pageSize: StaffTicketQuery["pageSize"];
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

const priorityRank: Record<RequestedPriority, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  URGENT: 4,
};

const statusRank: Record<CurrentStatus, number> = {
  NEW: 1,
  OPEN: 2,
  IN_PROGRESS: 3,
  WAITING_FOR_REQUESTER: 4,
  RESOLVED: 5,
  CLOSED: 6,
  REOPENED: 7,
  CANCELLED: 8,
};

function compareText(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: "base" });
}

function ownerName(ticket: StaffTicketRecord): string {
  return ticket.assignedTo?.displayName ?? "";
}

function compareRows(left: StaffTicketRecord, right: StaffTicketRecord, field: StaffSortField): number {
  switch (field) {
    case "ticketNumber":
      return compareText(left.ticketNumber, right.ticketNumber);
    case "ticketDate":
      return left.ticketDate.getTime() - right.ticketDate.getTime();
    case "updatedAt":
      return left.updatedAt.getTime() - right.updatedAt.getTime();
    case "requestedPriority":
      return priorityRank[left.requestedPriority] - priorityRank[right.requestedPriority];
    case "itPriority":
      return priorityRank[left.itPriority] - priorityRank[right.itPriority];
    case "currentStatus":
      return statusRank[left.currentStatus] - statusRank[right.currentStatus];
    case "ticketOwner":
    case "assignee":
      return compareText(ownerName(left), ownerName(right));
    case "category":
      return compareText(left.category.name, right.category.name);
  }
}

function sortRows(rows: StaffTicketRecord[], query: StaffTicketQuery): StaffTicketRecord[] {
  return rows.sort((left, right) => {
    const primary = compareRows(left, right, query.sortBy);
    if (primary === 0) return right.id - left.id;
    return query.sortOrder === "asc" ? primary : -primary;
  });
}

function staffWhere(query: StaffTicketQuery): Prisma.TicketWhereInput {
  const conditions: Prisma.TicketWhereInput[] = [];
  const dashboardWindow = query.windowStart !== undefined && query.windowEnd !== undefined
    ? { start: query.windowStart, end: query.windowEnd }
    : query.updatedWithin === "7d"
      ? dashboardWindowFor(new Date())
      : null;
  if (query.categoryId !== null) conditions.push({ categoryId: query.categoryId });
  if (query.relatedSystemId !== null) {
    conditions.push({ relatedSystemId: query.relatedSystemId });
  }
  if (query.requestedPriority !== null) {
    conditions.push({ requestedPriority: query.requestedPriority });
  }
  if (query.itPriority !== null) conditions.push({ itPriority: query.itPriority });
  if (query.currentStatus !== null) {
    conditions.push({ currentStatus: query.currentStatus });
  }
  if (query.scope === "active") {
    conditions.push({ currentStatus: { in: [...ACTIVE_TICKET_STATUSES] } });
  }
  if (query.assignment === "assigned") conditions.push({ assignedToUserId: { not: null } });
  if (query.assignment === "unassigned") conditions.push({ assignedToUserId: null });
  if (query.assignment === "mine") {
    conditions.push({ assignedToUserId: query.currentUserId });
  }
  if (query.updatedWithin === "7d" && dashboardWindow !== null) {
    conditions.push({ updatedAt: { gte: dashboardWindow.start, lt: dashboardWindow.end } });
  }

  if (query.search.length > 0) {
    conditions.push({
      OR: [
        { ticketNumber: { contains: query.search, mode: "insensitive" } },
        { summary: { contains: query.search, mode: "insensitive" } },
        { description: { contains: query.search, mode: "insensitive" } },
        { category: { name: { contains: query.search, mode: "insensitive" } } },
        { relatedSystem: { name: { contains: query.search, mode: "insensitive" } } },
        { requester: { displayName: { contains: query.search, mode: "insensitive" } } },
        { requester: { email: { contains: query.search, mode: "insensitive" } } },
        { assignedTo: { displayName: { contains: query.search, mode: "insensitive" } } },
        { assignedTo: { email: { contains: query.search, mode: "insensitive" } } },
      ],
    });
  }

  return conditions.length === 0 ? {} : { AND: conditions };
}

function serializeRow(ticket: StaffTicketRecord): StaffTicketRow {
  const ticketOwner = ticket.assignedTo === null
    ? null
    : {
        id: ticket.assignedTo.id,
        displayName: ticket.assignedTo.displayName,
        role: ticket.assignedTo.role,
      };

  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    ticketDate: ticket.ticketDate.toISOString(),
    summary: ticket.summary,
    category: ticket.category,
    relatedSystem: ticket.relatedSystem,
    requester: ticket.requester,
    ticketOwner,
    assignedTo: ticketOwner,
    requestedPriority: ticket.requestedPriority,
    itPriority: ticket.itPriority,
    currentStatus: ticket.currentStatus,
    requesterResolutionIndicatedAt:
      ticket.requesterResolutionIndicatedAt?.toISOString() ?? null,
    attachmentCount: ticket.attachments.length,
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

export async function listStaffTickets(
  prisma: PrismaClient,
  query: StaffTicketQuery,
): Promise<StaffTicketListResult> {
  const tickets = await prisma.ticket.findMany({
    where: staffWhere(query),
    select: staffTicketSelect,
  });
  const sorted = sortRows(tickets, query);
  const totalItems = sorted.length;
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);
  const start = (query.page - 1) * query.pageSize;

  return {
    data: sorted.slice(start, start + query.pageSize).map(serializeRow),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
      hasNextPage: query.page < totalPages,
      hasPreviousPage: query.page > 1 && totalPages > 0,
    },
  };
}
