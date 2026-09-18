import { randomUUID } from "node:crypto";

import argon2 from "argon2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

const prisma = getPrisma();
const origin = "http://localhost:5173";
const currentPassword = "CurrentPassword1!";
const nextPassword = "ChangedPassword2@";
const email = `issue3-auth-${randomUUID()}@example.test`;
let userId: number;
let staffId: number;
let administratorId: number;

function sameOrigin(requestBuilder: request.Test) {
  return requestBuilder.set("Origin", origin);
}

describe("Issue 3 authentication and authorization (API-01)", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        displayName: "Issue 3 Auth User",
        email,
        passwordHash: await argon2.hash(currentPassword, { type: argon2.argon2id }),
        role: "REQUESTER",
        isActive: true,
        mustChangePassword: true,
      },
    });
    userId = user.id;
    const sharedHash = await argon2.hash(currentPassword, { type: argon2.argon2id });
    const [staff, administrator] = await Promise.all([
      prisma.user.create({
        data: {
          displayName: "Issue 3 IT Staff",
          email: `issue3-staff-${randomUUID()}@example.test`,
          passwordHash: sharedHash,
          role: "IT_STAFF",
          isActive: true,
          mustChangePassword: false,
        },
      }),
      prisma.user.create({
        data: {
          displayName: "Issue 3 Administrator",
          email: `issue3-admin-${randomUUID()}@example.test`,
          passwordHash: sharedHash,
          role: "ADMINISTRATOR",
          isActive: true,
          mustChangePassword: false,
        },
      }),
    ]);
    staffId = staff.id;
    administratorId = administrator.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await prisma.user.delete({ where: { id: staffId } });
    await prisma.user.delete({ where: { id: administratorId } });
    await prisma.$disconnect();
  });

  it("requires an authenticated session and hides account state on failed login", async () => {
    const unauthenticated = await request(app).get("/api/categories");
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body.error.code).toBe("AUTHENTICATION_REQUIRED");

    const invalid = await sameOrigin(
      request(app).post("/api/auth/login").send({ email, password: "wrong-password" }),
    );
    expect(invalid.status).toBe(401);
    expect(invalid.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(JSON.stringify(invalid.body)).not.toContain(email);
  });

  it("establishes a cookie session, enforces the password gate, rotates on change, and logs out", async () => {
    const agent = request.agent(app);
    const login = await sameOrigin(
      agent.post("/api/auth/login").send({ email, password: currentPassword }),
    );

    expect(login.status).toBe(200);
    expect(login.body.data.user).toMatchObject({
      id: userId,
      email,
      role: "REQUESTER",
      isActive: true,
      mustChangePassword: true,
    });
    expect(login.headers["set-cookie"]).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/toktickit_session=[^;]+/u),
        expect.stringMatching(/HttpOnly/iu),
        expect.stringMatching(/SameSite=Lax/iu),
      ]),
    );

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(email);

    const gated = await agent.get("/api/categories");
    expect(gated.status).toBe(403);
    expect(gated.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");

    const changed = await sameOrigin(
      agent
        .post("/api/auth/change-password")
        .send({ currentPassword, newPassword: nextPassword }),
    );
    expect(changed.status).toBe(200);
    expect(changed.body.data.user).toMatchObject({
      email,
      mustChangePassword: false,
    });

    const allowed = await agent.get("/api/categories");
    expect(allowed.status).toBe(200);

    const logout = await sameOrigin(agent.post("/api/auth/logout"));
    expect(logout.status).toBe(204);
    expect(logout.headers["set-cookie"]).toEqual(
      expect.arrayContaining([expect.stringMatching(/toktickit_session=;/u)]),
    );

    const afterLogout = await agent.get("/api/auth/me");
    expect(afterLogout.status).toBe(401);
  });

  it("returns a generic throttle response after five failures", async () => {
    const throttleEmail = `issue3-throttle-${randomUUID()}@example.test`;
    const responses = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      responses.push(
        await sameOrigin(
          request(app)
            .post("/api/auth/login")
            .send({ email: throttleEmail, password: "wrong-password" }),
        ),
      );
    }
    expect(responses.slice(0, 4).every((response) => response.status === 401)).toBe(true);
    expect(responses[4]?.status).toBe(429);
    expect(responses[4]?.body.error.code).toBe("AUTHENTICATION_RATE_LIMITED");
    expect(JSON.stringify(responses[4]?.body)).not.toContain(throttleEmail);
  });

  it("enforces REQUESTER-only authorization on requester Ticket APIs", async () => {
    const staff = await prisma.user.findUniqueOrThrow({ where: { id: staffId } });
    const administrator = await prisma.user.findUniqueOrThrow({
      where: { id: administratorId },
    });
    for (const account of [staff, administrator]) {
      const agent = request.agent(app);
      const login = await sameOrigin(
        agent.post("/api/auth/login").send({ email: account.email, password: currentPassword }),
      );
      expect(login.status).toBe(200);
      const forbidden = await agent
        .post("/api/tickets")
        .set("Origin", origin)
        .send({});
      expect(forbidden.status).toBe(403);
      expect(forbidden.body.error.code).toBe("FORBIDDEN");
    }
  });
});
