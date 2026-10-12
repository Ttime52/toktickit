import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";

import { app } from "../../src/app.js";
import {
  createTestUser,
  loginAs,
  prisma,
} from "../lab-04/test-support.js";

let requesterId: number | undefined;

afterAll(async () => {
  if (requesterId !== undefined) {
    await prisma.user.delete({ where: { id: requesterId } });
  }
});

async function authenticatedRequester() {
  if (requesterId === undefined) {
    const requester = await createTestUser("REQUESTER", "lab2-reference-data");
    requesterId = requester.id;
  }
  return loginAs(
    (await prisma.user.findUniqueOrThrow({ where: { id: requesterId } })).email,
  );
}

describe("Current reference-data API (API-01/API-02)", () => {
  it("keeps the obsolete requester selectors retired", async () => {
    const [developmentRequesters, requesters] = await Promise.all([
      request(app).get("/api/development-requesters"),
      request(app).get("/api/requesters"),
    ]);

    for (const response of [developmentRequesters, requesters]) {
      expect(response.status).toBe(410);
      expect(response.body).toEqual({
        error: {
          code: "ENDPOINT_RETIRED",
          message: "Requester selectors are no longer available.",
        },
      });
    }
  });

  it("requires an authenticated User for active Categories and Related Systems", async () => {
    const unauthenticated = await request(app).get("/api/categories?active=true");
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body.error.code).toBe("AUTHENTICATION_REQUIRED");

    const agent = await authenticatedRequester();
    const [categories, relatedSystems] = await Promise.all([
      agent.get("/api/categories?active=true"),
      agent.get("/api/related-systems?active=true"),
    ]);

    expect(categories.status).toBe(200);
    expect(categories.body.map((item: { id: number }) => item.id)).toEqual(
      [...categories.body.map((item: { id: number }) => item.id)].sort(
        (a, b) => a - b,
      ),
    );
    expect(categories.body.map((item: { name: string }) => item.name)).toEqual([
      "Account and Access",
      "Hardware",
      "Software",
      "Network",
    ]);

    expect(relatedSystems.status).toBe(200);
    expect(relatedSystems.body.map((item: { id: number }) => item.id)).toEqual(
      [...relatedSystems.body.map((item: { id: number }) => item.id)].sort(
        (a, b) => a - b,
      ),
    );
    expect(relatedSystems.body.map((item: { name: string }) => item.name)).toEqual([
      "Email",
      "Campus Wi-Fi",
      "VPN",
      "LEB2 App",
      "Grade Submission App",
      "Printer",
      "Corporate Laptop",
    ]);
    for (const item of relatedSystems.body as Array<Record<string, unknown>>) {
      expect(Object.keys(item).sort()).toEqual(["id", "name"]);
    }
  });

  it("rejects invalid active query values without exposing implementation details", async () => {
    const agent = await authenticatedRequester();
    const [categories, systems] = await Promise.all([
      agent.get("/api/categories?active=false"),
      agent.get("/api/related-systems?active=false"),
    ]);

    for (const response of [categories, systems]) {
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_QUERY_PARAMETER");
      expect(JSON.stringify(response.body)).not.toMatch(/sql|password|stack|prisma/iu);
    }
  });
});
