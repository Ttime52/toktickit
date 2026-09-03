import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";

import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

const prisma = getPrisma();
const createdTicketIds: number[] = [];

function idempotencyKey() {
  return randomUUID();
}

async function validBody() {
  const [requester, category, relatedSystem] = await Promise.all([
    prisma.developmentRequester.findFirst({ where: { isActive: true } }),
    prisma.category.findFirst({ where: { isActive: true }, orderBy: { id: "asc" } }),
    prisma.relatedSystem.findFirst({ where: { isActive: true }, orderBy: { id: "asc" } }),
  ]);

  if (requester === null || category === null || relatedSystem === null) {
    throw new Error("Issue 4 seed data is missing.");
  }

  return {
    requesterId: requester.id,
    categoryId: category.id,
    relatedSystemId: relatedSystem.id,
    summary: "  Laptop battery drains quickly  ",
    description: "  The laptop battery drops below 20 percent after a short meeting.  ",
  };
}

async function rememberTicket(idempotency: string) {
  const ticket = await prisma.ticket.findUnique({ where: { idempotencyKey: idempotency } });
  if (ticket !== null) createdTicketIds.push(ticket.id);
  return ticket;
}

afterAll(async () => {
  if (createdTicketIds.length > 0) {
    await prisma.attachment.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  }
});

describe("POST /api/tickets (API-03/API-04/API-05/API-06)", () => {
  it("persists a valid Ticket with generated values and relationships", async () => {
    const body = await validBody();
    const key = idempotencyKey();

    const response = await request(app)
      .post("/api/tickets")
      .set("Idempotency-Key", key)
      .send(body);

    expect(response.status).toBe(201);
    expect(response.body.meta).toEqual({ idempotentReplay: false });
    expect(response.body.data).toMatchObject({
      ticketNumber: expect.stringMatching(/^TT-\d{4}-\d{6}$/u),
      requester: {
        id: body.requesterId,
      },
      category: {
        id: body.categoryId,
      },
      relatedSystem: {
        id: body.relatedSystemId,
      },
      summary: "Laptop battery drains quickly",
      description: "The laptop battery drops below 20 percent after a short meeting.",
      requestedPriority: "MEDIUM",
      itPriority: null,
      currentStatus: "NEW",
      attachments: [],
    });
    expect(response.body.data.ticketDate).toMatch(/Z$/u);
    expect(Object.keys(response.body.data)).not.toContain("requesterId");
    expect(JSON.stringify(response.body)).not.toContain("storageKey");

    const persisted = await rememberTicket(key);
    expect(persisted).toMatchObject({
      requesterId: body.requesterId,
      categoryId: body.categoryId,
      relatedSystemId: body.relatedSystemId,
      summary: "Laptop battery drains quickly",
      description: "The laptop battery drops below 20 percent after a short meeting.",
      requestedPriority: "MEDIUM",
      currentStatus: "NEW",
    });
  });

  it("replays an equivalent request and rejects a changed payload", async () => {
    const body = await validBody();
    const key = idempotencyKey();
    const first = await request(app).post("/api/tickets").set("Idempotency-Key", key).send(body);
    const replay = await request(app).post("/api/tickets").set("Idempotency-Key", key).send(body);
    const conflict = await request(app)
      .post("/api/tickets")
      .set("Idempotency-Key", key)
      .send({ ...body, summary: "A different valid summary" });

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
    const body = await validBody();
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
      const response = await request(app)
        .post("/api/tickets")
        .set("Idempotency-Key", key)
        .send(invalidBody);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(await prisma.ticket.count({ where: { idempotencyKey: key } })).toBe(0);
    }
  });

  it("rejects inactive or missing references without a partial Ticket", async () => {
    const body = await validBody();
    const inactiveRequester = await prisma.developmentRequester.findFirst({
      where: { isActive: false },
    });
    if (inactiveRequester === null) throw new Error("Inactive seed requester is missing.");

    const inactiveResponse = await request(app)
      .post("/api/tickets")
      .set("Idempotency-Key", idempotencyKey())
      .send({ ...body, requesterId: inactiveRequester.id });
    const missingReferenceKey = idempotencyKey();
    const missingReferenceResponse = await request(app)
      .post("/api/tickets")
      .set("Idempotency-Key", missingReferenceKey)
      .send({ ...body, categoryId: 999999999 });

    expect(inactiveResponse.status).toBe(400);
    expect(inactiveResponse.body.error.code).toBe("REQUESTER_CONTEXT_INVALID");
    expect(missingReferenceResponse.status).toBe(400);
    expect(missingReferenceResponse.body.error.code).toBe("INVALID_REFERENCE");
    expect(await prisma.ticket.count({ where: { idempotencyKey: missingReferenceKey } })).toBe(0);
  });

  it("requires a valid Idempotency-Key", async () => {
    const response = await request(app).post("/api/tickets").send(await validBody());

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(JSON.stringify(response.body)).not.toContain("stack");
  });
});
