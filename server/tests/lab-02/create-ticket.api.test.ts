import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";

import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import {
  activeReferences,
  createTestUser,
  loginAs,
  sameOrigin,
  TEST_PASSWORD,
} from "../lab-04/test-support.js";

const prisma = getPrisma();
const createdTicketIds: number[] = [];
const createdUserIds: number[] = [];

function idempotencyKey() {
  return randomUUID();
}

async function validBody(isActive = true) {
  const [requester, references] = await Promise.all([
    createTestUser("REQUESTER", "lab2-create-ticket", isActive),
    activeReferences(),
  ]);
  createdUserIds.push(requester.id);
  return {
    requester,
    agent: isActive ? await loginAs(requester.email) : null,
    body: {
      categoryId: references.category.id,
      relatedSystemId: references.relatedSystem.id,
      summary: "  Laptop battery drains quickly  ",
      description: "  The laptop battery drops below 20 percent after a short meeting.  ",
    },
  };
}

async function rememberTicket(idempotency: string) {
  const ticket = await prisma.ticket.findUnique({ where: { idempotencyKey: idempotency } });
  if (ticket !== null) createdTicketIds.push(ticket.id);
  return ticket;
}

afterAll(async () => {
  if (createdUserIds.length > 0) {
    const ownedTickets = await prisma.ticket.findMany({
      where: { requesterId: { in: createdUserIds } },
      select: { id: true },
    });
    const ticketIds = [...new Set([...createdTicketIds, ...ownedTickets.map(({ id }) => id)])];
    await prisma.attachment.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  }
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});

describe("POST /api/tickets (API-03/API-04/API-05/API-06)", () => {
  it("persists a valid Ticket with generated values and relationships", async () => {
    const { agent, body, requester } = await validBody();
    const key = idempotencyKey();

    const response = await sameOrigin(
      agent!
        .post("/api/tickets")
        .set("Idempotency-Key", key)
        .send(body),
    );

    expect(response.status).toBe(201);
    expect(response.body.meta).toEqual({ idempotentReplay: false });
    expect(response.body.data).toMatchObject({
      ticketNumber: expect.stringMatching(/^TT-\d{4}-\d{6}$/u),
      requester: { id: requester.id },
      category: { id: body.categoryId },
      relatedSystem: { id: body.relatedSystemId },
      summary: "Laptop battery drains quickly",
      description: "The laptop battery drops below 20 percent after a short meeting.",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: "NEW",
      attachments: [],
    });
    expect(response.body.data.ticketDate).toMatch(/Z$/u);
    expect(Object.keys(response.body.data)).not.toContain("requesterId");
    expect(JSON.stringify(response.body)).not.toContain("storageKey");

    const persisted = await rememberTicket(key);
    expect(persisted).toMatchObject({
      requesterId: requester.id,
      categoryId: body.categoryId,
      relatedSystemId: body.relatedSystemId,
      summary: "Laptop battery drains quickly",
      description: "The laptop battery drops below 20 percent after a short meeting.",
      requestedPriority: "MEDIUM",
      currentStatus: "NEW",
    });
  });

  it("replays an equivalent request and rejects a changed payload", async () => {
    const { agent, body } = await validBody();
    const key = idempotencyKey();
    const first = await sameOrigin(agent!.post("/api/tickets").set("Idempotency-Key", key).send(body));
    const replay = await sameOrigin(agent!.post("/api/tickets").set("Idempotency-Key", key).send(body));
    const conflict = await sameOrigin(
      agent!
        .post("/api/tickets")
        .set("Idempotency-Key", key)
        .send({ ...body, summary: "A different valid summary" }),
    );

    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replay.body.meta).toEqual({ idempotentReplay: true });
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");

    const persisted = await rememberTicket(key);
    expect(persisted).not.toBeNull();
    expect(await prisma.ticket.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it("rejects invalid form values before creating a Ticket", async () => {
    const { agent, body } = await validBody();
    const cases = [
      { ...body, summary: "   " },
      { ...body, summary: "x".repeat(121) },
      { ...body, description: "too short" },
      { ...body, description: "x".repeat(2001) },
      { ...body, requestedPriority: "INVALID" },
      { ...body, requesterId: "1" },
    ];

    for (const invalidBody of cases) {
      const key = idempotencyKey();
      const response = await sameOrigin(
        agent!.post("/api/tickets").set("Idempotency-Key", key).send(invalidBody),
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(await prisma.ticket.count({ where: { idempotencyKey: key } })).toBe(0);
    }
  });

  it("rejects inactive accounts and missing active references without a partial Ticket", async () => {
    const inactive = await validBody(false);
    const inactiveLogin = await sameOrigin(
      request(app)
        .post("/api/auth/login")
        .send({ email: inactive.requester.email, password: TEST_PASSWORD }),
    );
    expect(inactiveLogin.status).toBe(401);

    const active = await validBody();
    const missingReferenceKey = idempotencyKey();
    const missingReferenceResponse = await sameOrigin(
      active.agent!
        .post("/api/tickets")
        .set("Idempotency-Key", missingReferenceKey)
        .send({ ...active.body, categoryId: 999999999 }),
    );

    expect(missingReferenceResponse.status).toBe(400);
    expect(missingReferenceResponse.body.error.code).toBe("INVALID_REFERENCE");
    expect(await prisma.ticket.count({ where: { idempotencyKey: missingReferenceKey } })).toBe(0);
  });

  it("requires a valid Idempotency-Key", async () => {
    const { agent, body } = await validBody();
    const response = await sameOrigin(agent!.post("/api/tickets").send(body));

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(JSON.stringify(response.body)).not.toContain("stack");
  });
});
