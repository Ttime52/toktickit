import { randomUUID } from "node:crypto";

import argon2 from "argon2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

const prisma = getPrisma();
const origin = "http://localhost:5173";
const password = "Issue6CommunicationPassword1!";
let requesterId: number;
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

describe("Issue 6 Public Comments and Internal Notes (API-07/API-08)", () => {
  beforeAll(async () => {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const [requester, staff, administrator] = await Promise.all([
      prisma.user.create({
        data: {
          displayName: "Issue 6 Communication Requester",
          email: `issue6-communication-requester-${randomUUID()}@example.test`,
          passwordHash,
          role: "REQUESTER",
          isActive: true,
          mustChangePassword: false,
        },
      }),
      prisma.user.create({
        data: {
          displayName: "Issue 6 Communication Staff",
          email: `issue6-communication-staff-${randomUUID()}@example.test`,
          passwordHash,
          role: "IT_STAFF",
          isActive: true,
          mustChangePassword: false,
        },
      }),
      prisma.user.create({
        data: {
          displayName: "Issue 6 Communication Administrator",
          email: `issue6-communication-admin-${randomUUID()}@example.test`,
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

    categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true } })).id;
    relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id;
    ticketId = (
      await prisma.ticket.create({
        data: {
          ticketNumber: `TT-ISSUE6-C-${randomUUID().slice(0, 8)}`,
          ticketDate: new Date("2026-09-18T04:00:00.000Z"),
          requesterId,
          categoryId,
          relatedSystemId,
          summary: "Communication contract",
          description: "A safe test Ticket for comments and notes.",
          requestedPriority: "LOW",
          itPriority: "LOW",
          currentStatus: "OPEN",
          idempotencyKey: `issue6-communication-${randomUUID()}`,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.publicComment.deleteMany({ where: { ticketId } });
    await prisma.internalNote.deleteMany({ where: { ticketId } });
    await prisma.ticket.delete({ where: { id: ticketId } });
    await prisma.user.deleteMany({ where: { id: { in: [requesterId, staffId, administratorId] } } });
    await prisma.$disconnect();
  });

  it("keeps Internal Notes private while allowing Administrator read-only access", async () => {
    const requester = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: requesterId } })).email,
    );
    const requesterResponse = await requester.get(`/api/tickets/${ticketId}/notes`);
    expect(requesterResponse.status).toBe(403);
    expect(requesterResponse.body).not.toHaveProperty("data");

    const administrator = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: administratorId } })).email,
    );
    const adminRead = await administrator.get(`/api/tickets/${ticketId}/internal-notes`);
    expect(adminRead.status).toBe(200);
    expect(adminRead.body.data).toEqual([]);
    const adminWrite = await sameOrigin(
      administrator.post(`/api/tickets/${ticketId}/notes`).send({ content: "Admin note" }),
    );
    expect(adminWrite.status).toBe(403);
  });

  it("validates and appends Internal Notes for IT Staff only", async () => {
    const staff = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: staffId } })).email,
    );
    const blank = await sameOrigin(
      staff.post(`/api/tickets/${ticketId}/notes`).send({ content: " \n " }),
    );
    expect(blank.status).toBe(400);
    const created = await sameOrigin(
      staff.post(`/api/tickets/${ticketId}/notes`).send({ content: "Trimmed operational note." }),
    );
    expect(created.status).toBe(201);
    expect(created.body.data.content).toBe("Trimmed operational note.");

    const notes = await staff.get(`/api/tickets/${ticketId}/internal-notes`);
    expect(notes.status).toBe(200);
    expect(notes.body.data).toHaveLength(1);
    expect(notes.body.data[0]).toMatchObject({ content: "Trimmed operational note." });
  });

  it("shares Public Comments with every Ticket viewer but keeps posting restricted", async () => {
    const requester = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: requesterId } })).email,
    );
    const requesterPost = await sameOrigin(
      requester.post(`/api/tickets/${ticketId}/comments`).send({ content: "Requester update." }),
    );
    expect(requesterPost.status).toBe(201);

    const staff = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: staffId } })).email,
    );
    const staffPost = await sameOrigin(
      staff.post(`/api/tickets/${ticketId}/comments`).send({ content: "Staff update." }),
    );
    expect(staffPost.status).toBe(201);

    const administrator = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: administratorId } })).email,
    );
    const adminRead = await administrator.get(`/api/tickets/${ticketId}/comments`);
    expect(adminRead.status).toBe(200);
    expect(adminRead.body.data.map((comment: { content: string }) => comment.content)).toEqual([
      "Requester update.",
      "Staff update.",
    ]);
    const adminPost = await sameOrigin(
      administrator.post(`/api/tickets/${ticketId}/comments`).send({ content: "Admin update." }),
    );
    expect(adminPost.status).toBe(403);
  });
});
