import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { getPrisma } from "../../src/prisma.js";
import { app } from "../../src/app.js";

type RequesterResponse = {
  id: number;
  displayName: string;
  email: string;
};

describe("Development Requester reference API (API-01/API-02)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns only active requesters in id order and omits internal fields", async () => {
    const response = await request(app).get(
      "/api/development-requesters?active=true",
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayName: "Arun Chaiyasit",
          email: "arun.chaiyasit@example.test",
        }),
        expect.objectContaining({
          displayName: "Boonmee Srisuk",
          email: "boonmee.srisuk@example.test",
        }),
        expect.objectContaining({
          displayName: "Chalida Wongsa",
          email: "chalida.wongsa@example.test",
        }),
        expect.objectContaining({
          displayName: "Darin Phromma",
          email: "darin.phromma@example.test",
        }),
      ]),
    );

    const requesters = response.body as RequesterResponse[];
    expect(requesters.length).toBeGreaterThanOrEqual(4);
    expect(requesters.map(({ id }) => id)).toEqual(
      [...requesters.map(({ id }) => id)].sort((a, b) => a - b),
    );
    expect(requesters.map(({ email }) => email)).not.toContain(
      "inactive.requester@example.test",
    );

    for (const requester of requesters) {
      expect(Object.keys(requester).sort()).toEqual([
        "displayName",
        "email",
        "id",
      ]);
    }
  });

  it("defaults active to true and rejects unsupported active values", async () => {
    const omitted = await request(app).get("/api/development-requesters");
    const invalid = await request(app).get(
      "/api/development-requesters?active=false",
    );

    expect(omitted.status).toBe(200);
    expect(omitted.body.length).toBeGreaterThanOrEqual(4);
    expect(invalid.status).toBe(400);
    expect(invalid.body).toEqual({
      error: {
        code: "INVALID_QUERY_PARAMETER",
        message: "The active query parameter must be true.",
      },
    });
  });

  it("supports the /api/requesters compatibility path with the same active-only contract", async () => {
    const response = await request(app).get("/api/requesters");

    expect(response.status).toBe(200);
    expect(response.body.length).toBeGreaterThanOrEqual(4);
    expect(response.body).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: "inactive.requester@example.test" }),
      ]),
    );
  });

  it("returns a safe error when the database lookup fails", async () => {
    vi.spyOn(getPrisma().developmentRequester, "findMany").mockRejectedValue(
      new Error("SELECT * FROM development_requesters; secret=do-not-leak"),
    );

    const response = await request(app).get("/api/development-requesters");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to load Development Requesters.",
      },
    });
    expect(JSON.stringify(response.body)).not.toContain("SELECT");
    expect(JSON.stringify(response.body)).not.toContain("secret");
  });

  it("returns active Categories and Related Systems in id order", async () => {
    const [categories, relatedSystems] = await Promise.all([
      request(app).get("/api/categories?active=true"),
      request(app).get("/api/related-systems?active=true"),
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
});
