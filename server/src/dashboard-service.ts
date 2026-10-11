import type {
  CurrentStatus,
  ItPriority,
  Prisma,
  PrismaClient,
  UserRole,
} from "@prisma/client";

import { ApiError } from "./errors.js";
import {
  ACTIVE_TICKET_STATUSES,
  TICKET_STATUSES,
} from "./ticket-query.js";
import {
  DASHBOARD_WINDOW_KEY,
  dashboardWindowFor,
  REPORT_TIME_ZONE,
  serializeDashboardWindow,
  type DashboardWindow,
} from "./dashboard-window.js";

const IT_PRIORITIES: readonly ItPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export interface DashboardDrillDown {
  path: string;
  query: Record<string, string>;
}

export interface DashboardMetric {
  value: number;
  drillDown: DashboardDrillDown;
}

export interface StatusMetric {
  status: CurrentStatus;
  value: number;
  drillDown: DashboardDrillDown;
}

export interface ItPriorityMetric {
  itPriority: ItPriority;
  value: number;
  drillDown: DashboardDrillDown;
}

export interface DashboardTicketOwner {
  id: number;
  displayName: string;
  role: UserRole;
}

export interface DashboardTicketPreview {
  id: number;
  ticketNumber: string;
  summary: string;
  currentStatus: CurrentStatus;
  itPriority: ItPriority;
  ticketOwner: DashboardTicketOwner | null;
  updatedAt: string;
}

export interface RequesterTicketPreview extends DashboardTicketPreview {
  requestedPriority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
}

interface DashboardEnvelope {
  asOf: string;
  reportTimeZone: typeof REPORT_TIME_ZONE;
  window: ReturnType<typeof serializeDashboardWindow>;
}

export interface RequesterDashboardData extends DashboardEnvelope {
  metrics: {
    openTicketCount: DashboardMetric;
    waitingForRequesterCount: DashboardMetric;
    recentlyUpdatedTicketCount: DashboardMetric;
    recentlyResolvedTicketCount: DashboardMetric;
    resolutionIndicationCount: DashboardMetric;
  };
  recentTickets: RequesterTicketPreview[];
}

export interface StaffDashboardData extends DashboardEnvelope {
  metrics: {
    unassignedActiveCount: DashboardMetric;
    myAssignedActiveCount: DashboardMetric;
    urgentActiveCount: DashboardMetric;
    recentlyUpdatedCount: DashboardMetric;
    ticketsByStatus: StatusMetric[];
    ticketsByItPriority: ItPriorityMetric[];
  };
  recentTickets: DashboardTicketPreview[];
  urgentTickets: DashboardTicketPreview[];
}

export interface AdministratorDashboardData extends StaffDashboardData {
  metrics: StaffDashboardData["metrics"] & {
    activeUserCount: DashboardMetric;
    inactiveUserCount: DashboardMetric;
  };
}

export type DashboardResponse<T> = { data: T };

export type DashboardQueryResult =
  | { ok: true; value: typeof DASHBOARD_WINDOW_KEY }
  | { ok: false; error: ApiError };

const staffPreviewSelect = {
  id: true,
  ticketNumber: true,
  summary: true,
  currentStatus: true,
  itPriority: true,
  updatedAt: true,
  assignedTo: {
    select: { id: true, displayName: true, role: true },
  },
} satisfies Prisma.TicketSelect;

const requesterPreviewSelect = {
  id: true,
  ticketNumber: true,
  summary: true,
  currentStatus: true,
  requestedPriority: true,
  itPriority: true,
  updatedAt: true,
  assignedTo: {
    select: { id: true, displayName: true, role: true },
  },
} satisfies Prisma.TicketSelect;

type StaffPreviewRecord = Prisma.TicketGetPayload<{
  select: typeof staffPreviewSelect;
}>;

type RequesterPreviewRecord = Prisma.TicketGetPayload<{
  select: typeof requesterPreviewSelect;
}>;

type DashboardExecutor = Prisma.TransactionClient;

async function setReadOnlySnapshot(transaction: DashboardExecutor): Promise<void> {
  // Prisma exposes the isolation level as a transaction option but not a
  // read-only flag. Keep the statement constant and guard it for lightweight
  // unit-test transaction doubles.
  const executor = transaction as DashboardExecutor & {
    $executeRawUnsafe?: (query: string) => Promise<number>;
  };
  if (typeof executor.$executeRawUnsafe === "function") {
    await executor.$executeRawUnsafe("SET TRANSACTION READ ONLY");
  }
}

function invalidWindow(message: string): DashboardQueryResult {
  return {
    ok: false,
    error: new ApiError(400, "INVALID_QUERY_PARAMETER", message, {
      window: message,
    }),
  };
}

