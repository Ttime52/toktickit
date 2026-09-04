import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";

import { app } from "../../src/app.js";
import { removeStoredAttachment } from "../../src/attachments.js";
import { getPrisma } from "../../src/prisma.js";

const prisma = getPrisma();
const createdTicketIds: number[] = [];

function pngBytes(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

async function createTicket() {
  const [requesters, category, relatedSystem] = await Promise.all([
    prisma.developmentRequester.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      take: 2,
    }),
    prisma.category.findFirst({ where: { isActive: true } }),
    prisma.relatedSystem.findFirst({ where: { isActive: true } }),
  ]);
  const owner = requesters[0];
  const other = requesters[1];

  if (owner === undefined || other === undefined || category === null || relatedSystem === null) {
    throw new Error("Issue 6 reference data is missing.");
  }

  const response = await request(app)
    .post("/api/tickets")
    .set("Idempotency-Key", randomUUID())
    .send({
      requesterId: owner.id,
      categoryId: category.id,
      relatedSystemId: relatedSystem.id,
      summary: `Ticket detail test ${randomUUID()}`,
      description: "This Ticket is used to verify the requester detail contract.",
    });

  expect(response.status).toBe(201);
  const ticketId = response.body.data.id as number;
  createdTicketIds.push(ticketId);
  return { ticketId, ownerId: owner.id, otherId: other.id };
}

async function uploadAttachment(ticketId: number, requesterId: number, filename = "evidence.png") {
  const response = await request(app)
    .post(`/api/tickets/${ticketId}/attachments`)
    .query({ requesterId })
    .attach("file", pngBytes(), { filename, contentType: "image/png" });

  expect(response.status).toBe(201);
  return response.body.data as {
    id: number;
    ticketId: number;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    state: "active" | "removed" | "unavailable";
    removalReason: string | null;
    removedAt: string | null;
    previewable: boolean;
    downloadUrl: string | null;
  };
}

afterAll(async () => {
  if (createdTicketIds.length === 0) return;

  const attachments = await prisma.attachment.findMany({
    where: { ticketId: { in: createdTicketIds } },
    select: { storageKey: true },
  });
  await Promise.all(attachments.map(({ storageKey }) => removeStoredAttachment(storageKey)));
  await prisma.attachment.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
});

