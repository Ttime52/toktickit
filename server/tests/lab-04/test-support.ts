import { randomUUID } from "node:crypto";

import argon2 from "argon2";
import request from "supertest";

import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

export const prisma = getPrisma();
export const TEST_ORIGIN = "http://localhost:5173";
export const TEST_PASSWORD = "Issue28RegressionPassword1!";

export type TestRole = "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR";

export function sameOrigin(builder: request.Test) {
  return builder.set("Origin", TEST_ORIGIN);
}

export async function createTestUser(
  role: TestRole,
  label: string,
  isActive = true,
) {
  return prisma.user.create({
    data: {
      displayName: `${label} ${randomUUID().slice(0, 8)}`,
      email: `${label.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}-${randomUUID()}@example.test`,
      passwordHash: await argon2.hash(TEST_PASSWORD, { type: argon2.argon2id }),
      role,
      isActive,
      mustChangePassword: false,
    },
  });
}

export async function loginAs(email: string) {
  const agent = request.agent(app);
  const response = await sameOrigin(
    agent.post("/api/auth/login").send({ email, password: TEST_PASSWORD }),
  );
  if (response.status !== 200) {
    throw new Error(`Test login failed with status ${response.status}.`);
  }
  return agent;
}

export async function activeReferences() {
  const [category, relatedSystem] = await Promise.all([
    prisma.category.findFirstOrThrow({ where: { isActive: true }, orderBy: { id: "asc" } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true }, orderBy: { id: "asc" } }),
  ]);
  return { category, relatedSystem };
}

export function uniqueKey(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}
