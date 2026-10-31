import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getStaffDashboard } from "../../src/dashboard-service.js";
import { listActionTaken } from "../../src/action-taken-service.js";
import {
  activeReferences,
  createTestUser,
  prisma,
} from "./test-support.js";

const DASHBOARD_BUDGET_MS = 750;
const ACTION_LIST_BUDGET_MS = 500;
const TICKET_COUNT = 1000;
const ACTION_COUNT = 20;

describe("Lab 4 performance smoke regression", () => {
  let staffId: number;
  let ticketIds: number[] = [];
  let busyTicketId: number;

  beforeAll(async () => {
    const staff = await createTestUser("IT_STAFF", "issue28-performance-staff");
    staffId = staff.id;
    const references = await activeReferences();
    const now = new Date(Date.now() - 60_000);

    const ticketRows = Array.from({ length: TICKET_COUNT }, (_, index) => ({
      ticketNumber: `TT-ISSUE28-P-${Date.now()}-${index}-${randomUUID().slice(0, 6)}`,
      ticketDate: now,
      requesterId: staffId,
      categoryId: references.category.id,
      relatedSystemId: references.relatedSystem.id,
      summary: `Performance smoke Ticket ${index}`,
      description: "A bounded aggregate fixture for the final release regression.",
      requestedPriority: "MEDIUM" as const,
      itPriority: index % 10 === 0 ? "URGENT" as const : "MEDIUM" as const,
      currentStatus: index % 5 === 0 ? "OPEN" as const : "IN_PROGRESS" as const,
      idempotencyKey: `issue28-performance-ticket-${Date.now()}-${index}-${randomUUID()}`,
    }));
    await prisma.ticket.createMany({ data: ticketRows });
    const tickets = await prisma.ticket.findMany({
      where: { idempotencyKey: { startsWith: "issue28-performance-ticket-" } },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    ticketIds = tickets.map((ticket) => ticket.id);
    expect(ticketIds.length).toBeGreaterThanOrEqual(TICKET_COUNT);
    busyTicketId = ticketIds[0] as number;

    await prisma.actionTaken.createMany({
      data: Array.from({ length: ACTION_COUNT }, (_, index) => ({
        ticketId: busyTicketId,
        actionDateTime: new Date(now.getTime() + index * 1000),
        description: `Performance smoke Action Taken ${index}`,
        result: "The bounded list fixture remains queryable.",
        performedById: staffId,
        followUpRequired: index % 2 === 0,
        followUpNote: index % 2 === 0 ? "Review the next service window." : null,
        attachmentNotes: null,
      })),
    });
  }, 120_000);

  afterAll(async () => {
    await prisma.actionTaken.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    await prisma.user.delete({ where: { id: staffId } });
  }, 120_000);

  it("keeps dashboard aggregates within the documented 750 ms budget for 1,000 Tickets", async () => {
    const startedAt = performance.now();
    const result = await getStaffDashboard(prisma, staffId);
    const elapsedMs = performance.now() - startedAt;

    expect(result.data.metrics.ticketsByStatus.reduce((sum, metric) => sum + metric.value, 0)).toBeGreaterThanOrEqual(TICKET_COUNT);
    expect(elapsedMs, `dashboard aggregate took ${elapsedMs.toFixed(1)} ms`).toBeLessThan(DASHBOARD_BUDGET_MS);
  });

  it("keeps paged Actions Taken listing within the documented 500 ms budget", async () => {
    const startedAt = performance.now();
    const result = await listActionTaken(prisma, busyTicketId, staffId, "IT_STAFF", {
      page: 1,
      pageSize: 20,
    });
    const elapsedMs = performance.now() - startedAt;

    expect(result.data).toHaveLength(ACTION_COUNT);
    expect(result.meta.totalItems).toBe(ACTION_COUNT);
    expect(elapsedMs, `Action Taken page took ${elapsedMs.toFixed(1)} ms`).toBeLessThan(ACTION_LIST_BUDGET_MS);
  });
});
