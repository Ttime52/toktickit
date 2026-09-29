import { randomUUID } from "node:crypto";

import argon2 from "argon2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

const prisma = getPrisma();
const origin = "http://localhost:5173";
const password = "RequesterIssue4Password1!";
const ticketNumber = `TT-ISSUE4-${randomUUID().slice(0, 8)}`;
const idempotencyKey = `issue4-${randomUUID()}`;
let requesterId: number;
let otherRequesterId: number;
let staffId: number;
let administratorId: number;
let ticketId: number;
let categoryId: number;
let relatedSystemId: number;

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

describe("Issue 4 requester regression (API-03)", () => {
  beforeAll(async () => {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const [requester, otherRequester, staff, administrator] = await Promise.all([
      prisma.user.create({
        data: {
          displayName: "Issue 4 Requester",
          email: `issue4-requester-${randomUUID()}@example.test`,
          passwordHash,
          role: "REQUESTER",
          isActive: true,
          mustChangePassword: false,
        },
      }),
      prisma.user.create({
        data: {
          displayName: "Issue 4 Other Requester",
          email: `issue4-other-${randomUUID()}@example.test`,
          passwordHash,
          role: "REQUESTER",
          isActive: true,
          mustChangePassword: false,
        },
      }),
      prisma.user.create({
        data: {
          displayName: "Issue 4 Staff",
          email: `issue4-staff-${randomUUID()}@example.test`,
          passwordHash,
          role: "IT_STAFF",
          isActive: true,
          mustChangePassword: false,
        },
      }),
      prisma.user.create({
        data: {
          displayName: "Issue 4 Administrator",
          email: `issue4-admin-${randomUUID()}@example.test`,
          passwordHash,
          role: "ADMINISTRATOR",
          isActive: true,
          mustChangePassword: false,
        },
      }),
    ]);
    requesterId = requester.id;
    otherRequesterId = otherRequester.id;
    staffId = staff.id;
    administratorId = administrator.id;

    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
    categoryId = category.id;
    relatedSystemId = relatedSystem.id;

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber,
        ticketDate: new Date(),
        requesterId,
        categoryId,
        relatedSystemId,
        summary: "Issue 4 requester regression ticket",
        description: "A safe fixture for authenticated requester regression coverage.",
        requestedPriority: "MEDIUM",
        itPriority: "MEDIUM",
        currentStatus: "IN_PROGRESS",
        idempotencyKey,
      },
    });
    ticketId = ticket.id;
  });

  afterAll(async () => {
    await prisma.publicComment.deleteMany({ where: { ticketId } });
    await prisma.internalNote.deleteMany({ where: { ticketId } });
    await prisma.ticket.delete({ where: { id: ticketId } });
    await prisma.user.deleteMany({
      where: { id: { in: [requesterId, otherRequesterId, staffId, administratorId] } },
    });
    await prisma.$disconnect();
  });

  it("retires the legacy requester selector endpoints", async () => {
    const [developmentRequester, requesterList] = await Promise.all([
      request(app).get("/api/development-requesters"),
      request(app).get("/api/requesters"),
    ]);

    for (const response of [developmentRequester, requesterList]) {
      expect(response.status).toBe(410);
      expect(response.body.error.code).toBe("ENDPOINT_RETIRED");
    }
  });

  it("derives ownership from the session and ignores a spoofed requesterId body", async () => {
    const agent = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: requesterId } })).email,
    );

    const created = await sameOrigin(
      agent
        .post("/api/tickets")
        .set("Idempotency-Key", `issue4-create-${randomUUID()}`)
        .send({
          requesterId: otherRequesterId,
          categoryId,
          relatedSystemId,
          summary: "Authenticated requester wins",
          description: "The server must use the logged-in identity for ownership.",
        }),
    );

    expect(created.status).toBe(400);
    expect(created.body.error.fields.requesterId).toBeDefined();

    const ownTicket = await agent.get(`/api/tickets/${ticketId}`);
    expect(ownTicket.status).toBe(200);
    expect(ownTicket.body.data.requester.id).toBe(requesterId);

    const spoofedQuery = await agent
      .get(`/api/tickets/${ticketId}`)
      .query({ requesterId: otherRequesterId });
    expect(spoofedQuery.status).toBe(400);
  });

  it("records a one-time indication without changing formal status", async () => {
    const agent = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: requesterId } })).email,
    );
    const response = await sameOrigin(
      agent
        .post(`/api/tickets/${ticketId}/problem-appears-resolved`)
        .send({ confirm: true }),
    );

    expect(response.status).toBe(200);
    expect(response.body.data.currentStatus).toBe("IN_PROGRESS");
    expect(response.body.data.requesterResolutionIndicatedAt).toEqual(expect.any(String));

    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(stored.currentStatus).toBe("IN_PROGRESS");
    expect(stored.requesterResolutionIndicatedByUserId).toBe(requesterId);

    const duplicate = await sameOrigin(
      agent
        .post(`/api/tickets/${ticketId}/problem-appears-resolved`)
        .send({ confirm: true }),
    );
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("RESOLUTION_INDICATION_ALREADY_RECORDED");
  });

  it("supports Public Comments while keeping Administrator read-only for communication", async () => {
    const owner = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: requesterId } })).email,
    );
    const other = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: otherRequesterId } })).email,
    );
    const staff = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: staffId } })).email,
    );
    const administrator = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: administratorId } })).email,
    );

    const ownerComment = await sameOrigin(
      owner.post(`/api/tickets/${ticketId}/comments`).send({ content: "Requester update" }),
    );
    expect(ownerComment.status).toBe(201);
    expect(ownerComment.body.data.author.role).toBe("REQUESTER");

    const staffComment = await sameOrigin(
      staff.post(`/api/tickets/${ticketId}/comments`).send({ content: "Staff reply" }),
    );
    expect(staffComment.status).toBe(201);
    expect(staffComment.body.data.author.role).toBe("IT_STAFF");

    const visibleToOwner = await owner.get(`/api/tickets/${ticketId}/comments`);
    expect(visibleToOwner.status).toBe(200);
    expect(visibleToOwner.body.data.map((comment: { content: string }) => comment.content)).toEqual([
      "Requester update",
      "Staff reply",
    ]);

    const foreign = await other.get(`/api/tickets/${ticketId}/comments`);
    expect(foreign.status).toBe(404);
    expect(JSON.stringify(foreign.body)).not.toContain("Staff reply");

    const administratorRead = await administrator.get(`/api/tickets/${ticketId}/comments`);
    expect(administratorRead.status).toBe(200);
    const administratorPost = await sameOrigin(
      administrator.post(`/api/tickets/${ticketId}/comments`).send({ content: "Not allowed" }),
    );
    expect(administratorPost.status).toBe(403);
    expect(JSON.stringify(administratorPost.body)).not.toContain("Not allowed");

    const internalNotes = await administrator.get(`/api/tickets/${ticketId}/internal-notes`);
    expect(internalNotes.status).toBe(200);
    expect(internalNotes.body.data).toEqual([]);
  });

  it("lets an Administrator inspect a Ticket through the shared detail route without Attachment data", async () => {
    const staff = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: staffId } })).email,
    );
    const note = await sameOrigin(
      staff
        .post(`/api/tickets/${ticketId}/internal-notes`)
        .send({ content: "Administrator inspection note." }),
    );
    expect(note.status).toBe(201);

    const administrator = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: administratorId } })).email,
    );
    const detail = await administrator.get(`/api/tickets/${ticketId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({
      id: ticketId,
      requester: { id: requesterId },
      currentStatus: "IN_PROGRESS",
      ticketOwner: null,
      assignedTo: null,
      assignedAt: null,
    });
    expect(detail.body.data).not.toHaveProperty("attachments");
    expect(JSON.stringify(detail.body)).not.toContain("Administrator inspection note.");

    const notes = await administrator.get(`/api/tickets/${ticketId}/internal-notes`);
    expect(notes.status).toBe(200);
    expect(notes.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ content: "Administrator inspection note." })]),
    );
  });
});
