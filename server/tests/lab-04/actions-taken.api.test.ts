import { randomUUID } from "node:crypto";

import argon2 from "argon2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

const prisma = getPrisma();
const origin = "http://localhost:5173";
const password = "Issue24Actions1!";

let requesterId: number;
let staffId: number;
let administratorId: number;
let ticketId: number;
let foreignTicketId: number;
let actionId: number;
let replayActionId: number;

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

function actionBody(overrides: Record<string, unknown> = {}) {
  return {
    actionAt: new Date(Date.now() - 60_000).toISOString(),
    actionDescription: "Checked the service logs and restarted the affected process.",
    result: "The service returned to a healthy state.",
    followUpRequired: true,
    followUpNote: "Confirm the error rate with the requester tomorrow.",
    attachmentNotes: null,
    ...overrides,
  };
}

function ticketEtag(version: number, id = ticketId): string {
  return `"ticket-${id}-v${version}"`;
}

function actionEtag(version: number, id = actionId): string {
  return `"action-taken-${id}-v${version}"`;
}

function idempotencyKey(label: string): string {
  return `i24-${randomUUID()}-${label.slice(0, 12)}`;
}

describe("Issue 24 Actions Taken API and authorization", () => {
  beforeAll(async () => {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const [requester, staff, administrator] = await Promise.all([
      prisma.user.create({
        data: {
          displayName: "Issue 24 Requester",
          email: `issue24-requester-${randomUUID()}@example.test`,
          passwordHash,
          role: "REQUESTER",
          isActive: true,
          mustChangePassword: false,
        },
      }),
      prisma.user.create({
        data: {
          displayName: "Issue 24 IT Staff",
          email: `issue24-staff-${randomUUID()}@example.test`,
          passwordHash,
          role: "IT_STAFF",
          isActive: true,
          mustChangePassword: false,
        },
      }),
      prisma.user.create({
        data: {
          displayName: "Issue 24 Administrator",
          email: `issue24-admin-${randomUUID()}@example.test`,
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
    const [ownedTicket, foreignTicket] = await Promise.all([
      prisma.ticket.create({
        data: {
          ticketNumber: `TT-ISSUE24-${randomUUID().slice(0, 8)}`,
          ticketDate: new Date("2026-10-01T02:00:00.000Z"),
          requesterId,
          categoryId: category.id,
          relatedSystemId: relatedSystem.id,
          summary: "Issue 24 owned Ticket",
          description: "A Ticket used to verify Actions Taken ownership.",
          requestedPriority: "MEDIUM",
          itPriority: "MEDIUM",
          currentStatus: "OPEN",
          idempotencyKey: `issue24-ticket-${randomUUID()}`,
        },
      }),
      prisma.ticket.create({
        data: {
          ticketNumber: `TT-ISSUE24-F-${randomUUID().slice(0, 8)}`,
          ticketDate: new Date("2026-10-01T03:00:00.000Z"),
          requesterId: staffId,
          categoryId: category.id,
          relatedSystemId: relatedSystem.id,
          summary: "Issue 24 foreign Ticket",
          description: "A Ticket outside the Requester ownership scope.",
          requestedPriority: "LOW",
          itPriority: "LOW",
          currentStatus: "OPEN",
          idempotencyKey: `issue24-foreign-ticket-${randomUUID()}`,
        },
      }),
    ]);
    ticketId = ownedTicket.id;
    foreignTicketId = foreignTicket.id;
  });

  afterAll(async () => {
    await prisma.actionTakenIdempotency.deleteMany({
      where: { ticketId: { in: [ticketId, foreignTicketId] } },
    });
    await prisma.actionTaken.deleteMany({ where: { ticketId: { in: [ticketId, foreignTicketId] } } });
    await prisma.ticket.deleteMany({ where: { id: { in: [ticketId, foreignTicketId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [requesterId, staffId, administratorId] } } });
    await prisma.$disconnect();
  });

  it("creates under the requested Ticket and derives performedBy from the authenticated IT Staff session", async () => {
    const staff = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: staffId } })).email,
    );
    const body = actionBody();
    const response = await sameOrigin(
      staff
        .post(`/api/tickets/${ticketId}/actions-taken`)
        .set("Idempotency-Key", idempotencyKey("staff-create"))
        .set("If-Match", ticketEtag(1))
        .send(body),
    );

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      ticketId,
      performedBy: { id: staffId, role: "IT_STAFF" },
      followUpRequired: true,
      followUpNote: "Confirm the error rate with the requester tomorrow.",
    });
    expect(response.body.data).not.toHaveProperty("performedById");
    expect(response.headers.etag).toBe(actionEtag(1, response.body.data.id));
    expect(response.body.meta).toEqual({ idempotentReplay: false, ticketVersion: 2 });
    actionId = response.body.data.id;

    const persisted = await prisma.actionTaken.findUniqueOrThrow({ where: { id: BigInt(actionId) } });
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(persisted.ticketId).toBe(ticketId);
    expect(persisted.performedById).toBe(staffId);
    expect(ticket.version).toBe(2);
  });

  it("enforces the three-role matrix: Requester can view owned history but cannot create or update", async () => {
    const requester = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: requesterId } })).email,
    );

    const visible = await requester.get(`/api/tickets/${ticketId}/actions-taken`);
    expect(visible.status).toBe(200);
    expect(visible.body.data).toHaveLength(1);
    expect(visible.body.data[0].performedBy.id).toBe(staffId);

    const createForbidden = await sameOrigin(
      requester.post(`/api/tickets/${ticketId}/actions-taken`).send(actionBody()),
    );
    expect(createForbidden.status).toBe(403);
    expect(createForbidden.body.error.code).toBe("FORBIDDEN");

    const updateForbidden = await sameOrigin(
      requester.patch(`/api/actions-taken/${actionId}`).send({ result: "Forged update" }),
    );
    expect(updateForbidden.status).toBe(403);
    expect(updateForbidden.body.error.code).toBe("FORBIDDEN");

    const foreign = await requester.get(`/api/tickets/${foreignTicketId}/actions-taken`);
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe("TICKET_NOT_FOUND");
  });

  it("requires and validates every create/update concurrency precondition", async () => {
    const staff = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: staffId } })).email,
    );

    const missingKey = await sameOrigin(
      staff.post(`/api/tickets/${ticketId}/actions-taken`).send(actionBody()),
    );
    expect(missingKey.status).toBe(400);
    expect(missingKey.body.error.code).toBe("VALIDATION_ERROR");

    const missingTicketEtag = await sameOrigin(
      staff
        .post(`/api/tickets/${ticketId}/actions-taken`)
        .set("Idempotency-Key", idempotencyKey("missing-ticket-etag"))
        .send(actionBody()),
    );
    expect(missingTicketEtag.status).toBe(428);
    expect(missingTicketEtag.body.error.code).toBe("PRECONDITION_REQUIRED");

    const malformedKey = await sameOrigin(
      staff
        .post(`/api/tickets/${ticketId}/actions-taken`)
        .set("Idempotency-Key", "bad key")
        .set("If-Match", ticketEtag(2))
        .send(actionBody()),
    );
    expect(malformedKey.status).toBe(400);
    expect(malformedKey.body.error.code).toBe("VALIDATION_ERROR");

    const malformedTicketEtag = await sameOrigin(
      staff
        .post(`/api/tickets/${ticketId}/actions-taken`)
        .set("Idempotency-Key", idempotencyKey("malformed-ticket-etag"))
        .set("If-Match", "ticket-v2")
        .send(actionBody()),
    );
    expect(malformedTicketEtag.status).toBe(400);
    expect(malformedTicketEtag.body.error.code).toBe("VALIDATION_ERROR");

    const missingActionEtag = await sameOrigin(
      staff
        .patch(`/api/actions-taken/${actionId}`)
        .send({ result: "A valid update with no action ETag.", expectedTicketVersion: 2 }),
    );
    expect(missingActionEtag.status).toBe(428);
    expect(missingActionEtag.body.error.code).toBe("PRECONDITION_REQUIRED");

    const missingExpectedTicketVersion = await sameOrigin(
      staff
        .patch(`/api/actions-taken/${actionId}`)
        .set("If-Match", actionEtag(1))
        .send({ result: "A valid update with no parent version." }),
    );
    expect(missingExpectedTicketVersion.status).toBe(428);
    expect(missingExpectedTicketVersion.body.error.code).toBe("PRECONDITION_REQUIRED");

    const malformedActionEtag = await sameOrigin(
      staff
        .patch(`/api/actions-taken/${actionId}`)
        .set("If-Match", "action-v1")
        .send({ result: "A valid update.", expectedTicketVersion: 2 }),
    );
    expect(malformedActionEtag.status).toBe(400);
    expect(malformedActionEtag.body.error.code).toBe("VALIDATION_ERROR");

    const malformedExpectedTicketVersion = await sameOrigin(
      staff
        .patch(`/api/actions-taken/${actionId}`)
        .set("If-Match", actionEtag(1))
        .send({ result: "A valid update.", expectedTicketVersion: "2" }),
    );
    expect(malformedExpectedTicketVersion.status).toBe(400);
    expect(malformedExpectedTicketVersion.body.error.code).toBe("VALIDATION_ERROR");

    const actionCount = await prisma.actionTaken.count({ where: { ticketId } });
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(actionCount).toBe(1);
    expect(ticket.version).toBe(2);
  });

  it("allows Administrator create/update while enforcing conditional follow-up validation", async () => {
    const administrator = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: administratorId } })).email,
    );

    const invalid = await sameOrigin(
      administrator
        .post(`/api/tickets/${ticketId}/actions-taken`)
        .send(actionBody({ followUpRequired: true, followUpNote: null })),
    );
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("VALIDATION_ERROR");
    expect(invalid.body.error.fields.followUpNote).toMatch(/required/i);

    const forged = await sameOrigin(
      administrator
        .post(`/api/tickets/${ticketId}/actions-taken`)
        .send(actionBody({ performedById: requesterId })),
    );
    expect(forged.status).toBe(400);
    expect(forged.body.error.fields.performedById).toBeDefined();

    const created = await sameOrigin(
      administrator
        .post(`/api/tickets/${ticketId}/actions-taken`)
        .set("Idempotency-Key", idempotencyKey("administrator-create"))
        .set("If-Match", ticketEtag(2))
        .send(actionBody({ followUpRequired: false, followUpNote: null })),
    );
    expect(created.status).toBe(201);
    expect(created.body.data.performedBy.id).toBe(administratorId);
    expect(created.body.meta.ticketVersion).toBe(3);

    const updated = await sameOrigin(
      administrator
        .patch(`/api/actions-taken/${actionId}`)
        .set("If-Match", actionEtag(1))
        .send({
          actionDescription: "Updated by the Administrator for verification.",
          result: "The validation and role boundary were verified.",
          followUpRequired: false,
          followUpNote: null,
          expectedTicketVersion: 3,
        }),
    );
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({
      id: actionId,
      ticketId,
      actionDescription: "Updated by the Administrator for verification.",
      performedBy: { id: staffId },
      followUpRequired: false,
      followUpNote: null,
      updatedBy: { id: administratorId, role: "ADMINISTRATOR" },
    });
    expect(updated.body.data.version).toBe(2);
    expect(updated.body.meta.ticketVersion).toBe(4);
    expect(updated.headers.etag).toBe(actionEtag(2));
  });

  it("persists idempotency records, replays exact retries, and rejects conflicts", async () => {
    const staff = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: staffId } })).email,
    );
    const body = actionBody({
      actionDescription: "Recorded once and retried after the parent version advanced.",
      followUpRequired: false,
      followUpNote: null,
    });
    const key = idempotencyKey("durable-replay");

    const first = await sameOrigin(
      staff
        .post(`/api/tickets/${ticketId}/actions-taken`)
        .set("Idempotency-Key", key)
        .set("If-Match", ticketEtag(4))
        .send(body),
    );
    expect(first.status).toBe(201);
    replayActionId = first.body.data.id;
    expect(first.body.meta).toEqual({ idempotentReplay: false, ticketVersion: 5 });

    const persistedKey = await prisma.actionTakenIdempotency.findUniqueOrThrow({
      where: { scope_key: { scope: "actions-taken:create", key } },
    });
    expect(persistedKey).toMatchObject({
      actorId: staffId,
      ticketId,
      actionId: BigInt(replayActionId),
      ticketVersion: 5,
    });
    expect(persistedKey.payloadHash).toMatch(/^[a-f0-9]{64}$/u);

    const countAfterFirst = await prisma.actionTaken.count({ where: { ticketId } });
    const administrator = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: administratorId } })).email,
    );
    const parentAdvance = await sameOrigin(
      administrator
        .post(`/api/tickets/${ticketId}/actions-taken`)
        .set("Idempotency-Key", idempotencyKey("advance-parent"))
        .set("If-Match", ticketEtag(5))
        .send(actionBody({
          actionDescription: "Advanced the parent Ticket after the original request.",
          followUpRequired: false,
          followUpNote: null,
        })),
    );
    expect(parentAdvance.status).toBe(201);
    expect(parentAdvance.body.meta.ticketVersion).toBe(6);

    const replay = await sameOrigin(
      staff
        .post(`/api/tickets/${ticketId}/actions-taken`)
        .set("Idempotency-Key", key)
        .set("If-Match", ticketEtag(4))
        .send(body),
    );
    expect(replay.status).toBe(200);
    expect(replay.body.data.id).toBe(replayActionId);
    expect(replay.body.meta).toEqual({ idempotentReplay: true, ticketVersion: 5 });
    expect(await prisma.actionTaken.count({ where: { ticketId } })).toBe(countAfterFirst + 1);

    const changedPayload = await sameOrigin(
      staff
        .post(`/api/tickets/${ticketId}/actions-taken`)
        .set("Idempotency-Key", key)
        .set("If-Match", ticketEtag(5))
        .send({ ...body, result: "Changed payload must not replay." }),
    );
    expect(changedPayload.status).toBe(409);
    expect(changedPayload.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");

    const crossUser = await sameOrigin(
      administrator
        .post(`/api/tickets/${ticketId}/actions-taken`)
        .set("Idempotency-Key", key)
        .set("If-Match", ticketEtag(6))
        .send(body),
    );
    expect(crossUser.status).toBe(409);
    expect(crossUser.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(await prisma.actionTaken.count({ where: { ticketId } })).toBe(countAfterFirst + 1);
  });

  it("rejects stale writes without leaving partial Action Taken or Ticket changes", async () => {
    const staff = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: staffId } })).email,
    );
    const beforeTicket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    const beforeAction = await prisma.actionTaken.findUniqueOrThrow({
      where: { id: BigInt(actionId) },
    });
    const beforeCount = await prisma.actionTaken.count({ where: { ticketId } });

    const staleCreate = await sameOrigin(
      staff
        .post(`/api/tickets/${ticketId}/actions-taken`)
        .set("Idempotency-Key", idempotencyKey("stale-create"))
        .set("If-Match", ticketEtag(4))
        .send(actionBody({ result: "This stale create must roll back." })),
    );
    expect(staleCreate.status).toBe(412);
    expect(staleCreate.body.error.code).toBe("STALE_WRITE");

    const staleUpdate = await sameOrigin(
      staff
        .patch(`/api/actions-taken/${actionId}`)
        .set("If-Match", actionEtag(1))
        .send({
          result: "This stale update must not overwrite the newer result.",
          expectedTicketVersion: beforeTicket.version,
        }),
    );
    expect(staleUpdate.status).toBe(412);
    expect(staleUpdate.body.error.code).toBe("STALE_WRITE");

    const afterTicket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    const afterAction = await prisma.actionTaken.findUniqueOrThrow({
      where: { id: BigInt(actionId) },
    });
    expect(await prisma.actionTaken.count({ where: { ticketId } })).toBe(beforeCount);
    expect(afterTicket.version).toBe(beforeTicket.version);
    expect(afterTicket.updatedAt).toEqual(beforeTicket.updatedAt);
    expect(afterAction.version).toBe(beforeAction.version);
    expect(afterAction.result).toBe(beforeAction.result);
    expect(afterAction.updatedById).toBe(beforeAction.updatedById);
  });
});