export function parseDashboardQuery(
  query: Record<string, unknown>,
): DashboardQueryResult {
  for (const key of Object.keys(query)) {
    if (key !== "window") {
      return {
        ok: false,
        error: new ApiError(
          400,
          "INVALID_QUERY_PARAMETER",
          `Unknown query parameter: ${key}.`,
          { [key]: `Unknown query parameter: ${key}.` },
        ),
      };
    }
  }

  const rawWindow = query.window;
  if (rawWindow !== undefined && rawWindow !== DASHBOARD_WINDOW_KEY) {
    return invalidWindow("window must be 7d.");
  }

  return { ok: true, value: DASHBOARD_WINDOW_KEY };
}

function metric(value: number, path: string, query: Record<string, string>): DashboardMetric {
  return { value, drillDown: { path, query } };
}

function windowDrillDown(window: DashboardWindow): Record<string, string> {
  return {
    windowStart: window.start.toISOString(),
    windowEnd: window.end.toISOString(),
  };
}

function ownerPreview(
  owner: StaffPreviewRecord["assignedTo"] | RequesterPreviewRecord["assignedTo"],
): DashboardTicketOwner | null {
  return owner === null
    ? null
    : { id: owner.id, displayName: owner.displayName, role: owner.role };
}

function serializeStaffPreview(ticket: StaffPreviewRecord): DashboardTicketPreview {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    summary: ticket.summary,
    currentStatus: ticket.currentStatus,
    itPriority: ticket.itPriority,
    ticketOwner: ownerPreview(ticket.assignedTo),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

function serializeRequesterPreview(ticket: RequesterPreviewRecord): RequesterTicketPreview {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    summary: ticket.summary,
    currentStatus: ticket.currentStatus,
    requestedPriority: ticket.requestedPriority,
    itPriority: ticket.itPriority,
    ticketOwner: ownerPreview(ticket.assignedTo),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

function windowUpdatedWhere(window: DashboardWindow): Prisma.TicketWhereInput {
  return { updatedAt: { gte: window.start, lt: window.end } };
}

function activeWhere(): Prisma.TicketWhereInput {
  return { currentStatus: { in: [...ACTIVE_TICKET_STATUSES] } };
}

function staffStatusDrillDown(path: string, status: CurrentStatus): DashboardDrillDown {
  return { path, query: { currentStatus: status } };
}

function staffPriorityDrillDown(path: string, priority: ItPriority): DashboardDrillDown {
  return { path, query: { itPriority: priority, scope: "active" } };
}

async function readRequesterDashboard(
  transaction: DashboardExecutor,
  requesterId: number,
  asOf: Date,
  window: DashboardWindow,
): Promise<RequesterDashboardData> {
  const owner = { requesterId };
  const [
    openTicketCount,
    waitingForRequesterCount,
    recentlyUpdatedTicketCount,
    recentlyResolvedTicketCount,
    resolutionIndicationCount,
    recentTickets,
  ] = await Promise.all([
    transaction.ticket.count({ where: { ...owner, ...activeWhere() } }),
    transaction.ticket.count({
      where: { ...owner, currentStatus: "WAITING_FOR_REQUESTER" },
    }),
    transaction.ticket.count({ where: { ...owner, ...windowUpdatedWhere(window) } }),
    transaction.ticket.count({
      where: {
        ...owner,
        currentStatus: { in: ["RESOLVED", "CLOSED"] },
        resolvedAt: { gte: window.start, lt: window.end },
      },
    }),
    transaction.ticket.count({
      where: {
        ...owner,
        requesterResolutionIndicatedAt: { not: null },
        ...activeWhere(),
      },
    }),
    transaction.ticket.findMany({
      where: { ...owner, ...windowUpdatedWhere(window) },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 5,
      select: requesterPreviewSelect,
    }),
  ]);

  return {
    asOf: asOf.toISOString(),
    reportTimeZone: REPORT_TIME_ZONE,
    window: serializeDashboardWindow(window),
    metrics: {
      openTicketCount: metric(openTicketCount, "/my-tickets", { scope: "active" }),
      waitingForRequesterCount: metric(
        waitingForRequesterCount,
        "/my-tickets",
        { currentStatus: "WAITING_FOR_REQUESTER" },
      ),
      recentlyUpdatedTicketCount: metric(
        recentlyUpdatedTicketCount,
        "/my-tickets",
        { updatedWithin: "7d", ...windowDrillDown(window) },
      ),
      recentlyResolvedTicketCount: metric(
        recentlyResolvedTicketCount,
        "/my-tickets",
        { resolvedWithin: "7d", ...windowDrillDown(window) },
      ),
      resolutionIndicationCount: metric(
        resolutionIndicationCount,
        "/my-tickets",
        { resolutionIndicated: "true" },
      ),
    },
    recentTickets: recentTickets.map(serializeRequesterPreview),
  };
}

async function readStaffDashboard(
  transaction: DashboardExecutor,
  currentUserId: number,
  asOf: Date,
  window: DashboardWindow,
  drillDownPath: "/staff/tickets" | "/admin/tickets",
): Promise<StaffDashboardData> {
  const [
    unassignedActiveCount,
    myAssignedActiveCount,
    urgentActiveCount,
    recentlyUpdatedCount,
    statusGroups,
    priorityGroups,
    recentTickets,
    urgentTickets,
  ] = await Promise.all([
    transaction.ticket.count({
      where: { assignedToUserId: null, ...activeWhere() },
    }),
    transaction.ticket.count({
      where: { assignedToUserId: currentUserId, ...activeWhere() },
    }),
    transaction.ticket.count({
      where: { itPriority: "URGENT", ...activeWhere() },
    }),
    transaction.ticket.count({ where: windowUpdatedWhere(window) }),
    transaction.ticket.groupBy({
      by: ["currentStatus"],
      _count: { _all: true },
    }),
    transaction.ticket.groupBy({
      by: ["itPriority"],
      where: activeWhere(),
      _count: { _all: true },
    }),
    transaction.ticket.findMany({
      where: windowUpdatedWhere(window),
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 5,
      select: staffPreviewSelect,
    }),
    transaction.ticket.findMany({
      where: { itPriority: "URGENT", ...activeWhere() },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 5,
      select: staffPreviewSelect,
    }),
  ]);

  const statusCounts = new Map(
    statusGroups.map((row) => [row.currentStatus, row._count._all]),
  );
  const priorityCounts = new Map(
    priorityGroups.map((row) => [row.itPriority, row._count._all]),
  );

  return {
    asOf: asOf.toISOString(),
    reportTimeZone: REPORT_TIME_ZONE,
    window: serializeDashboardWindow(window),
    metrics: {
      unassignedActiveCount: metric(
        unassignedActiveCount,
        drillDownPath,
        { assignment: "unassigned", scope: "active" },
      ),
      myAssignedActiveCount: metric(
        myAssignedActiveCount,
        drillDownPath,
        { assignment: "mine", scope: "active" },
      ),
      urgentActiveCount: metric(
        urgentActiveCount,
        drillDownPath,
        { itPriority: "URGENT", scope: "active" },
      ),
      recentlyUpdatedCount: metric(
        recentlyUpdatedCount,
        drillDownPath,
        { updatedWithin: "7d", ...windowDrillDown(window) },
      ),
      ticketsByStatus: TICKET_STATUSES.map((status) => ({
        status,
        value: statusCounts.get(status) ?? 0,
        drillDown: staffStatusDrillDown(drillDownPath, status),
      })),
      ticketsByItPriority: IT_PRIORITIES.map((itPriority) => ({
        itPriority,
        value: priorityCounts.get(itPriority) ?? 0,
        drillDown: staffPriorityDrillDown(drillDownPath, itPriority),
      })),
    },
    recentTickets: recentTickets.map(serializeStaffPreview),
    urgentTickets: urgentTickets.map(serializeStaffPreview),
  };
}

export async function getRequesterDashboard(
  prisma: PrismaClient,
  requesterId: number,
): Promise<DashboardResponse<RequesterDashboardData>> {
  const asOf = new Date();
  const window = dashboardWindowFor(asOf);
  return prisma.$transaction(
    async (transaction) => {
      await setReadOnlySnapshot(transaction);
      return { data: await readRequesterDashboard(transaction, requesterId, asOf, window) };
    },
    { isolationLevel: "RepeatableRead" },
  );
}

export async function getStaffDashboard(
  prisma: PrismaClient,
  currentUserId: number,
): Promise<DashboardResponse<StaffDashboardData>> {
  const asOf = new Date();
  const window = dashboardWindowFor(asOf);
  return prisma.$transaction(
    async (transaction) => {
      await setReadOnlySnapshot(transaction);
      return {
        data: await readStaffDashboard(
          transaction,
          currentUserId,
          asOf,
          window,
          "/staff/tickets",
        ),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}

export async function getAdministratorDashboard(
  prisma: PrismaClient,
  currentUserId: number,
): Promise<DashboardResponse<AdministratorDashboardData>> {
  const asOf = new Date();
  const window = dashboardWindowFor(asOf);
  return prisma.$transaction(
    async (transaction) => {
      await setReadOnlySnapshot(transaction);
      const [staffData, activeUserCount, inactiveUserCount] = await Promise.all([
        readStaffDashboard(transaction, currentUserId, asOf, window, "/admin/tickets"),
        transaction.user.count({ where: { isActive: true } }),
        transaction.user.count({ where: { isActive: false } }),
      ]);

      return {
        data: {
          ...staffData,
          metrics: {
            ...staffData.metrics,
            activeUserCount: metric(activeUserCount, "/admin/users", { isActive: "true" }),
            inactiveUserCount: metric(inactiveUserCount, "/admin/users", { isActive: "false" }),
          },
        },
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}

