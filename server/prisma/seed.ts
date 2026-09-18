import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import argon2 from "argon2";
import type { Prisma, PrismaClient } from "@prisma/client";

import { allocateTicketNumber } from "../src/ticket-number.js";
import { getPrisma } from "../src/prisma.js";

const CATEGORY_NAMES = ["Account and Access", "Hardware", "Software", "Network"];
const RELATED_SYSTEM_NAMES = [
  "Email",
  "Campus Wi-Fi",
  "VPN",
  "LEB2 App",
  "Grade Submission App",
  "Printer",
  "Corporate Laptop",
];

const SEED_USERS = [
  { displayName: "Arun Chaiyasit", email: "arun.chaiyasit@example.test", role: "REQUESTER" as const, isActive: true },
  { displayName: "Boonmee Srisuk", email: "boonmee.srisuk@example.test", role: "REQUESTER" as const, isActive: true },
  { displayName: "Chalida Wongsa", email: "chalida.wongsa@example.test", role: "REQUESTER" as const, isActive: true },
  { displayName: "Darin Phromma", email: "darin.phromma@example.test", role: "REQUESTER" as const, isActive: true },
  { displayName: "Inactive Test Requester", email: "inactive.requester@example.test", role: "REQUESTER" as const, isActive: false },
  { displayName: "Narin IT Staff", email: "narin.staff@example.test", role: "IT_STAFF" as const, isActive: true },
  { displayName: "Somchai IT Staff", email: "somchai.staff@example.test", role: "IT_STAFF" as const, isActive: true },
  { displayName: "Pimchanok IT Staff", email: "pimchanok.staff@example.test", role: "IT_STAFF" as const, isActive: true },
  { displayName: "Inactive Test IT Staff", email: "inactive.staff@example.test", role: "IT_STAFF" as const, isActive: false },
  { displayName: "TokTickIT Administrator", email: "admin@example.test", role: "ADMINISTRATOR" as const, isActive: true },
];

const TICKET_FIXTURES = [
  { key: "lab3-seed-ticket-0001", requesterEmail: "arun.chaiyasit@example.test", category: "Hardware", relatedSystem: "Corporate Laptop", summary: "Laptop battery needs inspection", description: "The laptop battery loses charge quickly during normal office work.", requestedPriority: "HIGH" as const, itPriority: "HIGH" as const, currentStatus: "OPEN" as const, ownerEmail: "narin.staff@example.test" },
  { key: "lab3-seed-ticket-0002", requesterEmail: "boonmee.srisuk@example.test", category: "Network", relatedSystem: "Campus Wi-Fi", summary: "Wi-Fi disconnects in the office", description: "The workstation disconnects from the campus Wi-Fi several times each morning.", requestedPriority: "MEDIUM" as const, itPriority: "URGENT" as const, currentStatus: "IN_PROGRESS" as const, ownerEmail: "somchai.staff@example.test" },
  { key: "lab3-seed-ticket-0003", requesterEmail: "chalida.wongsa@example.test", category: "Account and Access", relatedSystem: "Email", summary: "Shared mailbox access request", description: "The team needs access to the shared mailbox for routine project communication.", requestedPriority: "LOW" as const, itPriority: "LOW" as const, currentStatus: "WAITING_FOR_REQUESTER" as const, ownerEmail: "admin@example.test" },
  { key: "lab3-seed-ticket-0004", requesterEmail: "darin.phromma@example.test", category: "Software", relatedSystem: "LEB2 App", summary: "Application page loads slowly", description: "The application page takes longer than usual to load after signing in.", requestedPriority: "HIGH" as const, itPriority: "MEDIUM" as const, currentStatus: "RESOLVED" as const, ownerEmail: "pimchanok.staff@example.test" },
  { key: "lab3-seed-ticket-0005", requesterEmail: "arun.chaiyasit@example.test", category: "Hardware", relatedSystem: "Printer", summary: "Printer queue is not progressing", description: "A document remains in the printer queue and does not reach the shared printer.", requestedPriority: "MEDIUM" as const, itPriority: "MEDIUM" as const, currentStatus: "CLOSED" as const, ownerEmail: "narin.staff@example.test" },
  { key: "lab3-seed-ticket-0006", requesterEmail: "boonmee.srisuk@example.test", category: "Network", relatedSystem: "VPN", summary: "VPN connection cannot be established", description: "The VPN client reports a connection failure when working from an approved location.", requestedPriority: "URGENT" as const, itPriority: "URGENT" as const, currentStatus: "REOPENED" as const, ownerEmail: null },
  { key: "lab3-seed-ticket-0007", requesterEmail: "chalida.wongsa@example.test", category: "Software", relatedSystem: "Grade Submission App", summary: "Report export needs assistance", description: "The report export completes but the downloaded file cannot be opened.", requestedPriority: "LOW" as const, itPriority: "LOW" as const, currentStatus: "CANCELLED" as const, ownerEmail: null },
  { key: "lab3-seed-ticket-0008", requesterEmail: "darin.phromma@example.test", category: "Account and Access", relatedSystem: "Email", summary: "New account access is pending", description: "A new account needs the standard access package for a training session.", requestedPriority: "MEDIUM" as const, itPriority: "MEDIUM" as const, currentStatus: "NEW" as const, ownerEmail: null },
];

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

