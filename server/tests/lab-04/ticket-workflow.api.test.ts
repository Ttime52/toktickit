import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

import {
  activeReferences,
  createTestUser,
  loginAs,
  prisma,
  sameOrigin,
} from "./test-support.js";

describe("Final Ticket workflow regression", () => {
  let requesterId: number;
  let staffId: number;
  let administratorId: number;
  let requesterEmail: string;
  let staffEmail: string;
  let administratorEmail: string;
  let ticketId: number;

  beforeAll(async () => {
    const [requester, staff, administrator] = await Promise.all([
      createTestUser("REQUESTER", "issue28-workflow-requester"),
      createTestUser("IT_STAFF", "issue28-workflow-staff"),
      createTestUser("ADMINISTRATOR", "issue28-workflow-admin"),
    ]);
    requesterId = requester.id;
    staffId = staff.id;
    administratorId = administrator.id;
    requesterEmail = requester.email;
    staffEmail = staff.email;
    administratorEmail = administrator.email;
    const references = await activeReferences();
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `TT-ISSUE28-${randomUUID().slice(0, 8)}`,
        ticketDate: new Date("2026-10-12T02:00:00.000Z"),
        requesterId,
        categoryId: references.category.id,
        relatedSystemId: references.relatedSystem.id,
        summary: "Issue 28 workflow regression",
        description: "A Ticket used to verify status transitions and concurrency hardening.",
        requestedPriority: "MEDIUM",
        itPriority: "MEDIUM",
        currentStatus: "OPEN",
        idempotencyKey: `issue28-workflow-${randomUUID()}`,
      },
    });
    ticketId = ticket.id;
  });

  afterAll(async () => {
    await prisma.ticket.delete({ where: { id: ticketId } });
    await prisma.user.deleteMany({ where: { id: { in: [requesterId, staffId, administratorId] } } });
  });

  function ticketEtag(version: number) {
    return `"ticket-${ticketId}-v${version}"`;
  }

  it("requires IT Staff for workflow changes and preserves the requester read model", async () => {
    const requester = await loginAs(requesterEmail);
    const detail = await requester.get(`/api/tickets/${ticketId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({ id: ticketId, currentStatus: "OPEN" });
    expect((await requester.get(`/api/tickets/${ticketId}/internal-notes`)).status).toBe(403);

    const forbidden = await sameOrigin(
      requester.patch(`/api/staff/tickets/${ticketId}`).set("If-Match", ticketEtag(1)).send({
        currentStatus: "IN_PROGRESS",
      }),
    );
    expect(forbidden.status).toBe(403);
  });

  it("runs guarded status transitions and rejects a stale duplicate retry", async () => {
    const staff = await loginAs(staffEmail);
    const opened = await staff.get(`/api/staff/tickets/${ticketId}`);
    expect(opened.status).toBe(200);
    expect(opened.headers.etag).toBe(ticketEtag(1));

    const inProgress = await sameOrigin(
      staff.patch(`/api/staff/tickets/${ticketId}`).set("If-Match", ticketEtag(1)).send({
        currentStatus: "IN_PROGRESS",
      }),
    );
    expect(inProgress.status).toBe(200);
    expect(inProgress.headers.etag).toBe(ticketEtag(2));

    const missingEvidence = await sameOrigin(
      staff.patch(`/api/staff/tickets/${ticketId}`).set("If-Match", ticketEtag(2)).send({
        currentStatus: "RESOLVED",
        confirmStatusChange: true,
      }),
    );
    expect(missingEvidence.status).toBe(400);
    expect(missingEvidence.body.error.code).toBe("STATUS_CONFIRMATION_REQUIRED");

    const resolved = await sameOrigin(
      staff.patch(`/api/staff/tickets/${ticketId}`).set("If-Match", ticketEtag(2)).send({
        currentStatus: "RESOLVED",
        confirmStatusChange: true,
        resolutionSummary: "The service was repaired and verified with the requester.",
      }),
    );
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.currentStatus).toBe("RESOLVED");
    expect(resolved.headers.etag).toBe(ticketEtag(3));

    const staleRetry = await sameOrigin(
      staff.patch(`/api/staff/tickets/${ticketId}`).set("If-Match", ticketEtag(2)).send({
        currentStatus: "RESOLVED",
        confirmStatusChange: true,
        resolutionSummary: "The service was repaired and verified with the requester.",
      }),
    );
    expect(staleRetry.status).toBe(412);
    expect(staleRetry.body.error.code).toBe("STALE_WRITE");
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).version).toBe(3);
  });

  it("keeps Administrator changes read-only except IT Priority", async () => {
    const administrator = await loginAs(administratorEmail);
    const forbidden = await sameOrigin(
      administrator.patch(`/api/staff/tickets/${ticketId}`).set("If-Match", ticketEtag(3)).send({
        currentStatus: "CLOSED",
        confirmStatusChange: true,
        closureSummary: "Closure is not an administrator operation.",
      }),
    );
    expect(forbidden.status).toBe(403);
    const priority = await sameOrigin(
      administrator.patch(`/api/staff/tickets/${ticketId}`).set("If-Match", ticketEtag(3)).send({
        itPriority: "URGENT",
      }),
    );
    expect(priority.status).toBe(200);
    expect(priority.body.data.itPriority).toBe("URGENT");
  });
});
