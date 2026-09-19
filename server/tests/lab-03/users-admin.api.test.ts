import { randomUUID } from "node:crypto";

import argon2 from "argon2";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { PrismaClient } from "@prisma/client";

import { app } from "../../src/app.js";
import { updateManagedUser } from "../../src/user-management-service.js";
import { getPrisma } from "../../src/prisma.js";

const prisma = getPrisma();
const origin = "http://localhost:5173";
const password = "AdminPassword1!";
const resetPassword = "ResetPassword2@";
const createdPassword = "CreatedPassword3#";

let administratorId: number;
let requesterId: number;
let staffId: number;
let soleAdministratorId: number;
let createdUserId: number;
const userIds: number[] = [];

function sameOrigin(builder: request.Test) {
  return builder.set("Origin", origin);
}

async function login(email: string, loginPassword = password) {
  const agent = request.agent(app);
  const response = await sameOrigin(
    agent.post("/api/auth/login").send({ email, password: loginPassword }),
  );
  expect(response.status).toBe(200);
  return agent;
}

describe("Issue 7 Administrator User Management (API-09/API-10)", () => {
  beforeAll(async () => {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const [administrator, requester, staff, soleAdministrator] = await Promise.all([
      prisma.user.create({
        data: {
          displayName: "Issue 7 Administrator",
          email: `issue7-admin-${randomUUID()}@example.test`,
          passwordHash,
          role: "ADMINISTRATOR",
          isActive: true,
          mustChangePassword: false,
        },
      }),
      prisma.user.create({
        data: {
          displayName: "Issue 7 Requester",
          email: `issue7-requester-${randomUUID()}@example.test`,
          passwordHash,
          role: "REQUESTER",
          isActive: true,
          mustChangePassword: false,
        },
      }),
      prisma.user.create({
        data: {
          displayName: "Issue 7 IT Staff",
          email: `issue7-staff-${randomUUID()}@example.test`,
          passwordHash,
          role: "IT_STAFF",
          isActive: true,
          mustChangePassword: false,
        },
      }),
      prisma.user.create({
        data: {
          displayName: "Issue 7 Sole Administrator",
          email: `issue7-sole-admin-${randomUUID()}@example.test`,
          passwordHash,
          role: "ADMINISTRATOR",
          isActive: true,
          mustChangePassword: false,
        },
      }),
    ]);
    administratorId = administrator.id;
    requesterId = requester.id;
    staffId = staff.id;
    soleAdministratorId = soleAdministrator.id;
    userIds.push(administratorId, requesterId, staffId, soleAdministratorId);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("forbids non-Administrators from every User Management endpoint", async () => {
    const requester = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: requesterId } })).email,
    );
    const staff = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: staffId } })).email,
    );

    expect((await requester.get("/api/users")).status).toBe(403);
    expect((await staff.get("/api/users")).status).toBe(403);
    expect(
      (
        await sameOrigin(
          requester.post("/api/users").send({
            displayName: "Should be forbidden",
            email: `issue7-forbidden-${randomUUID()}@example.test`,
            role: "REQUESTER",
            isActive: true,
            initialPassword: createdPassword,
          }),
        )
      ).status,
    ).toBe(403);
  });

  it("lists active and inactive Users with combined search and role filters", async () => {
    const administrator = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: administratorId } })).email,
    );
    const allUsers = await administrator.get("/api/users");
    expect(allUsers.status).toBe(200);
    expect(allUsers.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: requesterId, role: "REQUESTER", isActive: true }),
        expect.objectContaining({ id: soleAdministratorId, role: "ADMINISTRATOR" }),
      ]),
    );
    expect(JSON.stringify(allUsers.body)).not.toContain("passwordHash");

    const filtered = await administrator.get(
      "/api/users?search=issue%207%20requester&role=REQUESTER",
    );
    expect(filtered.status).toBe(200);
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.data[0]).toMatchObject({ id: requesterId, role: "REQUESTER" });

    const invalidQuery = await administrator.get("/api/users?page=1");
    expect(invalidQuery.status).toBe(400);
  });

  it("creates a User with explicit activation, hashes the password and rejects duplicates", async () => {
    const administrator = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: administratorId } })).email,
    );
    const email = `issue7-created-${randomUUID()}@example.test`;
    const created = await sameOrigin(
      administrator.post("/api/users").send({
        displayName: "Issue 7 Created User",
        email: ` ${email.toUpperCase()} `,
        role: "REQUESTER",
        isActive: false,
        initialPassword: createdPassword,
      }),
    );
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      displayName: "Issue 7 Created User",
      email,
      role: "REQUESTER",
      isActive: false,
      mustChangePassword: true,
    });
    expect(JSON.stringify(created.body)).not.toContain(createdPassword);

    const databaseUser = await prisma.user.findUniqueOrThrow({
      where: { email },
    });
    createdUserId = databaseUser.id;
    userIds.push(createdUserId);
    expect(databaseUser.passwordHash).not.toBe(createdPassword);
    expect(databaseUser.passwordHash).toMatch(/^\$argon2id\$/u);

    const duplicate = await sameOrigin(
      administrator.post("/api/users").send({
        displayName: "Duplicate User",
        email: email.toUpperCase(),
        role: "REQUESTER",
        isActive: true,
        initialPassword: createdPassword,
      }),
    );
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("EMAIL_ALREADY_EXISTS");

    const omittedActivation = await sameOrigin(
      administrator.post("/api/users").send({
        displayName: "Missing Activation",
        email: `issue7-missing-active-${randomUUID()}@example.test`,
        role: "REQUESTER",
        initialPassword: createdPassword,
      }),
    );
    expect(omittedActivation.status).toBe(400);
    expect(omittedActivation.body.error.fields.isActive).toBeDefined();
  });

  it("edits Users and resets the initial password while revoking sessions", async () => {
    const administrator = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: administratorId } })).email,
    );
    const targetEmail = `issue7-edited-${randomUUID()}@example.test`;
    const created = await sameOrigin(
      administrator.post("/api/users").send({
        displayName: "Issue 7 Editable User",
        email: targetEmail,
        role: "REQUESTER",
        isActive: true,
        initialPassword: createdPassword,
      }),
    );
    expect(created.status).toBe(201);
    const targetId = created.body.data.id as number;
    userIds.push(targetId);

    const target = await login(targetEmail, createdPassword);
    const edited = await sameOrigin(
      administrator.patch(`/api/users/${targetId}`).send({
        displayName: "Issue 7 Edited User",
        email: targetEmail,
        role: "IT_STAFF",
        isActive: true,
      }),
    );
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({
      id: targetId,
      displayName: "Issue 7 Edited User",
      role: "IT_STAFF",
      isActive: true,
    });

    const reset = await sameOrigin(
      administrator.post(`/api/users/${targetId}/reset-password`).send({
        initialPassword: resetPassword,
      }),
    );
    expect(reset.status).toBe(200);
    expect(reset.body.data).toMatchObject({ id: targetId, mustChangePassword: true });
    expect(JSON.stringify(reset.body)).not.toContain(resetPassword);
    expect((await target.get("/api/auth/me")).status).toBe(401);
  });

  it("blocks self-deactivation and the last active Administrator safeguard", async () => {
    const administrator = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: administratorId } })).email,
    );
    const selfDeactivation = await sameOrigin(
      administrator.patch(`/api/users/${administratorId}`).send({ isActive: false }),
    );
    expect(selfDeactivation.status).toBe(409);
    expect(selfDeactivation.body.error.code).toBe("ADMINISTRATOR_SAFETY_CONFLICT");

    const existingSoleAdministrator = {
      id: soleAdministratorId,
      displayName: "Issue 7 Sole Administrator",
      email: "sole-admin@example.test",
      role: "ADMINISTRATOR" as const,
      isActive: true,
      mustChangePassword: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const transaction = {
      user: {
        findUnique: vi.fn().mockResolvedValue(existingSoleAdministrator),
        count: vi.fn().mockResolvedValue(1),
        update: vi.fn(),
      },
      ticket: { count: vi.fn().mockResolvedValue(0) },
      session: { updateMany: vi.fn() },
    };
    const fakePrisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)),
    } as unknown as PrismaClient;
    await expect(
      updateManagedUser(fakePrisma, soleAdministratorId, administratorId, { isActive: false }),
    ).rejects.toMatchObject({
      status: 409,
      code: "ADMINISTRATOR_SAFETY_CONFLICT",
    });
  });
});
