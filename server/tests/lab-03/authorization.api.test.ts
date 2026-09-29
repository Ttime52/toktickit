import { randomUUID } from "node:crypto";

import argon2 from "argon2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

const prisma = getPrisma();
const origin = "http://localhost:5173";
const password = "Issue3Authorization1!";
const requesterEmail = `issue3-authz-requester-${randomUUID()}@example.test`;
const staffEmail = `issue3-authz-staff-${randomUUID()}@example.test`;
const administratorEmail = `issue3-authz-admin-${randomUUID()}@example.test`;
let requesterId: number;
let staffId: number;
let administratorId: number;

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

describe("Lab 3 server-side authorization (API-02/API-06/API-10)", () => {
  beforeAll(async () => {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const [requester, staff, administrator] = await Promise.all([
      prisma.user.create({
        data: {
          displayName: "Issue 3 Authorization Requester",
          email: requesterEmail,
          passwordHash,
          role: "REQUESTER",
          isActive: true,
          mustChangePassword: false,
        },
      }),
      prisma.user.create({
        data: {
          displayName: "Issue 3 Authorization IT Staff",
          email: staffEmail,
          passwordHash,
          role: "IT_STAFF",
          isActive: true,
          mustChangePassword: false,
        },
      }),
      prisma.user.create({
        data: {
          displayName: "Issue 3 Authorization Administrator",
          email: administratorEmail,
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
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [requesterId, staffId, administratorId] } },
    });
    await prisma.$disconnect();
  });

  it("requires authentication and enforces the Staff queue role matrix", async () => {
    const unauthenticated = await request(app).get("/api/staff/tickets");
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body.error.code).toBe("AUTHENTICATION_REQUIRED");

    const requester = await login(requesterEmail);
    const requesterResponse = await requester.get("/api/staff/tickets");
    expect(requesterResponse.status).toBe(403);
    expect(requesterResponse.body.error.code).toBe("FORBIDDEN");

    const administrator = await login(administratorEmail);
    const administratorResponse = await administrator.get("/api/staff/tickets");
    expect(administratorResponse.status).toBe(403);
    expect(administratorResponse.body.error.code).toBe("FORBIDDEN");

    const staff = await login(staffEmail);
    const staffResponse = await staff.get("/api/staff/tickets");
    expect(staffResponse.status).toBe(200);
  });

  it("enforces REQUESTER-only authorization on requester Ticket APIs", async () => {
    for (const email of [staffEmail, administratorEmail]) {
      const agent = await login(email);
      const forbidden = await sameOrigin(
        agent.post("/api/tickets").send({}),
      );
      expect(forbidden.status).toBe(403);
      expect(forbidden.body.error.code).toBe("FORBIDDEN");
    }
  });

  it("enforces Administrator-only authorization on User Management APIs", async () => {
    for (const email of [requesterEmail, staffEmail]) {
      const agent = await login(email);
      const forbidden = await agent.get("/api/users");
      expect(forbidden.status).toBe(403);
      expect(forbidden.body.error.code).toBe("FORBIDDEN");
    }

    const administrator = await login(administratorEmail);
    const allowed = await administrator.get("/api/users");
    expect(allowed.status).toBe(200);
    expect(allowed.body).toHaveProperty("data");
  });
});
