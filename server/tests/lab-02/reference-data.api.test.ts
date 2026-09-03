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
    expect(requesters).toHaveLength(4);
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
    expect(omitted.body).toHaveLength(4);
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
    expect(response.body).toHaveLength(4);
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
});
