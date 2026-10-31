import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  activeReferences,
  createTestUser,
  loginAs,
  prisma,
} from "./test-support.js";

describe("Requester Dashboard final regression", () => {
  let requesterId: number;
  let requesterEmail: string;
  let foreignId: number;
  let foreignEmail: string;
  const ticketIds: number[] = [];

  beforeAll(async () => {
    const [requester, foreign] = await Promise.all([
      createTestUser("REQUESTER", "issue28-requester-dashboard"),
      createTestUser("REQUESTER", "issue28-requester-dashboard-foreign"),
    ]);
    requesterId = requester.id;
    requesterEmail = requester.email;
    foreignId = foreign.id;
    foreignEmail = foreign.email;
    const references = await activeReferences();
    const [owned, foreignTicket] = await Promise.all([
      prisma.ticket.create({
        data: {
          ticketNumber: `TT-ISSUE28-R-${randomUUID().slice(0, 8)}`,
          ticketDate: new Date(),
          requesterId,
          categoryId: references.category.id,
          relatedSystemId: references.relatedSystem.id,
          summary: "Requester dashboard owned Ticket",
          description: "Evidence for authenticated owner-scoped dashboard metrics.",
          requestedPriority: "HIGH",
          itPriority: "MEDIUM",
          currentStatus: "OPEN",
          idempotencyKey: `issue28-requester-dashboard-${randomUUID()}`,
        },
      }),
      prisma.ticket.create({
        data: {
          ticketNumber: `TT-ISSUE28-RF-${randomUUID().slice(0, 8)}`,
          ticketDate: new Date(),
          requesterId: foreignId,
          categoryId: references.category.id,
          relatedSystemId: references.relatedSystem.id,
          summary: "Foreign dashboard Ticket",
          description: "This record must never appear in another requester's metrics.",
          requestedPriority: "LOW",
          itPriority: "LOW",
          currentStatus: "OPEN",
          idempotencyKey: `issue28-requester-dashboard-foreign-${randomUUID()}`,
        },
      }),
    ]);
    ticketIds.push(owned.id, foreignTicket.id);
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [requesterId, foreignId] } } });
  });

  it("returns Bangkok-window metrics scoped to the authenticated owner", async () => {
    const response = await (await loginAs(requesterEmail)).get("/api/dashboard/requester?window=7d");
    expect(response.status).toBe(200);
    expect(response.body.data.reportTimeZone).toBe("Asia/Bangkok");
    expect(response.body.data.window).toMatchObject({ key: "7d" });
    expect(response.body.data.metrics.openTicketCount.value).toBeGreaterThanOrEqual(1);
    expect(response.body.data.recentTickets.every((ticket: { id: number }) => ticket.id !== ticketIds[1])).toBe(true);
    expect(response.body.data.metrics.openTicketCount.drillDown).toEqual({ path: "/my-tickets", query: { scope: "active" } });
  });

  it("rejects forged dashboard selectors and enforces role boundaries", async () => {
    const requester = await loginAs(requesterEmail);
    const forged = await requester.get("/api/dashboard/requester?userId=999999");
    expect(forged.status).toBe(400);
    expect(forged.body.error.code).toBe("INVALID_QUERY_PARAMETER");
    const forbidden = await requester.get("/api/dashboard/staff");
    expect(forbidden.status).toBe(403);
    const foreign = await (await loginAs(foreignEmail)).get("/api/dashboard/requester");
    expect(foreign.status).toBe(200);
    expect(foreign.body.data.metrics.openTicketCount.value).toBeGreaterThanOrEqual(1);
  });
});
