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
    await prisma.actionTaken.deleteMany({ where: { ticketId: { in: [ticketId, foreignTicketId] } } });
    await prisma.ticket.deleteMany({ where: { id: { in: [ticketId, foreignTicketId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [requesterId, staffId, administratorId] } } });
    await prisma.$disconnect();
  });

  it("creates under the requested Ticket and derives performedBy from the authenticated IT Staff session", async () => {
    const staff = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: staffId } })).email,
    );
    const response = await sameOrigin(
      staff.post(`/api/tickets/${ticketId}/actions-taken`).send(actionBody()),
    );

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      ticketId,
      performedBy: { id: staffId, role: "IT_STAFF" },
      followUpRequired: true,
      followUpNote: "Confirm the error rate with the requester tomorrow.",
    });
    expect(response.body.data).not.toHaveProperty("performedById");
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
        .send(actionBody({ followUpRequired: false, followUpNote: null })),
    );
    expect(created.status).toBe(201);
    expect(created.body.data.performedBy.id).toBe(administratorId);

    const updated = await sameOrigin(
      administrator
        .patch(`/api/actions-taken/${actionId}`)
        .send({
          actionDescription: "Updated by the Administrator for verification.",
          result: "The validation and role boundary were verified.",
          followUpRequired: false,
          followUpNote: null,
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
  });
});
