import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";

import { app } from "../../src/app.js";
import { removeStoredAttachment } from "../../src/attachments.js";
import {
  activeReferences,
  createTestUser,
  loginAs,
  prisma,
  sameOrigin,
} from "../lab-04/test-support.js";

const createdTicketIds: number[] = [];
const createdUserIds: number[] = [];

function pngBytes(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

async function createRequester(label: string) {
  const user = await createTestUser("REQUESTER", label);
  createdUserIds.push(user.id);
  return user;
}

async function createTicket() {
  const [owner, other, references] = await Promise.all([
    createRequester("lab2-detail-owner"),
    createRequester("lab2-detail-other"),
    activeReferences(),
  ]);
  const ownerAgent = await loginAs(owner.email);
  const otherAgent = await loginAs(other.email);

  const response = await sameOrigin(
    ownerAgent
      .post("/api/tickets")
      .set("Idempotency-Key", randomUUID())
      .send({
        categoryId: references.category.id,
        relatedSystemId: references.relatedSystem.id,
        summary: `Ticket detail test ${randomUUID()}`,
        description: "This Ticket is used to verify the requester detail contract.",
      }),
  );

  expect(response.status).toBe(201);
  const ticketId = response.body.data.id as number;
  createdTicketIds.push(ticketId);
  return {
    ticketId,
    ownerId: owner.id,
    otherId: other.id,
    ownerAgent,
    otherAgent,
  };
}

async function uploadAttachment(
  agent: request.SuperAgentTest,
  ticketId: number,
  filename = "evidence.png",
) {
  const response = await sameOrigin(
    agent
      .post(`/api/tickets/${ticketId}/attachments`)
      .attach("file", pngBytes(), { filename, contentType: "image/png" }),
  );

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
  if (createdTicketIds.length > 0) {
    const attachments = await prisma.attachment.findMany({
      where: { ticketId: { in: createdTicketIds } },
      select: { storageKey: true },
    });
    await Promise.all(attachments.map(({ storageKey }) => removeStoredAttachment(storageKey)));
    await prisma.attachment.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  }
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});

