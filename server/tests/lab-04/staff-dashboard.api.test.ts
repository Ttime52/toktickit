import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  activeReferences,
  createTestUser,
  loginAs,
  prisma,
} from "./test-support.js";

describe("IT Staff Dashboard final regression", () => {
  let requesterId: number;
  let staffId: number;
  let staffEmail: string;
  const ticketIds: number[] = [];

  beforeAll(async () => {
    const [requester, staff] = await Promise.all([
      createTestUser("REQUESTER", "issue28-staff-dashboard-requester"),
      createTestUser("IT_STAFF", "issue28-staff-dashboard"),
    ]);
    requesterId = requester.id;
    staffId = staff.id;
    staffEmail = staff.email;
    const references = await activeReferences();
    const fixtures = await Promise.all([
      prisma.ticket.create({
        data: {
          ticketNumber: `TT-ISSUE28-SU-${randomUUID().slice(0, 8)}`,
          ticketDate: new Date(), requesterId, categoryId: references.category.id, relatedSystemId: references.relatedSystem.id,
          summary: "Unassigned urgent dashboard Ticket", description: "Dashboard fixture.", requestedPriority: "URGENT", itPriority: "URGENT", currentStatus: "NEW",
          idempotencyKey: `issue28-staff-dashboard-unassigned-${randomUUID()}`,
        },
      }),
      prisma.ticket.create({
        data: {
          ticketNumber: `TT-ISSUE28-SM-${randomUUID().slice(0, 8)}`,
          ticketDate: new Date(), requesterId, categoryId: references.category.id, relatedSystemId: references.relatedSystem.id,
          summary: "Assigned dashboard Ticket", description: "Dashboard fixture.", requestedPriority: "HIGH", itPriority: "HIGH", currentStatus: "IN_PROGRESS", assignedToUserId: staffId, assignedAt: new Date(),
          idempotencyKey: `issue28-staff-dashboard-mine-${randomUUID()}`,
        },
      }),
    ]);
    ticketIds.push(...fixtures.map((ticket) => ticket.id));
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [requesterId, staffId] } } });
  });

  it("returns every status and IT-priority bucket, including zero buckets", async () => {
    const response = await (await loginAs(staffEmail)).get("/api/dashboard/staff");
    expect(response.status).toBe(200);
    expect(response.body.data.metrics.ticketsByStatus).toHaveLength(8);
    expect(response.body.data.metrics.ticketsByItPriority).toHaveLength(4);
    expect(response.body.data.metrics.ticketsByStatus.map((row: { status: string }) => row.status)).toEqual([
      "NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED",
    ]);
    expect(response.body.data.metrics.unassignedActiveCount.value).toBeGreaterThanOrEqual(1);
    expect(response.body.data.metrics.myAssignedActiveCount.value).toBeGreaterThanOrEqual(1);
  });

  it("does not expose staff metrics to a requester", async () => {
    const requester = await loginAs((await prisma.user.findUniqueOrThrow({ where: { id: requesterId } })).email);
    const response = await requester.get("/api/dashboard/staff");
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });
});
