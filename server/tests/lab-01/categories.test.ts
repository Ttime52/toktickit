import { afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { createTestUser, loginAs, prisma } from "../lab-04/test-support.js";

let requesterId: number | undefined;

afterAll(async () => {
  if (requesterId !== undefined) {
    await prisma.user.delete({ where: { id: requesterId } });
  }
});

// Issue 4 — write this test yourself, using health.test.ts as the pattern.
// Requires the DB to be migrated and seeded first.
// It should assert: GET /api/categories returns 200 and the four seeded
// category names in id order.
describe("GET /api/categories", () => {
  it("returns the four seeded categories in id order", async () => {
    const requester = await createTestUser("REQUESTER", "lab1-categories");
    requesterId = requester.id;
    const agent = await loginAs(requester.email);
    const res = await agent.get("/api/categories?active=true");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(4);
    expect(res.body.map((category: { name: string }) => category.name)).toEqual([
      "Account and Access",
      "Hardware",
      "Software",
      "Network",
    ]);
  });
});