describe("Requester Ticket Detail and Attachment lifecycle (API-12/API-13/API-16-API-20)", () => {
  it("returns an owned read-only Ticket Detail with owner-visible attachment metadata", async () => {
    const { ticketId, ownerId, ownerAgent } = await createTicket();
    const attachment = await uploadAttachment(ownerAgent, ticketId);

    const response = await ownerAgent.get(`/api/tickets/${ticketId}`);

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
    const { ticketId, ownerAgent, otherAgent } = await createTicket();
    const attachment = await uploadAttachment(ownerAgent, ticketId);

    const detail = await otherAgent.get(`/api/tickets/${ticketId}`);
    const collection = await otherAgent.get(`/api/tickets/${ticketId}/attachments`);
    const item = await otherAgent.get(`/api/tickets/${ticketId}/attachments/${attachment.id}`);
    const download = await otherAgent.get(`/api/tickets/${ticketId}/attachments/${attachment.id}/download`);
    const removal = await sameOrigin(
      otherAgent
        .delete(`/api/tickets/${ticketId}/attachments/${attachment.id}`)
        .send({ reason: "Not my file" }),
    );

    for (const response of [detail, collection, item, download, removal]) {
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("TICKET_NOT_FOUND");
      expect(response.body.data).toBeUndefined();
    }
    expect(download.body).not.toHaveProperty("storageKey");
  });

  it("returns attachment metadata and active bytes with safe download headers", async () => {
    const { ticketId, ownerAgent } = await createTicket();
    const attachment = await uploadAttachment(ownerAgent, ticketId, "folder\\evidence.png");

    const collection = await ownerAgent.get(`/api/tickets/${ticketId}/attachments`);
    const item = await ownerAgent.get(`/api/tickets/${ticketId}/attachments/${attachment.id}`);
    const download = await ownerAgent.get(`/api/tickets/${ticketId}/attachments/${attachment.id}/download`);

    expect(collection.status).toBe(200);
    expect(collection.body.data).toHaveLength(1);
    expect(collection.body.data[0]).toMatchObject({
      id: attachment.id,
      originalFilename: "evidence.png",
      state: "active",
      downloadUrl: expect.stringContaining(`/api/tickets/${ticketId}/attachments/`),
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

    const preview = await ownerAgent.get(
      `/api/tickets/${ticketId}/attachments/${attachment.id}/download?disposition=inline`,
    );
    expect(preview.status).toBe(200);
    expect(preview.headers["content-disposition"]).toBe(
      'inline; filename="evidence.png"',
    );
    expect(Buffer.from(preview.body).equals(pngBytes())).toBe(true);
  });

  it("soft-removes an Attachment, retains metadata, frees an active slot, and blocks replayed removal/download", async () => {
    const { ticketId, ownerId, ownerAgent } = await createTicket();
    const attachment = await uploadAttachment(ownerAgent, ticketId);

    for (const reason of ["", "ab", "x".repeat(201)]) {
      const invalid = await sameOrigin(
        ownerAgent
          .delete(`/api/tickets/${ticketId}/attachments/${attachment.id}`)
          .send({ reason }),
      );
      expect(invalid.status).toBe(400);
      expect(invalid.body.error.code).toBe("VALIDATION_ERROR");
      expect(invalid.body.error.fields.reason).toBeDefined();
    }

    const removed = await sameOrigin(
      ownerAgent
        .delete(`/api/tickets/${ticketId}/attachments/${attachment.id}`)
        .send({ reason: "  Uploaded the wrong screenshot  " }),
    );

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
      select: { removedAt: true, removalReason: true, removedByUserId: true },
    });
    expect(databaseRow).toMatchObject({
      removalReason: "Uploaded the wrong screenshot",
      removedByUserId: ownerId,
    });
    expect(databaseRow?.removedAt).not.toBeNull();

    const metadata = await ownerAgent.get(`/api/tickets/${ticketId}/attachments/${attachment.id}`);
    expect(metadata.status).toBe(200);
    expect(metadata.body.data).toMatchObject({
      id: attachment.id,
      originalFilename: "evidence.png",
      state: "removed",
      previewable: false,
      downloadUrl: null,
      removalReason: "Uploaded the wrong screenshot",
    });

    const blockedDownload = await ownerAgent.get(
      `/api/tickets/${ticketId}/attachments/${attachment.id}/download`,
    );
    expect(blockedDownload.status).toBe(410);
    expect(blockedDownload.body.error.code).toBe("ATTACHMENT_NOT_AVAILABLE");
    expect(blockedDownload.body).not.toHaveProperty("data");

    const repeatedRemoval = await sameOrigin(
      ownerAgent
        .delete(`/api/tickets/${ticketId}/attachments/${attachment.id}`)
        .send({ reason: "Another reason" }),
    );
    expect(repeatedRemoval.status).toBe(409);
    expect(repeatedRemoval.body.error.code).toBe("ATTACHMENT_ALREADY_REMOVED");

    const replacement = await uploadAttachment(ownerAgent, ticketId, "replacement.png");
    expect(replacement.state).toBe("active");
  });

  it("returns 404 for missing Ticket/Attachment resources", async () => {
    const { ownerAgent } = await createTicket();
    const missingTicket = await ownerAgent.get("/api/tickets/999999999");
    expect(missingTicket.status).toBe(404);
    expect(missingTicket.body.error.code).toBe("TICKET_NOT_FOUND");

    const { ticketId, ownerAgent: secondOwnerAgent } = await createTicket();
    const missingAttachment = await secondOwnerAgent.get(
      `/api/tickets/${ticketId}/attachments/999999999`,
    );
    expect(missingAttachment.status).toBe(404);
    expect(missingAttachment.body.error.code).toBe("ATTACHMENT_NOT_FOUND");
  });
});