describe("Requester Ticket Detail and Attachment lifecycle (API-12/API-13/API-16-API-20)", () => {
  it("returns an owned read-only Ticket Detail with owner-visible attachment metadata", async () => {
    const { ticketId, ownerId } = await createTicket();
    const attachment = await uploadAttachment(ticketId, ownerId);

    const response = await request(app)
      .get(`/api/tickets/${ticketId}`)
      .query({ requesterId: ownerId });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: ticketId,
      requester: { id: ownerId },
      currentStatus: "NEW",
      attachments: [
        expect.objectContaining({
          id: attachment.id,
          ticketId,
          originalFilename: "evidence.png",
          state: "active",
          previewable: true,
        }),
      ],
    });
    expect(JSON.stringify(response.body)).not.toContain("storageKey");
  });

  it("rejects cross-requester Ticket and Attachment access before returning private data", async () => {
    const { ticketId, ownerId, otherId } = await createTicket();
    const attachment = await uploadAttachment(ticketId, ownerId);

    const detail = await request(app)
      .get(`/api/tickets/${ticketId}`)
      .query({ requesterId: otherId });
    const collection = await request(app)
      .get(`/api/tickets/${ticketId}/attachments`)
      .query({ requesterId: otherId });
    const item = await request(app)
      .get(`/api/tickets/${ticketId}/attachments/${attachment.id}`)
      .query({ requesterId: otherId });
    const download = await request(app)
      .get(`/api/tickets/${ticketId}/attachments/${attachment.id}/download`)
      .query({ requesterId: otherId });
    const removal = await request(app)
      .delete(`/api/tickets/${ticketId}/attachments/${attachment.id}`)
      .query({ requesterId: otherId })
      .send({ reason: "Not my file" });

    for (const response of [detail, collection, item, download, removal]) {
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("OWNERSHIP_FORBIDDEN");
      expect(response.body.data).toBeUndefined();
    }
    expect(download.body).not.toHaveProperty("storageKey");
  });

  it("returns attachment metadata and active bytes with safe download headers", async () => {
    const { ticketId, ownerId } = await createTicket();
    const attachment = await uploadAttachment(ticketId, ownerId, "folder\\evidence.png");

    const collection = await request(app)
      .get(`/api/tickets/${ticketId}/attachments`)
      .query({ requesterId: ownerId });
    const item = await request(app)
      .get(`/api/tickets/${ticketId}/attachments/${attachment.id}`)
      .query({ requesterId: ownerId });
    const download = await request(app)
      .get(`/api/tickets/${ticketId}/attachments/${attachment.id}/download`)
      .query({ requesterId: ownerId });

    expect(collection.status).toBe(200);
    expect(collection.body.data).toHaveLength(1);
    expect(collection.body.data[0]).toMatchObject({
      id: attachment.id,
      originalFilename: "evidence.png",
      state: "active",
      downloadUrl: expect.stringContaining("requesterId=" + ownerId),
    });
    expect(item.status).toBe(200);
    expect(item.body.data).toMatchObject({ id: attachment.id, state: "active" });
    expect(JSON.stringify(collection.body)).not.toContain("storageKey");

    expect(download.status).toBe(200);
    expect(download.headers["content-type"]).toMatch(/^image\/png/iu);
    expect(download.headers["content-disposition"]).toBe(
      'attachment; filename="evidence.png"',
    );
    expect(Buffer.from(download.body).equals(pngBytes())).toBe(true);

    const preview = await request(app)
      .get(`/api/tickets/${ticketId}/attachments/${attachment.id}/download`)
      .query({ requesterId: ownerId, disposition: "inline" });
    expect(preview.status).toBe(200);
    expect(preview.headers["content-disposition"]).toBe(
      'inline; filename="evidence.png"',
    );
    expect(Buffer.from(preview.body).equals(pngBytes())).toBe(true);
  });

  it("soft-removes an Attachment, retains metadata, frees an active slot, and blocks replayed removal/download", async () => {
    const { ticketId, ownerId } = await createTicket();
    const attachment = await uploadAttachment(ticketId, ownerId);

    for (const reason of ["", "ab", "x".repeat(201)]) {
      const invalid = await request(app)
        .delete(`/api/tickets/${ticketId}/attachments/${attachment.id}`)
        .query({ requesterId: ownerId })
        .send({ reason });
      expect(invalid.status).toBe(400);
      expect(invalid.body.error.code).toBe("VALIDATION_ERROR");
      expect(invalid.body.error.fields.reason).toBeDefined();
    }

    const removed = await request(app)
      .delete(`/api/tickets/${ticketId}/attachments/${attachment.id}`)
      .query({ requesterId: ownerId })
      .send({ reason: "  Uploaded the wrong screenshot  " });

    expect(removed.status).toBe(200);
    expect(removed.body.data).toMatchObject({
      id: attachment.id,
      state: "removed",
      previewable: false,
      downloadUrl: null,
      removalReason: "Uploaded the wrong screenshot",
    });
    expect(removed.body.data.removedAt).toEqual(expect.any(String));

    const databaseRow = await prisma.attachment.findUnique({
      where: { id: attachment.id },
      select: { removedAt: true, removalReason: true, removedByRequesterId: true },
    });
    expect(databaseRow).toMatchObject({
      removalReason: "Uploaded the wrong screenshot",
      removedByRequesterId: ownerId,
    });
    expect(databaseRow?.removedAt).not.toBeNull();

    const metadata = await request(app)
      .get(`/api/tickets/${ticketId}/attachments/${attachment.id}`)
      .query({ requesterId: ownerId });
    expect(metadata.status).toBe(200);
    expect(metadata.body.data).toMatchObject({
      id: attachment.id,
      originalFilename: "evidence.png",
      state: "removed",
      previewable: false,
      downloadUrl: null,
      removalReason: "Uploaded the wrong screenshot",
    });

    const blockedDownload = await request(app)
      .get(`/api/tickets/${ticketId}/attachments/${attachment.id}/download`)
      .query({ requesterId: ownerId });
    expect(blockedDownload.status).toBe(410);
    expect(blockedDownload.body.error.code).toBe("ATTACHMENT_NOT_AVAILABLE");
    expect(blockedDownload.body).not.toHaveProperty("data");

    const repeatedRemoval = await request(app)
      .delete(`/api/tickets/${ticketId}/attachments/${attachment.id}`)
      .query({ requesterId: ownerId })
      .send({ reason: "Another reason" });
    expect(repeatedRemoval.status).toBe(409);
    expect(repeatedRemoval.body.error.code).toBe("ATTACHMENT_ALREADY_REMOVED");

    const replacement = await uploadAttachment(ticketId, ownerId, "replacement.png");
    expect(replacement.state).toBe("active");
  });

  it("returns 404 for missing Ticket/Attachment resources", async () => {
    const { ownerId } = await createTicket();
    const missingTicket = await request(app)
      .get("/api/tickets/999999999")
      .query({ requesterId: ownerId });
    expect(missingTicket.status).toBe(404);
    expect(missingTicket.body.error.code).toBe("TICKET_NOT_FOUND");

    const { ticketId } = await createTicket();
    const missingAttachment = await request(app)
      .get(`/api/tickets/${ticketId}/attachments/999999999`)
      .query({ requesterId: ownerId });
    expect(missingAttachment.status).toBe(404);
    expect(missingAttachment.body.error.code).toBe("ATTACHMENT_NOT_FOUND");
  });
});