function seedPassword(): string {
  const value = process.env.LAB3_SEED_INITIAL_PASSWORD;
  if (value === undefined || value.length < 12 || value.length > 128) {
    throw new Error(
      "LAB3_SEED_INITIAL_PASSWORD must be set outside source control and contain 12 to 128 characters.",
    );
  }
  return value;
}

type SeedTransaction = Prisma.TransactionClient;

async function seedCommentAndNote(
  prisma: SeedTransaction,
  ticketId: number,
  authorUserId: number,
) {
  const commentContent = "Please confirm the service window that works for your team.";
  const noteContent = "Checked the standard service configuration; follow-up can use the normal runbook.";

  const existingComment = await prisma.publicComment.findFirst({
    where: { ticketId, authorUserId, content: commentContent },
  });
  if (existingComment === null) {
    await prisma.publicComment.create({
      data: { ticketId, authorUserId, content: commentContent },
    });
  }

  const existingNote = await prisma.internalNote.findFirst({
    where: { ticketId, authorUserId, content: noteContent },
  });
  if (existingNote === null) {
    await prisma.internalNote.create({
      data: { ticketId, authorUserId, content: noteContent },
    });
  }
}

export async function seedDatabase(prisma: PrismaClient = getPrisma()) {
  const password = seedPassword();
  const passwordHashByEmail = new Map<string, string>();
  for (const user of SEED_USERS) {
    passwordHashByEmail.set(
      normalizedEmail(user.email),
      await argon2.hash(password, { type: argon2.argon2id }),
    );
  }

  await prisma.$transaction(async (transaction) => {
    for (const name of CATEGORY_NAMES) {
      await transaction.category.upsert({
        where: { name },
        update: { isActive: true },
        create: { name, isActive: true },
      });
    }

    for (const name of RELATED_SYSTEM_NAMES) {
      await transaction.relatedSystem.upsert({
        where: { name },
        update: { isActive: true },
        create: { name, isActive: true },
      });
    }

    for (const user of SEED_USERS) {
      await transaction.user.upsert({
        where: { email: normalizedEmail(user.email) },
        update: {
          displayName: user.displayName,
          role: user.role,
          isActive: user.isActive,
          passwordHash: passwordHashByEmail.get(normalizedEmail(user.email)) as string,
          mustChangePassword: true,
        },
        create: {
          displayName: user.displayName,
          email: normalizedEmail(user.email),
          role: user.role,
          isActive: user.isActive,
          passwordHash: passwordHashByEmail.get(normalizedEmail(user.email)) as string,
          mustChangePassword: true,
        },
      });
    }

    // A migration may contain requester rows that are not part of this local
    // fixture. They still need credentials before passwordHash becomes NOT NULL.
    const users = await transaction.user.findMany({
      select: { id: true, email: true },
    });
    for (const user of users) {
      const email = normalizedEmail(user.email);
      const passwordHash =
        passwordHashByEmail.get(email) ??
        (await argon2.hash(password, { type: argon2.argon2id }));
      await transaction.user.update({
        where: { id: user.id },
        data: { passwordHash, mustChangePassword: true },
      });
    }

    const provisionedUsers = await transaction.user.findMany({
      select: { id: true, email: true },
    });
    const userIdByEmail = new Map(
      provisionedUsers.map((user) => [normalizedEmail(user.email), user.id]),
    );

    const categories = await transaction.category.findMany({
      where: { name: { in: CATEGORY_NAMES } },
      select: { id: true, name: true },
    });
    const categoryIdByName = new Map(categories.map((row) => [row.name, row.id]));
    const relatedSystems = await transaction.relatedSystem.findMany({
      where: { name: { in: RELATED_SYSTEM_NAMES } },
      select: { id: true, name: true },
    });
    const relatedSystemIdByName = new Map(
      relatedSystems.map((row) => [row.name, row.id]),
    );

    for (const fixture of TICKET_FIXTURES) {
      const requesterId = userIdByEmail.get(normalizedEmail(fixture.requesterEmail));
      const categoryId = categoryIdByName.get(fixture.category);
      const relatedSystemId = relatedSystemIdByName.get(fixture.relatedSystem);
      const assignedToUserId =
        fixture.ownerEmail === null
          ? null
          : userIdByEmail.get(normalizedEmail(fixture.ownerEmail));

      if (requesterId === undefined || categoryId === undefined || relatedSystemId === undefined) {
        throw new Error(`Seed fixture ${fixture.key} has an unresolved reference.`);
      }
      if (fixture.ownerEmail !== null && assignedToUserId === undefined) {
        throw new Error(`Seed fixture ${fixture.key} has an unresolved owner.`);
      }

      const ticketDate = new Date("2026-09-18T00:00:00.000Z");
      const existing = await transaction.ticket.findUnique({
        where: { idempotencyKey: fixture.key },
        select: { id: true },
      });
      const assignedAt = assignedToUserId === null ? null : ticketDate;

      const ticket =
        existing === null
          ? await transaction.ticket.create({
              data: {
                ticketNumber: await allocateTicketNumber(transaction, ticketDate),
                ticketDate,
                requesterId,
                categoryId,
                relatedSystemId,
                summary: fixture.summary,
                description: fixture.description,
                requestedPriority: fixture.requestedPriority,
                itPriority: fixture.itPriority,
                currentStatus: fixture.currentStatus,
                assignedToUserId,
                assignedAt,
                idempotencyKey: fixture.key,
              },
            })
          : await transaction.ticket.update({
              where: { id: existing.id },
              data: {
                requesterId,
                categoryId,
                relatedSystemId,
                summary: fixture.summary,
                description: fixture.description,
                requestedPriority: fixture.requestedPriority,
                itPriority: fixture.itPriority,
                currentStatus: fixture.currentStatus,
                assignedToUserId,
                assignedAt,
              },
            });

      const staffAuthorId = userIdByEmail.get("narin.staff@example.test");
      if (staffAuthorId === undefined) throw new Error("Seed staff author is missing.");
      if (fixture.key === "lab3-seed-ticket-0001") {
        await seedCommentAndNote(transaction, ticket.id, staffAuthorId);
      }
    }

    const missingPasswordRows = await transaction.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM "users"
      WHERE "passwordHash" IS NULL
    `;
    if ((missingPasswordRows[0]?.count ?? 0) !== 0) {
      throw new Error("Seed verification failed: one or more Users have no password hash.");
    }

    await transaction.$executeRaw`
      ALTER TABLE "users" ALTER COLUMN "passwordHash" SET NOT NULL
    `;
  });
}

async function main() {
  const prisma = getPrisma();

  try {
    await seedDatabase(prisma);
    console.log(
      `Seeded ${CATEGORY_NAMES.length} categories, ${RELATED_SYSTEM_NAMES.length} related systems, ${SEED_USERS.length} users, ${TICKET_FIXTURES.length} tickets, and example comments/notes.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Unable to seed database.");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

const isMainModule =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  void main();
}
