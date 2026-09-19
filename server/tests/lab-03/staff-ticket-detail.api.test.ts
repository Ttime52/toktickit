import { randomUUID } from "node:crypto";

import argon2 from "argon2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

import { removeStoredAttachment, storeAttachmentBytes } from "../../src/attachments.js";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

const prisma = getPrisma();
const origin = "http://localhost:5173";
const password = "Issue6DetailPassword1!";
let requesterId: number;
let staffId: number;
let secondStaffId: number;
let administratorId: number;
let inactiveStaffId: number;
let ticketId: number;
let unassignedTicketId: number;
let attachmentId: number;
let attachmentStorageKey: string;
let categoryId: number;
let relatedSystemId: number;

function sameOrigin(builder: request.Test) {
  return builder.set("Origin", origin);
}

async function login(email: string) {
  const agent = request.agent(app);
  const response = await sameOrigin(
    agent.post("/api/auth/login").send({ email, password }),
  );
  expect(response.status).toBe(200);
  return agent;
}

describe("Issue 6 IT Staff Ticket Detail (API-05/API-06/API-07/API-08)", () => {
  beforeAll(async () => {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const [requester, staff, secondStaff, administrator, inactiveStaff] = await Promise.all([
      prisma.user.create({
        data: {
          displayName: "Issue 6 Detail Requester",
          email: `issue6-requester-${randomUUID()}@example.test`,
          passwordHash,
          role: "REQUESTER",
          isActive: true,
          mustChangePassword: false,
        },
      }),
      prisma.user.create({
        data: {
          displayName: "Issue 6 Detail Staff",
          email: `issue6-staff-${randomUUID()}@example.test`,
          passwordHash,
          role: "IT_STAFF",
          isActive: true,
          mustChangePassword: false,
        },
      }),
      prisma.user.create({
        data: {
          displayName: "Issue 6 Second Staff",
          email: `issue6-second-staff-${randomUUID()}@example.test`,
          passwordHash,
          role: "IT_STAFF",
          isActive: true,
          mustChangePassword: false,
        },
      }),
      prisma.user.create({
        data: {
          displayName: "Issue 6 Detail Administrator",
          email: `issue6-admin-${randomUUID()}@example.test`,
          passwordHash,
          role: "ADMINISTRATOR",
          isActive: true,
          mustChangePassword: false,
        },
      }),
      prisma.user.create({
        data: {
          displayName: "Issue 6 Inactive Staff",
          email: `issue6-inactive-staff-${randomUUID()}@example.test`,
          passwordHash,
          role: "IT_STAFF",
          isActive: false,
          mustChangePassword: false,
        },
      }),
    ]);

    requesterId = requester.id;
    staffId = staff.id;
    secondStaffId = secondStaff.id;
    administratorId = administrator.id;
    inactiveStaffId = inactiveStaff.id;

    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
    categoryId = category.id;
    relatedSystemId = relatedSystem.id;

    const [ticket, unassignedTicket] = await Promise.all([
      prisma.ticket.create({
        data: {
          ticketNumber: `TT-ISSUE6-D-${randomUUID().slice(0, 8)}`,
          ticketDate: new Date("2026-09-18T02:00:00.000Z"),
          requesterId,
          categoryId,
          relatedSystemId,
          summary: "Issue 6 detail workflow",
          description: "A Ticket used to verify staff detail operations.",
          requestedPriority: "MEDIUM",
          itPriority: "HIGH",
          currentStatus: "IN_PROGRESS",
          assignedToUserId: staffId,
          assignedAt: new Date("2026-09-18T02:10:00.000Z"),
          idempotencyKey: `issue6-detail-${randomUUID()}`,
        },
      }),
      prisma.ticket.create({
        data: {
          ticketNumber: `TT-ISSUE6-U-${randomUUID().slice(0, 8)}`,
          ticketDate: new Date("2026-09-18T03:00:00.000Z"),
          requesterId,
          categoryId,
          relatedSystemId,
          summary: "Issue 6 claim workflow",
          description: "An unassigned Ticket used to verify claim behavior.",
          requestedPriority: "LOW",
          itPriority: "LOW",
          currentStatus: "NEW",
          idempotencyKey: `issue6-unassigned-${randomUUID()}`,
        },
      }),
    ]);
    ticketId = ticket.id;
    unassignedTicketId = unassignedTicket.id;

    attachmentStorageKey = await storeAttachmentBytes(Buffer.from("%PDF-issue6"));
    const attachment = await prisma.attachment.create({
      data: {
        ticketId,
        uploadedByUserId: requesterId,
        originalFilename: "issue6-evidence.pdf",
        storageKey: attachmentStorageKey,
        mimeType: "application/pdf",
        sizeBytes: 12,
      },
    });
    attachmentId = attachment.id;

    await Promise.all([
      prisma.publicComment.create({
        data: {
          ticketId,
          authorUserId: requesterId,
          content: "The requester-visible update is safe.",
        },
      }),
      prisma.internalNote.create({
        data: {
          ticketId,
          authorUserId: staffId,
          content: "Private triage context without sensitive data.",
        },
      }),
    ]);
  });

  afterAll(async () => {
    await prisma.attachment.deleteMany({ where: { id: attachmentId } });
    if (attachmentStorageKey !== undefined) await removeStoredAttachment(attachmentStorageKey);
    await prisma.publicComment.deleteMany({ where: { ticketId: { in: [ticketId, unassignedTicketId] } } });
    await prisma.internalNote.deleteMany({ where: { ticketId: { in: [ticketId, unassignedTicketId] } } });
    await prisma.ticket.deleteMany({ where: { id: { in: [ticketId, unassignedTicketId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [requesterId, staffId, secondStaffId, administratorId, inactiveStaffId] } } });
    await prisma.$disconnect();
  });

  it("returns the full staff representation and only active owner options", async () => {
    const staff = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: staffId } })).email,
    );
    const detail = await staff.get(`/api/staff/tickets/${ticketId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({
      id: ticketId,
      requestedPriority: "MEDIUM",
      itPriority: "HIGH",
      currentStatus: "IN_PROGRESS",
      ticketOwner: { id: staffId, role: "IT_STAFF" },
      publicComments: [{ content: "The requester-visible update is safe." }],
      internalNotes: [{ content: "Private triage context without sensitive data." }],
    });
    expect(detail.body.data.attachments).toMatchObject([
      { id: attachmentId, originalFilename: "issue6-evidence.pdf", state: "active" },
    ]);
    expect(JSON.stringify(detail.body)).not.toContain("storageKey");

    const attachmentList = await staff.get(`/api/tickets/${ticketId}/attachments`);
    expect(attachmentList.status).toBe(200);
    expect(attachmentList.body.data[0]).not.toHaveProperty("storageKey");
    const attachmentMetadata = await staff.get(`/api/tickets/${ticketId}/attachments/${attachmentId}`);
    expect(attachmentMetadata.status).toBe(200);
    const attachmentDownload = await staff.get(`/api/tickets/${ticketId}/attachments/${attachmentId}/download`);
    expect(attachmentDownload.status).toBe(200);
    expect(attachmentDownload.body.toString()).toBe("%PDF-issue6");

    const ownerOptions = await staff.get("/api/staff/users");
    expect(ownerOptions.status).toBe(200);
    expect(ownerOptions.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: staffId, role: "IT_STAFF" }),
        expect.objectContaining({ id: administratorId, role: "ADMINISTRATOR" }),
      ]),
    );
    expect(ownerOptions.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: inactiveStaffId })]),
    );
  });

  it("enforces Public Comment and Internal Note visibility/posting rules", async () => {
    const requester = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: requesterId } })).email,
    );
    const requesterNotes = await requester.get(`/api/tickets/${ticketId}/internal-notes`);
    expect(requesterNotes.status).toBe(403);
    expect(JSON.stringify(requesterNotes.body)).not.toContain("Private triage context");
    expect((await requester.get(`/api/tickets/${ticketId}/notes`)).status).toBe(403);
    expect(
      (await sameOrigin(
        requester.post(`/api/tickets/${ticketId}/internal-notes`).send({ content: "No" }),
      )).status,
    ).toBe(403);

    const administrator = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: administratorId } })).email,
    );
    const adminNotes = await administrator.get(`/api/tickets/${ticketId}/internal-notes`);
    expect(adminNotes.status).toBe(200);
    expect(adminNotes.body.data[0].content).toBe("Private triage context without sensitive data.");
    const adminPost = await sameOrigin(
      administrator.post(`/api/tickets/${ticketId}/internal-notes`).send({ content: "Not allowed" }),
    );
    expect(adminPost.status).toBe(403);

    const staff = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: staffId } })).email,
    );
    const whitespace = await sameOrigin(
      staff.post(`/api/tickets/${ticketId}/internal-notes`).send({ content: "   " }),
    );
    expect(whitespace.status).toBe(400);
    const created = await sameOrigin(
      staff.post(`/api/tickets/${ticketId}/internal-notes`).send({ content: "A second private note." }),
    );
    expect(created.status).toBe(201);
    expect(created.body.data.content).toBe("A second private note.");

    const comments = await requester.get(`/api/tickets/${ticketId}/comments`);
    expect(comments.status).toBe(200);
    expect(comments.body.data[0].content).toBe("The requester-visible update is safe.");
    const staffComment = await sameOrigin(
      staff.post(`/api/tickets/${ticketId}/comments`).send({ content: "Staff public update." }),
    );
    expect(staffComment.status).toBe(201);
    const adminComment = await sameOrigin(
      administrator.post(`/api/tickets/${ticketId}/comments`).send({ content: "Not postable." }),
    );
    expect(adminComment.status).toBe(403);
  });

  it("updates owner, IT Priority and valid status transitions atomically", async () => {
    const staff = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: staffId } })).email,
    );
    const updated = await sameOrigin(
      staff.patch(`/api/staff/tickets/${ticketId}`).send({
        action: "reassign",
        assignedToUserId: administratorId,
        itPriority: "URGENT",
        currentStatus: "WAITING_FOR_REQUESTER",
      }),
    );
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({
      requestedPriority: "MEDIUM",
      itPriority: "URGENT",
      currentStatus: "WAITING_FOR_REQUESTER",
      ticketOwner: { id: administratorId, role: "ADMINISTRATOR" },
    });

    const invalid = await sameOrigin(
      staff.patch(`/api/staff/tickets/${ticketId}`).send({ currentStatus: "NEW" }),
    );
    expect(invalid.status).toBe(409);
    expect(invalid.body.error.code).toBe("INVALID_STATUS_TRANSITION");
    const unchanged = await staff.get(`/api/staff/tickets/${ticketId}`);
    expect(unchanged.body.data.currentStatus).toBe("WAITING_FOR_REQUESTER");
    expect(unchanged.body.data.itPriority).toBe("URGENT");
  });

  it("requires explicit confirmation for formal resolution and supports claim", async () => {
    const staff = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: staffId } })).email,
    );
    const missingConfirmation = await sameOrigin(
      staff.patch(`/api/staff/tickets/${ticketId}`).send({ currentStatus: "RESOLVED" }),
    );
    expect(missingConfirmation.status).toBe(400);
    expect(missingConfirmation.body.error.code).toBe("STATUS_CONFIRMATION_REQUIRED");

    const resolved = await sameOrigin(
      staff.patch(`/api/staff/tickets/${ticketId}`).send({
        currentStatus: "RESOLVED",
        confirmStatusChange: true,
      }),
    );
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.currentStatus).toBe("RESOLVED");

    const closed = await sameOrigin(
      staff.patch(`/api/staff/tickets/${ticketId}`).send({
        currentStatus: "CLOSED",
        confirmStatusChange: true,
      }),
    );
    expect(closed.status).toBe(200);
    expect(closed.body.data.currentStatus).toBe("CLOSED");

    const reopened = await sameOrigin(
      staff.patch(`/api/staff/tickets/${ticketId}`).send({ currentStatus: "REOPENED" }),
    );
    expect(reopened.status).toBe(200);
    expect(reopened.body.data.currentStatus).toBe("REOPENED");

    const cancelled = await sameOrigin(
      staff.patch(`/api/staff/tickets/${ticketId}`).send({ currentStatus: "CANCELLED" }),
    );
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.currentStatus).toBe("CANCELLED");

    const reopenedFromCancelled = await sameOrigin(
      staff.patch(`/api/staff/tickets/${ticketId}`).send({ currentStatus: "REOPENED" }),
    );
    expect(reopenedFromCancelled.status).toBe(200);
    expect(reopenedFromCancelled.body.data.currentStatus).toBe("REOPENED");

    const claimed = await sameOrigin(
      staff.patch(`/api/staff/tickets/${unassignedTicketId}/owner`).send({ action: "claim" }),
    );
    expect(claimed.status).toBe(200);
    expect(claimed.body.data.ticketOwner).toMatchObject({ id: staffId, role: "IT_STAFF" });
  });

  it("keeps Requesters out of staff operations and Administrators priority-only", async () => {
    const requester = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: requesterId } })).email,
    );
    expect(
      (await sameOrigin(
        requester.patch(`/api/staff/tickets/${ticketId}`).send({ itPriority: "LOW" }),
      )).status,
    ).toBe(403);

    const administrator = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: administratorId } })).email,
    );
    const priority = await sameOrigin(
      administrator.patch(`/api/staff/tickets/${ticketId}`).send({ itPriority: "LOW" }),
    );
    expect(priority.status).toBe(200);
    expect(priority.body.data.itPriority).toBe("LOW");
    const forbiddenAssignment = await sameOrigin(
      administrator.patch(`/api/staff/tickets/${ticketId}`).send({
        action: "reassign",
        assignedToUserId: secondStaffId,
      }),
    );
    expect(forbiddenAssignment.status).toBe(403);
  });
});
