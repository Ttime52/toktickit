import { randomUUID } from "node:crypto";

import argon2 from "argon2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

const prisma = getPrisma();
const origin = "http://localhost:5173";
const password = "Issue27DashboardPassword1!";

let requesterId: number;
let staffId: number;
let administratorId: number;
let ticketIds: number[] = [];

function sameOrigin(builder: request.Test) {
  return builder.set("Origin", origin);
}

async function login(email: string) {
  const agent = request.agent(app);
  const response = await sameOrigin(
    agent.post("/api/auth/login").send({ email, password }),
  );
  expect(response.status).toBe(200);
  return agent;
}

describe("Issue 27 role dashboards and drill-downs", () => {
  beforeAll(async () => {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const [requester, staff, administrator] = await Promise.all([
      prisma.user.create({
        data: {
          displayName: "Issue 27 Dashboard Requester",
          email: `issue27-requester-${randomUUID()}@example.test`,
          passwordHash,
          role: "REQUESTER",
          isActive: true,
          mustChangePassword: false,
        },
      }),
      prisma.user.create({
        data: {
          displayName: "Issue 27 Dashboard Staff",
          email: `issue27-staff-${randomUUID()}@example.test`,
          passwordHash,
          role: "IT_STAFF",
          isActive: true,
          mustChangePassword: false,
        },
      }),
      prisma.user.create({
        data: {
          displayName: "Issue 27 Dashboard Administrator",
          email: `issue27-admin-${randomUUID()}@example.test`,
          passwordHash,
          role: "ADMINISTRATOR",
          isActive: true,
          mustChangePassword: false,
        },
      }),
    ]);
    requesterId = requester.id;
    staffId = staff.id;
    administratorId = administrator.id;

    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
    const now = new Date();
    const makeTicket = (suffix: string, data: Record<string, unknown>) =>
      prisma.ticket.create({
        data: {
          ticketNumber: `TT-ISSUE27-${suffix}-${randomUUID().slice(0, 8)}`,
          ticketDate: new Date(now.getTime() - 60_000),
          requesterId,
          categoryId: category.id,
          relatedSystemId: relatedSystem.id,
          summary: `Issue 27 ${suffix}`,
          description: "Dashboard fixture Ticket.",
          requestedPriority: "MEDIUM",
          itPriority: "HIGH",
          currentStatus: "OPEN",
          idempotencyKey: `issue27-${suffix}-${randomUUID()}`,
          ...data,
        },
      });

    const created = await Promise.all([
      makeTicket("OWN-ACTIVE", { currentStatus: "IN_PROGRESS", itPriority: "URGENT" }),
      makeTicket("OWN-WAITING", { currentStatus: "WAITING_FOR_REQUESTER" }),
      makeTicket("OWN-RESOLVED", {
        currentStatus: "RESOLVED",
        resolvedAt: now,
        resolutionSummary: "A documented resolution for dashboard coverage.",
      }),
      prisma.ticket.create({
        data: {
          ticketNumber: `TT-ISSUE27-FOREIGN-${randomUUID().slice(0, 8)}`,
          ticketDate: new Date(now.getTime() - 60_000),
          requesterId: staffId,
          categoryId: category.id,
          relatedSystemId: relatedSystem.id,
          summary: "Issue 27 foreign Ticket",
          description: "A Ticket outside the requester scope.",
          requestedPriority: "LOW",
          itPriority: "URGENT",
          currentStatus: "OPEN",
          assignedToUserId: staffId,
          idempotencyKey: `issue27-foreign-${randomUUID()}`,
        },
      }),
      makeTicket("OWN-INDICATION", {
        currentStatus: "IN_PROGRESS",
        requesterResolutionIndicatedAt: now,
        requesterResolutionIndicatedByUserId: requesterId,
      }),
      makeTicket("STAFF-UNASSIGNED", {
        requesterId: staffId,
        currentStatus: "NEW",
        assignedToUserId: null,
        itPriority: "URGENT",
      }),
      makeTicket("STAFF-MINE", {
        requesterId: staffId,
        currentStatus: "IN_PROGRESS",
        assignedToUserId: staffId,
      }),
      makeTicket("STAFF-CLOSED", {
        requesterId: staffId,
        currentStatus: "CLOSED",
        closedAt: now,
        resolvedAt: now,
      }),
    ]);
    ticketIds = created.map((ticket) => ticket.id);
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [requesterId, staffId, administratorId] } } });
    await prisma.$disconnect();
  });

  it("scopes Requester metrics to the authenticated owner and exposes evidence", async () => {
    const requester = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: requesterId } })).email,
    );
    const response = await requester.get("/api/dashboard/requester?window=7d");

    expect(response.status).toBe(200);
    expect(response.body.data.reportTimeZone).toBe("Asia/Bangkok");
    expect(response.body.data.window).toMatchObject({ key: "7d" });
    expect(response.body.data.recentTickets.length).toBeLessThanOrEqual(5);
    expect(response.body.data.recentTickets.every((ticket: { id: number }) => ticketIds.includes(ticket.id))).toBe(true);

    const start = new Date(response.body.data.window.start);
    const end = new Date(response.body.data.window.end);
    const expectedOpen = await prisma.ticket.count({
      where: {
        requesterId,
        currentStatus: { in: ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"] },
      },
    });
    const expectedUpdated = await prisma.ticket.count({
      where: { requesterId, updatedAt: { gte: start, lt: end } },
    });
    const expectedResolved = await prisma.ticket.count({
      where: {
        requesterId,
        currentStatus: { in: ["RESOLVED", "CLOSED"] },
        resolvedAt: { gte: start, lt: end },
      },
    });
    const expectedIndicated = await prisma.ticket.count({
      where: {
        requesterId,
        requesterResolutionIndicatedAt: { not: null },
        currentStatus: { in: ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"] },
      },
    });
    expect(response.body.data.metrics.openTicketCount.value).toBe(expectedOpen);
    expect(response.body.data.metrics.recentlyUpdatedTicketCount.value).toBe(expectedUpdated);
    expect(response.body.data.metrics.recentlyResolvedTicketCount.value).toBe(expectedResolved);
    expect(response.body.data.metrics.resolutionIndicationCount.value).toBe(expectedIndicated);
    expect(response.body.data.metrics.openTicketCount.drillDown).toEqual({
      path: "/my-tickets",
      query: { scope: "active" },
    });
    expect(response.body.data.metrics.recentlyUpdatedTicketCount.drillDown).toEqual({
      path: "/my-tickets",
      query: {
        updatedWithin: "7d",
        windowStart: response.body.data.window.start,
        windowEnd: response.body.data.window.end,
      },
    });
    expect(response.body.data.metrics.recentlyResolvedTicketCount.drillDown.query).toEqual({
      resolvedWithin: "7d",
      windowStart: response.body.data.window.start,
      windowEnd: response.body.data.window.end,
    });

    const exactRecentDrillDown = new URLSearchParams(
      response.body.data.metrics.recentlyUpdatedTicketCount.drillDown.query,
    );
    const exactRecentList = await requester.get(`/api/tickets?${exactRecentDrillDown.toString()}`);
    expect(exactRecentList.status).toBe(200);
    expect(exactRecentList.body.meta.totalItems).toBe(expectedUpdated);

    const indicationDrillDown = await requester.get("/api/tickets?resolutionIndicated=true");
    expect(indicationDrillDown.status).toBe(200);
    expect(indicationDrillDown.body.data.map((ticket: { id: number }) => ticket.id)).toContain(
      ticketIds[4],
    );
  });

  it("returns all staff buckets and administrator read-only aggregates", async () => {
    const staff = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: staffId } })).email,
    );
    const staffResponse = await staff.get("/api/dashboard/staff");
    expect(staffResponse.status).toBe(200);
    expect(staffResponse.body.data.metrics.ticketsByStatus).toHaveLength(8);
    expect(staffResponse.body.data.metrics.ticketsByItPriority).toHaveLength(4);
    expect(staffResponse.body.data.metrics.ticketsByStatus.map((row: { status: string }) => row.status)).toEqual([
      "NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED",
    ]);

    const administrator = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: administratorId } })).email,
    );
    const adminResponse = await administrator.get("/api/dashboard/administrator");
    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body.data.metrics.activeUserCount.value).toBe(
      await prisma.user.count({ where: { isActive: true } }),
    );
    expect(adminResponse.body.data.metrics.unassignedActiveCount.drillDown.path).toBe("/admin/tickets");

    const activeUsers = await administrator.get("/api/users?isActive=true");
    const inactiveUsers = await administrator.get("/api/users?isActive=false");
    expect(activeUsers.status).toBe(200);
    expect(inactiveUsers.status).toBe(200);
    expect(activeUsers.body.data.every((user: { isActive: boolean }) => user.isActive)).toBe(true);
    expect(inactiveUsers.body.data.every((user: { isActive: boolean }) => !user.isActive)).toBe(true);
  });

  it("enforces role boundaries and rejects forged dashboard selectors", async () => {
    const requester = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: requesterId } })).email,
    );
    expect((await requester.get("/api/dashboard/staff")).status).toBe(403);
    expect((await requester.get("/api/dashboard/requester?userId=999")).status).toBe(400);

    const staff = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: staffId } })).email,
    );
    expect((await staff.get("/api/dashboard/administrator")).status).toBe(403);
    expect((await staff.get("/api/admin/tickets")).status).toBe(403);

    const administrator = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: administratorId } })).email,
    );
    const drillDown = await administrator.get("/api/admin/tickets?scope=active&itPriority=URGENT");
    expect(drillDown.status).toBe(200);
    expect(drillDown.body.data.every((ticket: { inspectionPath: string }) => ticket.inspectionPath.startsWith("/tickets/"))).toBe(true);
  });
});

