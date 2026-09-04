import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

const prisma = getPrisma();
const createdTicketIds = new Set<number>();
const temporaryRequesterIds = new Set<number>();

type Reference = { id: number; name: string };

let categories: Record<string, Reference>;
let relatedSystems: Record<string, Reference>;

async function createRequester(label: string, isActive = true) {
  const requester = await prisma.developmentRequester.create({
    data: {
      displayName: `${label} ${randomUUID().slice(0, 8)}`,
      email: `${label.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}-${randomUUID()}@example.test`,
      isActive,
    },
  });
  temporaryRequesterIds.add(requester.id);
  return requester;
}

async function createOwnedTicket(
  requesterId: number,
  overrides: Partial<{
    categoryId: number;
    relatedSystemId: number;
    summary: string;
    requestedPriority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    description: string;
  }> = {},
) {
  const body = {
    requesterId,
    categoryId: overrides.categoryId ?? categories.hardware.id,
    relatedSystemId: overrides.relatedSystemId ?? relatedSystems.laptop.id,
    summary: overrides.summary ?? `Query ticket ${randomUUID()}`,
    requestedPriority: overrides.requestedPriority ?? "MEDIUM",
    description:
      overrides.description ??
      "This ticket is created for the My Tickets query test.",
  };
  const response = await request(app)
    .post("/api/tickets")
    .set("Idempotency-Key", randomUUID())
    .send(body);

  expect(response.status).toBe(201);
  const id = response.body.data.id as number;
  createdTicketIds.add(id);
  return response.body.data as {
    id: number;
    ticketNumber: string;
    ticketDate: string;
    updatedAt: string;
    requestedPriority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    currentStatus: "NEW";
    category: Reference;
    relatedSystem: Reference;
  };
}

function listQuery(
  requesterId: number,
  query: Record<string, string | undefined> = {},
) {
  return request(app).get("/api/tickets").query({ requesterId, ...query });
}

beforeAll(async () => {
  const [account, hardware, software, network, email, wifi, vpn, laptop] =
    await Promise.all([
      prisma.category.findUnique({ where: { name: "Account and Access" } }),
      prisma.category.findUnique({ where: { name: "Hardware" } }),
      prisma.category.findUnique({ where: { name: "Software" } }),
      prisma.category.findUnique({ where: { name: "Network" } }),
      prisma.relatedSystem.findUnique({ where: { name: "Email" } }),
      prisma.relatedSystem.findUnique({ where: { name: "Campus Wi-Fi" } }),
      prisma.relatedSystem.findUnique({ where: { name: "VPN" } }),
      prisma.relatedSystem.findUnique({ where: { name: "Corporate Laptop" } }),
    ]);

  if (
    account === null ||
    hardware === null ||
    software === null ||
    network === null ||
    email === null ||
    wifi === null ||
    vpn === null ||
    laptop === null
  ) {
    throw new Error("Issue 5 reference data is missing.");
  }

  categories = { account, hardware, software, network };
  relatedSystems = { email, wifi, vpn, laptop };
});

afterAll(async () => {
  const ticketIds = [...createdTicketIds];
  if (ticketIds.length > 0) {
    await prisma.attachment.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  }

  const requesterIds = [...temporaryRequesterIds];
  if (requesterIds.length > 0) {
    await prisma.developmentRequester.deleteMany({ where: { id: { in: requesterIds } } });
  }
});

