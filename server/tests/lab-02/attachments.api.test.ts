import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";

import { app } from "../../src/app.js";
import { removeStoredAttachment } from "../../src/attachments.js";
import { getPrisma } from "../../src/prisma.js";

const prisma = getPrisma();
const createdTicketIds: number[] = [];

function fileBytes(kind: "jpeg" | "png" | "webp" | "pdf"): Buffer {
  if (kind === "jpeg") return Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  if (kind === "png") {
    return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  if (kind === "webp") return Buffer.from("RIFFxxxxWEBP", "ascii");
  return Buffer.from("%PDF-1.7\n", "ascii");
}

async function createTicketForAttachment() {
  const [requester, category, relatedSystem] = await Promise.all([
    prisma.developmentRequester.findFirst({ where: { isActive: true } }),
    prisma.category.findFirst({ where: { isActive: true } }),
    prisma.relatedSystem.findFirst({ where: { isActive: true } }),
  ]);
  if (requester === null || category === null || relatedSystem === null) {
    throw new Error("Issue 4 seed data is missing.");
  }

  const response = await request(app)
    .post("/api/tickets")
    .set("Idempotency-Key", randomUUID())
    .send({
      requesterId: requester.id,
      categoryId: category.id,
      relatedSystemId: relatedSystem.id,
      summary: "Attachment upload test Ticket",
      description: "This Ticket is used to test the Attachment upload contract.",
    });

  expect(response.status).toBe(201);
  createdTicketIds.push(response.body.data.id);
  return { ticketId: response.body.data.id as number, requesterId: requester.id };
}

afterAll(async () => {
  if (createdTicketIds.length > 0) {
    const attachments = await prisma.attachment.findMany({
      where: { ticketId: { in: createdTicketIds } },
      select: { storageKey: true },
    });
    await Promise.all(
      attachments.map(({ storageKey }) => removeStoredAttachment(storageKey)),
    );
    await prisma.attachment.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  }
});

describe("Attachment upload for Create Ticket (API-14/API-15)", () => {
  it("stores permitted JPG, PNG, WEBP, and PDF files as safe metadata", async () => {
    const { ticketId, requesterId } = await createTicketForAttachment();
    const files = [
      ["photo.jpg", "image/jpeg", fileBytes("jpeg")],
      ["photo.png", "image/png", fileBytes("png")],
      ["photo.webp", "image/webp", fileBytes("webp")],
      ["notes.pdf", "application/pdf", fileBytes("pdf")],
    ] as const;

    for (const [filename, contentType, bytes] of files) {
      const response = await request(app)
        .post(`/api/tickets/${ticketId}/attachments`)
        .query({ requesterId })
        .attach("file", bytes, { filename, contentType });

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        ticketId,
        originalFilename: filename,
        mimeType: contentType,
        sizeBytes: bytes.length,
        state: "active",
        previewable: true,
      });
      expect(response.body.data.downloadUrl).toContain(
        `/api/tickets/${ticketId}/attachments/`,
      );
      expect(Object.keys(response.body.data).sort()).toEqual([
        "downloadUrl",
        "id",
        "mimeType",
        "originalFilename",
        "previewable",
        "removalReason",
        "removedAt",
        "sizeBytes",
        "state",
        "ticketId",
        "unavailableAt",
        "unavailableReason",
        "uploadedAt",
      ]);
      expect(JSON.stringify(response.body)).not.toContain("storageKey");
    }
  });

  it("rejects unsupported/mismatched/signature-invalid and oversized files", async () => {
    const { ticketId, requesterId } = await createTicketForAttachment();
    const cases = [
      {
        filename: "notes.txt",
        contentType: "text/plain",
        bytes: Buffer.from("text"),
        status: 415,
        code: "ATTACHMENT_TYPE_NOT_ALLOWED",
      },
      {
        filename: "photo.png",
        contentType: "image/png",
        bytes: Buffer.from("not-a-png"),
        status: 415,
        code: "ATTACHMENT_SIGNATURE_INVALID",
      },
      {
        filename: "photo.png",
        contentType: "image/jpeg",
        bytes: fileBytes("jpeg"),
        status: 415,
        code: "ATTACHMENT_TYPE_NOT_ALLOWED",
      },
    ] as const;

    for (const testCase of cases) {
      const response = await request(app)
        .post(`/api/tickets/${ticketId}/attachments`)
        .query({ requesterId })
        .attach("file", testCase.bytes, {
          filename: testCase.filename,
          contentType: testCase.contentType,
        });
      expect(response.status).toBe(testCase.status);
      expect(response.body.error.code).toBe(testCase.code);
    }

    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1);
    oversized.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const oversizedResponse = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .query({ requesterId })
      .attach("file", oversized, {
        filename: "large.png",
        contentType: "image/png",
      });
    expect(oversizedResponse.status).toBe(413);
    expect(oversizedResponse.body.error.code).toBe("ATTACHMENT_TOO_LARGE");
    expect(await prisma.attachment.count({ where: { ticketId } })).toBe(0);
  });

  it("enforces ownership and the five active Attachment limit", async () => {
    const { ticketId, requesterId } = await createTicketForAttachment();
    const otherRequester = await prisma.developmentRequester.findFirst({
      where: { isActive: true, id: { not: requesterId } },
    });
    if (otherRequester === null) throw new Error("Second active requester is missing.");

    const forbidden = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .query({ requesterId: otherRequester.id })
      .attach("file", fileBytes("png"), {
        filename: "other.png",
        contentType: "image/png",
      });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe("OWNERSHIP_FORBIDDEN");

    for (let index = 0; index < 5; index += 1) {
      const response = await request(app)
        .post(`/api/tickets/${ticketId}/attachments`)
        .query({ requesterId })
        .attach("file", fileBytes("png"), {
          filename: `file-${index}.png`,
          contentType: "image/png",
        });
      expect(response.status).toBe(201);
    }

    const sixth = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .query({ requesterId })
      .attach("file", fileBytes("png"), {
        filename: "file-six.png",
        contentType: "image/png",
      });
    expect(sixth.status).toBe(409);
    expect(sixth.body.error.code).toBe("ATTACHMENT_LIMIT_REACHED");
    expect(await prisma.attachment.count({ where: { ticketId, removedAt: null } })).toBe(5);
  });
});
