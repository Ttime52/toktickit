import { randomUUID } from "node:crypto";

import argon2 from "argon2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

const prisma = getPrisma();
const origin = "http://localhost:5173";
const password = "Issue5QueuePassword1!";
let requesterId: number;
let staffId: number;
let administratorId: number;
let assignedTicketId: number;
let unassignedTicketId: number;
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

describe("Issue 5 IT Staff Ticket Queue (API-04/API-06)", () => {
  beforeAll(async () => {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const [requester, staff, administrator] = await Promise.all([
      prisma.user.create({
        data: {
          displayName: "Issue 5 Queue Requester",
          email: `issue5-requester-${randomUUID()}@example.test`,
          passwordHash,
          role: "REQUESTER",
          isActive: true,
          mustChangePassword: false,
        },
      }),
      prisma.user.create({
        data: {
          displayName: "Issue 5 Queue Staff",
          email: `issue5-staff-${randomUUID()}@example.test`,
          passwordHash,
          role: "IT_STAFF",
          isActive: true,
          mustChangePassword: false,
        },
      }),
      prisma.user.create({
        data: {
          displayName: "Issue 5 Queue Administrator",
          email: `issue5-admin-${randomUUID()}@example.test`,
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
    categoryId = category.id;
    relatedSystemId = relatedSystem.id;

    const [assigned, unassigned] = await Promise.all([
      prisma.ticket.create({
        data: {
          ticketNumber: `TT-ISSUE5-A-${randomUUID().slice(0, 8)}`,
          ticketDate: new Date("2026-09-18T01:00:00.000Z"),
          requesterId,
          categoryId,
          relatedSystemId,
          summary: "Queue assigned battery issue",
          description: "The assigned Ticket is searchable in the IT Staff queue.",
          requestedPriority: "HIGH",
          itPriority: "URGENT",
          currentStatus: "IN_PROGRESS",
          assignedToUserId: staffId,
          assignedAt: new Date("2026-09-18T01:10:00.000Z"),
          idempotencyKey: `issue5-a-${randomUUID()}`,
        },
      }),
      prisma.ticket.create({
        data: {
          ticketNumber: `TT-ISSUE5-U-${randomUUID().slice(0, 8)}`,
          ticketDate: new Date("2026-09-17T01:00:00.000Z"),
          requesterId,
          categoryId,
          relatedSystemId,
          summary: "Queue unassigned monitor issue",
          description: "The unassigned Ticket is searchable in the IT Staff queue.",
          requestedPriority: "LOW",
          itPriority: "LOW",
          currentStatus: "NEW",
          idempotencyKey: `issue5-u-${randomUUID()}`,
        },
      }),
    ]);
    assignedTicketId = assigned.id;
    unassignedTicketId = unassigned.id;
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({ where: { id: { in: [assignedTicketId, unassignedTicketId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [requesterId, staffId, administratorId] } } });
    await prisma.$disconnect();
  });

  it("returns 403 when an authenticated Requester calls the queue directly", async () => {
    const requester = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: requesterId } })).email,
    );
    const response = await requester.get("/api/staff/tickets");
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("returns all staff queue fields and applies assignment/search/sort/page filters", async () => {
    const staff = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: staffId } })).email,
    );
    const response = await staff
      .get("/api/staff/tickets")
      .query({
        search: "battery",
        assignment: "mine",
        sortBy: "itPriority",
        sortOrder: "desc",
        page: "1",
        pageSize: "10",
      });

    expect(response.status).toBe(200);
    expect(response.body.meta).toMatchObject({ totalItems: 1, page: 1, pageSize: 10 });
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      id: assignedTicketId,
      ticketOwner: { id: staffId, role: "IT_STAFF" },
      assignedTo: { id: staffId, role: "IT_STAFF" },
      requestedPriority: "HIGH",
      itPriority: "URGENT",
      currentStatus: "IN_PROGRESS",
      requesterResolutionIndicatedAt: null,
    });
    expect(response.body.data[0].requester.email).toContain("issue5-requester-");
  });

  it("keeps the Administrator out of the staff queue per the documented role matrix", async () => {
    const administrator = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: administratorId } })).email,
    );
    const response = await administrator.get("/api/staff/tickets");
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });
});
