import { createHash } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedDatabase } from "../../prisma/seed.js";
import { passwordCodePointLength } from "../../src/auth-service.js";
import { readStoredAttachment } from "../../src/attachments.js";
import { getPrisma } from "../../src/prisma.js";

const MIGRATION_REGRESSION_TIMEOUT = 60_000;

describe("Lab 3 migration and seed regression (MIG-01/MIG-02)", () => {
  const prisma = getPrisma();

  beforeAll(async () => {
    const seedPassword = process.env.LAB3_SEED_INITIAL_PASSWORD ?? "";
    expect(passwordCodePointLength(seedPassword)).toBeGreaterThanOrEqual(12);
    expect(passwordCodePointLength(seedPassword)).toBeLessThanOrEqual(128);
    await prisma.$connect();
  }, MIGRATION_REGRESSION_TIMEOUT);

  afterAll(async () => {
    await prisma.$disconnect();
  }, MIGRATION_REGRESSION_TIMEOUT);

  it("preserves migrated Ticket and Attachment identity, ownership, history, and relationships", async () => {
    const legacyTicket = await prisma.ticket.findFirst({
      where: { NOT: { idempotencyKey: { startsWith: "lab3-seed-ticket-" } } },
      orderBy: { id: "asc" },
      select: {
        id: true,
        ticketNumber: true,
        requesterId: true,
        assignedToUserId: true,
        requestedPriority: true,
        itPriority: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    expect(legacyTicket).not.toBeNull();

    const legacyAttachment = await prisma.attachment.findFirst({
      where: { ticketId: legacyTicket?.id },
      orderBy: { id: "asc" },
      select: {
        id: true,
        ticketId: true,
        uploadedByUserId: true,
        removedByUserId: true,
        storageKey: true,
        availabilityState: true,
        originalFilename: true,
        mimeType: true,
        sizeBytes: true,
        uploadedAt: true,
        unavailableAt: true,
        unavailableReason: true,
        removedAt: true,
        removalReason: true,
      },
    });
    expect(legacyAttachment).not.toBeNull();

    const attachmentBytesBefore = await readStoredAttachment(legacyAttachment!.storageKey);
    const attachmentDigestBefore = createHash("sha256")
      .update(attachmentBytesBefore)
      .digest("hex");

    const beforeCounts = await legacyCounts();

    await seedDatabase(prisma);

    const afterTicket = await prisma.ticket.findUnique({
      where: { id: legacyTicket!.id },
      select: {
        id: true,
        ticketNumber: true,
        requesterId: true,
        assignedToUserId: true,
        requestedPriority: true,
        itPriority: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const afterAttachment = await prisma.attachment.findUnique({
      where: { id: legacyAttachment!.id },
      select: {
        id: true,
        ticketId: true,
        uploadedByUserId: true,
        removedByUserId: true,
        storageKey: true,
        availabilityState: true,
        originalFilename: true,
        mimeType: true,
        sizeBytes: true,
        uploadedAt: true,
        unavailableAt: true,
        unavailableReason: true,
        removedAt: true,
        removalReason: true,
      },
    });

    expect(afterTicket).toEqual(legacyTicket);
    expect(afterTicket?.itPriority).toBe(afterTicket?.requestedPriority);
    expect(afterAttachment).toEqual(legacyAttachment);
    expect(afterAttachment?.ticketId).toBe(afterTicket?.id);
    const attachmentBytesAfter = await readStoredAttachment(afterAttachment!.storageKey);
    expect(createHash("sha256").update(attachmentBytesAfter).digest("hex")).toBe(
      attachmentDigestBefore,
    );
    expect(attachmentBytesAfter.equals(attachmentBytesBefore)).toBe(true);
    expect(await legacyCounts()).toEqual(beforeCounts);

    const orphanTickets = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM "tickets" t
      LEFT JOIN "users" u ON u."id" = t."requesterId"
      WHERE u."id" IS NULL
    `;
    const orphanAttachments = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM "attachments" a
      LEFT JOIN "tickets" t ON t."id" = a."ticketId"
      LEFT JOIN "users" uploader ON uploader."id" = a."uploadedByUserId"
      WHERE t."id" IS NULL OR uploader."id" IS NULL
    `;
    expect(orphanTickets[0]?.count).toBe(0);
    expect(orphanAttachments[0]?.count).toBe(0);
  }, MIGRATION_REGRESSION_TIMEOUT);

  it("provisions required seed data and is safe to run twice", async () => {
    await seedDatabase(prisma);
    const first = await snapshotSeedState();

    await seedDatabase(prisma);
    const second = await snapshotSeedState();

    expect(second).toEqual(first);
    expect(first.users).toEqual({ REQUESTER_ACTIVE: 4, REQUESTER_INACTIVE: 1, IT_STAFF_ACTIVE: 3, IT_STAFF_INACTIVE: 1, ADMINISTRATOR_ACTIVE: 1 });
    expect(first.tickets).toBe(8);
    expect(first.assignedTickets).toBeGreaterThan(0);
    expect(first.unassignedTickets).toBeGreaterThan(0);
    expect(first.staffOwnedTickets).toBeGreaterThan(0);
    expect(first.adminOwnedTickets).toBeGreaterThan(0);
    expect(first.publicComments).toBeGreaterThanOrEqual(1);
    expect(first.internalNotes).toBeGreaterThanOrEqual(1);
    expect(first.nullPasswordHashes).toBe(0);
    expect(first.invalidPasswordHashes).toBe(0);
    expect(first.mustChangePasswordFalse).toBe(0);
  }, MIGRATION_REGRESSION_TIMEOUT);

  async function snapshotSeedState() {
    const users = await prisma.user.findMany({
      where: {
        email: {
          in: [
            "arun.chaiyasit@example.test",
            "boonmee.srisuk@example.test",
            "chalida.wongsa@example.test",
            "darin.phromma@example.test",
            "inactive.requester@example.test",
            "narin.staff@example.test",
            "somchai.staff@example.test",
            "pimchanok.staff@example.test",
            "inactive.staff@example.test",
            "admin@example.test",
          ],
        },
      },
      select: { role: true, isActive: true, passwordHash: true, mustChangePassword: true },
    });
    const tickets = await prisma.ticket.findMany({
      where: { idempotencyKey: { startsWith: "lab3-seed-ticket-" } },
      select: { assignedToUserId: true, assignedTo: { select: { role: true } } },
    });
    const [publicComments, internalNotes] = await Promise.all([
      prisma.publicComment.count(),
      prisma.internalNote.count(),
    ]);

    return {
      users: {
        REQUESTER_ACTIVE: users.filter((u) => u.role === "REQUESTER" && u.isActive).length,
        REQUESTER_INACTIVE: users.filter((u) => u.role === "REQUESTER" && !u.isActive).length,
        IT_STAFF_ACTIVE: users.filter((u) => u.role === "IT_STAFF" && u.isActive).length,
        IT_STAFF_INACTIVE: users.filter((u) => u.role === "IT_STAFF" && !u.isActive).length,
        ADMINISTRATOR_ACTIVE: users.filter((u) => u.role === "ADMINISTRATOR" && u.isActive).length,
      },
      tickets: tickets.length,
      assignedTickets: tickets.filter((ticket) => ticket.assignedToUserId !== null).length,
      unassignedTickets: tickets.filter((ticket) => ticket.assignedToUserId === null).length,
      staffOwnedTickets: tickets.filter((ticket) => ticket.assignedTo?.role === "IT_STAFF").length,
      adminOwnedTickets: tickets.filter((ticket) => ticket.assignedTo?.role === "ADMINISTRATOR").length,
      publicComments,
      internalNotes,
      nullPasswordHashes: users.filter((user) => user.passwordHash === null).length,
      invalidPasswordHashes: users.filter((user) => !user.passwordHash?.startsWith("$argon2id$")).length,
      mustChangePasswordFalse: users.filter((user) => !user.mustChangePassword).length,
    };
  }

  async function legacyCounts() {
    const rows = await prisma.$queryRaw<Array<{ tickets: number; attachments: number }>>`
      SELECT
        (SELECT COUNT(*)::int FROM "tickets"
          WHERE "idempotencyKey" NOT LIKE 'lab3-seed-ticket-%') AS tickets,
        (SELECT COUNT(*)::int
          FROM "attachments" a
          INNER JOIN "tickets" t ON t."id" = a."ticketId"
          WHERE t."idempotencyKey" NOT LIKE 'lab3-seed-ticket-%') AS attachments
    `;
    return rows[0];
  }
});