describe("GET /api/tickets (API-08/API-09/API-10/API-11)", () => {
  it("returns only Tickets owned by the selected Requester", async () => {
    const requesterA = await createRequester("List Owner A");
    const requesterB = await createRequester("List Owner B");
    const ticketA = await createOwnedTicket(requesterA.id, {
      summary: "Requester A private ticket",
    });
    const ticketB = await createOwnedTicket(requesterB.id, {
      summary: "Requester B private ticket",
    });

    const responseA = await listQuery(requesterA.id, { search: "private" });
    const responseB = await listQuery(requesterB.id, { search: "private" });

    expect(responseA.status).toBe(200);
    expect(responseA.body.data.map((ticket: { id: number }) => ticket.id)).toEqual([ticketA.id]);
    expect(responseA.body.data.map((ticket: { id: number }) => ticket.id)).not.toContain(ticketB.id);
    expect(responseB.status).toBe(200);
    expect(responseB.body.data.map((ticket: { id: number }) => ticket.id)).toEqual([ticketB.id]);
    expect(responseB.body.data.map((ticket: { id: number }) => ticket.id)).not.toContain(ticketA.id);
  });

  it("searches across Ticket fields and combines exact filters with AND", async () => {
    const requester = await createRequester("Search Owner");
    const target = await createOwnedTicket(requester.id, {
      categoryId: categories.hardware.id,
      relatedSystemId: relatedSystems.laptop.id,
      requestedPriority: "HIGH",
      summary: "Laptop access request",
      description: "Battery evidence is attached for the hardware team.",
    });
    await createOwnedTicket(requester.id, {
      categoryId: categories.account.id,
      relatedSystemId: relatedSystems.email.id,
      requestedPriority: "LOW",
      summary: "Mailbox alias request",
      description: "Please create a mailbox alias for the project team.",
    });

    const searches = [
      target.ticketNumber,
      "  LAPTOP ACCESS  ",
      "  BATTERY EVIDENCE  ",
      "  hardware  ",
      "  corporate laptop  ",
    ];
    for (const search of searches) {
      const response = await listQuery(requester.id, { search });
      expect(response.status).toBe(200);
      expect(response.body.data.map((ticket: { id: number }) => ticket.id)).toEqual([target.id]);
    }

    const combined = await listQuery(requester.id, {
      categoryId: String(categories.hardware.id),
      relatedSystemId: String(relatedSystems.laptop.id),
      requestedPriority: "HIGH",
      currentStatus: "NEW",
    });
    expect(combined.status).toBe(200);
    expect(combined.body.data.map((ticket: { id: number }) => ticket.id)).toEqual([target.id]);
  });

  it("sorts allowed fields and applies id desc as the deterministic tie-breaker", async () => {
    const requester = await createRequester("Sort Owner");
    const sortTickets = await Promise.all([
      createOwnedTicket(requester.id, {
        categoryId: categories.account.id,
        relatedSystemId: relatedSystems.email.id,
        requestedPriority: "LOW",
      }),
      createOwnedTicket(requester.id, {
        categoryId: categories.hardware.id,
        relatedSystemId: relatedSystems.wifi.id,
        requestedPriority: "MEDIUM",
      }),
      createOwnedTicket(requester.id, {
        categoryId: categories.software.id,
        relatedSystemId: relatedSystems.vpn.id,
        requestedPriority: "HIGH",
      }),
      createOwnedTicket(requester.id, {
        categoryId: categories.network.id,
        relatedSystemId: relatedSystems.laptop.id,
        requestedPriority: "URGENT",
      }),
    ]);

    const priorityAsc = await listQuery(requester.id, {
      sortBy: "requestedPriority",
      sortOrder: "asc",
    });
    expect(priorityAsc.body.data.map((ticket: { requestedPriority: string }) => ticket.requestedPriority)).toEqual([
      "LOW",
      "MEDIUM",
      "HIGH",
      "URGENT",
    ]);

    const priorityDesc = await listQuery(requester.id, {
      sortBy: "requestedPriority",
      sortOrder: "desc",
    });
    expect(priorityDesc.body.data.map((ticket: { requestedPriority: string }) => ticket.requestedPriority)).toEqual([
      "URGENT",
      "HIGH",
      "MEDIUM",
      "LOW",
    ]);

    const categoryAsc = await listQuery(requester.id, {
      sortBy: "category",
      sortOrder: "asc",
    });
    expect(categoryAsc.body.data.map((ticket: { category: Reference }) => ticket.category.name)).toEqual([
      "Account and Access",
      "Hardware",
      "Network",
      "Software",
    ]);

    const ticketNumberAsc = await listQuery(requester.id, {
      sortBy: "ticketNumber",
      sortOrder: "asc",
    });
    const ticketNumbers = ticketNumberAsc.body.data.map(
      (ticket: { ticketNumber: string }) => ticket.ticketNumber,
    );
    expect(ticketNumbers).toEqual([...ticketNumbers].sort());

    const ticketDateAsc = await listQuery(requester.id, {
      sortBy: "ticketDate",
      sortOrder: "asc",
    });
    const dates = ticketDateAsc.body.data.map(
      (ticket: { ticketDate: string }) => new Date(ticket.ticketDate).getTime(),
    );
    expect(dates).toEqual([...dates].sort((left, right) => left - right));

    const currentStatus = await listQuery(requester.id, {
      sortBy: "currentStatus",
      sortOrder: "asc",
    });
    expect(currentStatus.body.data.map((ticket: { id: number }) => ticket.id)).toEqual(
      [...sortTickets].map((ticket) => ticket.id).sort((left, right) => right - left),
    );

    const defaultOrder = await listQuery(requester.id);
    const defaultUpdatedAt = defaultOrder.body.data.map(
      (ticket: { updatedAt: string }) => new Date(ticket.updatedAt).getTime(),
    );
    expect(defaultUpdatedAt).toEqual(
      [...defaultUpdatedAt].sort((left, right) => right - left),
    );
  });

  it("keeps id desc ordering when multiple Tickets share the primary sort value", async () => {
    const requester = await createRequester("Tie Break Owner");
    const first = await createOwnedTicket(requester.id, {
      requestedPriority: "HIGH",
      summary: "First ticket with the same priority",
    });
    const second = await createOwnedTicket(requester.id, {
      requestedPriority: "HIGH",
      summary: "Second ticket with the same priority",
    });

    const ascending = await listQuery(requester.id, {
      requestedPriority: "HIGH",
      sortBy: "requestedPriority",
      sortOrder: "asc",
    });
    const descending = await listQuery(requester.id, {
      requestedPriority: "HIGH",
      sortBy: "requestedPriority",
      sortOrder: "desc",
    });

    expect(ascending.status).toBe(200);
    expect(descending.status).toBe(200);
    expect(ascending.body.data.map((ticket: { id: number }) => ticket.id)).toEqual([
      second.id,
      first.id,
    ]);
    expect(descending.body.data.map((ticket: { id: number }) => ticket.id)).toEqual([
      second.id,
      first.id,
    ]);
  });

  it("returns correct pagination, empty/no-results responses, and rejects invalid queries", async () => {
    const requester = await createRequester("Pagination Owner");
    for (let index = 0; index < 11; index += 1) {
      await createOwnedTicket(requester.id, {
        summary: `Pagination ticket ${index.toString().padStart(2, "0")}`,
      });
    }

    const pageOne = await listQuery(requester.id, {
      page: "1",
      pageSize: "10",
      sortBy: "ticketNumber",
      sortOrder: "asc",
    });
    const pageTwo = await listQuery(requester.id, {
      page: "2",
      pageSize: "10",
      sortBy: "ticketNumber",
      sortOrder: "asc",
    });

    expect(pageOne.status).toBe(200);
    expect(pageOne.body.data).toHaveLength(10);
    expect(pageOne.body.meta).toEqual({
      page: 1,
      pageSize: 10,
      totalItems: 11,
      totalPages: 2,
      hasNextPage: true,
      hasPreviousPage: false,
    });
    expect(pageTwo.status).toBe(200);
    expect(pageTwo.body.data).toHaveLength(1);
    expect(pageTwo.body.meta).toEqual({
      page: 2,
      pageSize: 10,
      totalItems: 11,
      totalPages: 2,
      hasNextPage: false,
      hasPreviousPage: true,
    });

    for (const pageSize of [20, 50] as const) {
      const resizedPage = await listQuery(requester.id, {
        page: "1",
        pageSize: String(pageSize),
        sortBy: "ticketNumber",
        sortOrder: "asc",
      });
      expect(resizedPage.status).toBe(200);
      expect(resizedPage.body.data).toHaveLength(11);
      expect(resizedPage.body.meta).toEqual({
        page: 1,
        pageSize,
        totalItems: 11,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });
    }

    const emptyRequester = await createRequester("Empty Owner");
    const empty = await listQuery(emptyRequester.id);
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({
      data: [],
      meta: {
        page: 1,
        pageSize: 10,
        totalItems: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });

    const noResults = await listQuery(requester.id, {
      search: "no-ticket-can-match-this-value",
    });
    expect(noResults.status).toBe(200);
    expect(noResults.body.data).toEqual([]);
    expect(noResults.body.meta.totalItems).toBe(0);
    expect(noResults.body.meta.totalPages).toBe(0);

    const invalidQueries = [
      { page: "0" },
      { pageSize: "15" },
      { sortBy: "summary" },
      { sortOrder: "sideways" },
      { requestedPriority: "NORMAL" },
      { currentStatus: "CLOSED" },
      { unsupported: "true" },
    ];
    for (const query of invalidQueries) {
      const response = await listQuery(requester.id, query);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_QUERY_PARAMETER");
    }

    const inactiveRequester = await createRequester("Inactive Owner", false);
    const inactiveResponse = await listQuery(inactiveRequester.id);
    expect(inactiveResponse.status).toBe(400);
    expect(inactiveResponse.body.error.code).toBe("REQUESTER_CONTEXT_INVALID");
  });
});
