import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

import { app } from "../../src/app.js";
import { removeStoredAttachment } from "../../src/attachments.js";
import { getPrisma } from "../../src/prisma.js";
import {
  activeReferences,
  createTestUser,
  loginAs,
  prisma,
  sameOrigin,
  TEST_PASSWORD,
  uniqueKey,
} from "./test-support.js";

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0xf0,
  0x1f, 0x00, 0x05, 0x00, 0x01, 0xff, 0x89, 0x99,
  0x3d, 0x1d, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
  0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

const prismaClient = getPrisma();
let requesterId: number;
let otherRequesterId: number;
let staffId: number;
let administratorId: number;
let ticketId: number;
let managedUserId: number | undefined;
const userIds: number[] = [];

let requesterEmail: string;
let otherRequesterEmail: string;
let staffEmail: string;
let administratorEmail: string;

describe("Lab 2/3 behavior regression on the Lab 4 contract", () => {
  beforeAll(async () => {
    const [requester, otherRequester, staff, administrator] = await Promise.all([
      createTestUser("REQUESTER", "issue28-regression-requester"),
      createTestUser("REQUESTER", "issue28-regression-other"),
      createTestUser("IT_STAFF", "issue28-regression-staff"),
      createTestUser("ADMINISTRATOR", "issue28-regression-admin"),
    ]);

    requesterId = requester.id;
    otherRequesterId = otherRequester.id;
    staffId = staff.id;
    administratorId = administrator.id;
    requesterEmail = requester.email;
    otherRequesterEmail = otherRequester.email;
    staffEmail = staff.email;
    administratorEmail = administrator.email;
    userIds.push(requesterId, otherRequesterId, staffId, administratorId);

    const { category, relatedSystem } = await activeReferences();
    const requesterSession = await loginAs(requesterEmail);
    const created = await sameOrigin(
      requesterSession
        .post("/api/tickets")
        .set("Idempotency-Key", uniqueKey("lab23-ticket"))
        .send({
          categoryId: category.id,
          relatedSystemId: relatedSystem.id,
          requestedPriority: "MEDIUM",
          summary: "Lab 2/3 regression Ticket",
          description: "A current-schema Ticket for ownership and communication regression.",
        }),
    );
    expect(created.status).toBe(201);
    ticketId = created.body.data.id as number;
  });

  afterAll(async () => {
    const attachments = await prismaClient.attachment.findMany({
      where: { ticketId },
      select: { storageKey: true },
    });
    await Promise.all(attachments.map(({ storageKey }) => removeStoredAttachment(storageKey)));
    await prismaClient.attachment.deleteMany({ where: { ticketId } });
    await prismaClient.publicComment.deleteMany({ where: { ticketId } });
    await prismaClient.internalNote.deleteMany({ where: { ticketId } });
    await prismaClient.ticket.deleteMany({ where: { id: ticketId } });
    await prismaClient.user.deleteMany({ where: { id: { in: [...userIds, ...(managedUserId === undefined ? [] : [managedUserId])] } } });
    await prismaClient.$disconnect();
  });

  it("preserves authenticated ownership and rejects a forged requester identity", async () => {
    const owner = await loginAs(requesterEmail);
    const forged = await sameOrigin(
      owner
        .post("/api/tickets")
        .set("Idempotency-Key", uniqueKey("lab23-forged"))
        .send({
          requesterId: otherRequesterId,
          summary: "Forged owner",
        }),
    );
    expect(forged.status).toBe(400);
    expect(forged.body.error.fields.requesterId).toBeDefined();

    const owned = await owner.get(`/api/tickets/${ticketId}`);
    expect(owned.status).toBe(200);
    expect(owned.body.data.requester.id).toBe(requesterId);

    const foreign = await (await loginAs(otherRequesterEmail)).get(`/api/tickets/${ticketId}`);
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe("TICKET_NOT_FOUND");
  });

  it("keeps Attachment upload, download, removal, and ownership behavior", async () => {
    const owner = await loginAs(requesterEmail);
    const uploaded = await sameOrigin(
      owner
        .post(`/api/tickets/${ticketId}/attachments`)
        .attach("file", PNG_BYTES, { filename: "lab23-regression.png", contentType: "image/png" }),
    );
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.data).toMatchObject({
      ticketId,
      originalFilename: "lab23-regression.png",
      mimeType: "image/png",
      state: "active",
    });
    const attachmentId = uploaded.body.data.id as number;

    const foreign = await (await loginAs(otherRequesterEmail)).get(
      `/api/tickets/${ticketId}/attachments/${attachmentId}`,
    );
    expect(foreign.status).toBe(404);

    const download = await owner.get(
      `/api/tickets/${ticketId}/attachments/${attachmentId}/download`,
    );
    expect(download.status).toBe(200);
    expect(download.headers["content-type"]).toContain("image/png");
    expect(download.body).toEqual(PNG_BYTES);

    const removed = await sameOrigin(
      owner
        .delete(`/api/tickets/${ticketId}/attachments/${attachmentId}`)
        .send({ reason: "Lab 2/3 regression cleanup" }),
    );
    expect(removed.status).toBe(200);
    expect(removed.body.data).toMatchObject({ id: attachmentId, state: "removed" });

    const replayedDownload = await owner.get(
      `/api/tickets/${ticketId}/attachments/${attachmentId}/download`,
    );
    expect(replayedDownload.status).toBe(410);
  });

  it("preserves Public Comments visibility and Internal Notes privacy", async () => {
    const owner = await loginAs(requesterEmail);
    const staff = await loginAs(staffEmail);
    const administrator = await loginAs(administratorEmail);

    const requesterComment = await sameOrigin(
      owner.post(`/api/tickets/${ticketId}/comments`).send({ content: "Requester regression update." }),
    );
    expect(requesterComment.status).toBe(201);

    const staffComment = await sameOrigin(
      staff.post(`/api/tickets/${ticketId}/comments`).send({ content: "Staff regression reply." }),
    );
    expect(staffComment.status).toBe(201);

    const note = await sameOrigin(
      staff.post(`/api/tickets/${ticketId}/internal-notes`).send({ content: "Private regression note." }),
    );
    expect(note.status).toBe(201);

    const ownerComments = await owner.get(`/api/tickets/${ticketId}/comments`);
    expect(ownerComments.status).toBe(200);
    expect(ownerComments.body.data.map((comment: { content: string }) => comment.content)).toEqual([
      "Requester regression update.",
      "Staff regression reply.",
    ]);

    const ownerNotes = await owner.get(`/api/tickets/${ticketId}/internal-notes`);
    expect(ownerNotes.status).toBe(403);
    expect(JSON.stringify(ownerNotes.body)).not.toContain("Private regression note.");

    const administratorComments = await administrator.get(`/api/tickets/${ticketId}/comments`);
    expect(administratorComments.status).toBe(200);
    const administratorNotes = await administrator.get(`/api/tickets/${ticketId}/internal-notes`);
    expect(administratorNotes.status).toBe(200);
    expect(administratorNotes.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ content: "Private regression note." })]),
    );

    const administratorPost = await sameOrigin(
      administrator.post(`/api/tickets/${ticketId}/comments`).send({ content: "Forbidden admin comment." }),
    );
    expect(administratorPost.status).toBe(403);
  });

  it("keeps Administrator User Management isolated from Requester and IT Staff roles", async () => {
    const requester = await loginAs(requesterEmail);
    const staff = await loginAs(staffEmail);
    const administrator = await loginAs(administratorEmail);

    expect((await requester.get("/api/users")).status).toBe(403);
    expect((await staff.get("/api/users")).status).toBe(403);

    const email = `issue28-managed-${randomUUID()}@example.test`;
    const created = await sameOrigin(
      administrator.post("/api/users").send({
        displayName: "Lab 2/3 Regression User",
        email,
        role: "REQUESTER",
        isActive: true,
        initialPassword: TEST_PASSWORD,
      }),
    );
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      displayName: "Lab 2/3 Regression User",
      email,
      role: "REQUESTER",
      isActive: true,
      mustChangePassword: true,
    });
    expect(JSON.stringify(created.body)).not.toContain("passwordHash");
    managedUserId = created.body.data.id as number;

    const databaseUser = await prismaClient.user.findUniqueOrThrow({ where: { id: managedUserId } });
    expect(databaseUser.passwordHash).not.toBe(TEST_PASSWORD);

    const duplicate = await sameOrigin(
      administrator.post("/api/users").send({
        displayName: "Duplicate Regression User",
        email: email.toUpperCase(),
        role: "REQUESTER",
        isActive: true,
        initialPassword: TEST_PASSWORD,
      }),
    );
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("EMAIL_ALREADY_EXISTS");
  });
});
