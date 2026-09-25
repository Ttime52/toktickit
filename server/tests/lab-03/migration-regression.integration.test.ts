import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { cp, mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedDatabase } from "../../prisma/seed.js";
import { passwordCodePointLength } from "../../src/auth-service.js";
import {
  readStoredAttachment,
  removeStoredAttachment,
  storeAttachmentBytes,
} from "../../src/attachments.js";
import { getPrisma } from "../../src/prisma.js";

// Argon2id hashes ten seed accounts and can take longer when the full Lab 3
// suite has already exercised the same local PostgreSQL/CPU resources.
const MIGRATION_REGRESSION_TIMEOUT = 120_000;
const LAB2_LAST_MIGRATION = "20260903020000_remove_legacy_category_index";
const SERVER_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const MIGRATIONS_ROOT = join(SERVER_ROOT, "prisma", "migrations");
const execFileAsync = promisify(execFile);

type Lab2UserSnapshot = {
  id: number;
  displayName: string;
  email: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type Lab2TicketSnapshot = {
  id: number;
  ticketNumber: string;
  ticketDate: Date;
  requesterId: number;
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  description: string;
  requestedPriority: string;
  currentStatus: string;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
};

type Lab2AttachmentSnapshot = {
  id: number;
  ticketId: number;
  uploadedByRequesterId: number;
  removedByRequesterId: number | null;
  storageKey: string;
  availabilityState: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
  unavailableAt: Date | null;
  unavailableReason: string | null;
  removedAt: Date | null;
  removalReason: string | null;
};

type Lab2FixtureSnapshot = {
  users: Lab2UserSnapshot[];
  tickets: Lab2TicketSnapshot[];
  attachments: Lab2AttachmentSnapshot[];
  attachment: Lab2AttachmentSnapshot;
};

type Lab3UserSnapshot = Lab2UserSnapshot & { role: string };

type Lab3TicketSnapshot = Lab2TicketSnapshot & { itPriority: string };

type Lab3AttachmentSnapshot = Omit<
  Lab2AttachmentSnapshot,
  "uploadedByRequesterId" | "removedByRequesterId"
> & {
  uploadedByUserId: number;
  removedByUserId: number | null;
};

type Lab3FixtureSnapshot = {
  users: Lab3UserSnapshot[];
  tickets: Lab3TicketSnapshot[];
  attachments: Lab3AttachmentSnapshot[];
};

type Lab2MigrationFixture = {
  prisma: PrismaClient;
  databaseUrl: string;
  schemaPath: string;
  postLab2Migrations: string[];
  allMigrations: string[];
  cleanup: () => Promise<void>;
};

async function migrationNames(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_ROOT, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && /^\d{14}_/u.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

async function createMigrationWorkspace(): Promise<{
  root: string;
  schemaPath: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "toktickit-lab3-migration-"));
  const prismaPath = join(root, "prisma");
  const migrationsPath = join(prismaPath, "migrations");
  await mkdir(migrationsPath, { recursive: true });
  await writeFile(
    join(prismaPath, "schema.prisma"),
    `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
`,
    "utf8",
  );
  await cp(
    join(MIGRATIONS_ROOT, "migration_lock.toml"),
    join(migrationsPath, "migration_lock.toml"),
  );

  return {
    root,
    schemaPath: join(prismaPath, "schema.prisma"),
  };
}

async function stageMigrations(migrationsPath: string, names: string[]): Promise<void> {
  for (const name of names) {
    await cp(join(MIGRATIONS_ROOT, name), join(migrationsPath, name), {
      recursive: true,
    });
  }
}

async function deployMigrations(
  databaseUrl: string,
  schemaPath: string,
  names: string[],
): Promise<void> {
  const migrationsPath = join(dirname(schemaPath), "migrations");
  await stageMigrations(migrationsPath, names);

  const prismaCli = join(SERVER_ROOT, "node_modules", "prisma", "build", "index.js");

  try {
    await execFileAsync(
      process.execPath,
      [prismaCli, "migrate", "deploy", "--schema", schemaPath],
      {
        cwd: SERVER_ROOT,
        env: { ...process.env, DATABASE_URL: databaseUrl },
        maxBuffer: 10 * 1024 * 1024,
      },
    );
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; message?: string };
    throw new Error(
      [
        "Temporary Lab 2/Lab 3 migration deployment failed.",
        failure.stdout,
        failure.stderr,
        failure.message,
      ]
        .filter((part): part is string => Boolean(part))
        .join("\n"),
      { cause: error },
    );
  }
}

function databaseUrlForSchema(schemaName: string): string {
  const configuredUrl = process.env.DATABASE_URL;
  if (configuredUrl === undefined || configuredUrl.length === 0) {
    throw new Error("DATABASE_URL is required for the migration regression fixture.");
  }

  const url = new URL(configuredUrl);
  url.searchParams.set("schema", schemaName);
  return url.toString();
}

async function insertLab2Fixture(prisma: PrismaClient, storageKey: string): Promise<void> {
  const requesterCreatedAt = new Date("2026-08-01T08:00:00.000Z");
  const requesterUpdatedAt = new Date("2026-09-01T08:00:00.000Z");
  const categoryCreatedAt = new Date("2026-07-01T08:00:00.000Z");
  const ticketDate = new Date("2026-08-14T00:00:00.000Z");
  const createdAt = new Date("2026-08-14T08:15:00.000Z");
  const updatedAt = new Date("2026-09-10T10:30:00.000Z");
  const uploadedAt = new Date("2026-08-14T08:20:00.000Z");
  const unavailableAt = new Date("2026-08-20T09:00:00.000Z");
  const removedAt = new Date("2026-08-21T09:00:00.000Z");

  await prisma.$executeRaw`
    INSERT INTO "categories" ("id", "name", "isActive", "createdAt", "updatedAt")
    VALUES (3101, ${"Hardware"}, true, ${categoryCreatedAt}, ${categoryCreatedAt})
  `;
  await prisma.$executeRaw`
    INSERT INTO "related_systems" ("id", "name", "isActive", "createdAt", "updatedAt")
    VALUES (3201, ${"Lab 2 Portal"}, true, ${categoryCreatedAt}, ${categoryCreatedAt})
  `;

  await prisma.$executeRaw`
    INSERT INTO "development_requesters"
      ("id", "displayName", "email", "isActive", "createdAt", "updatedAt")
    VALUES
      (4101, ${"Legacy Ticket Owner"}, ${"Legacy.Owner@Example.test"}, true, ${requesterCreatedAt}, ${requesterUpdatedAt}),
      (4102, ${"Legacy Attachment Reviewer"}, ${"legacy.reviewer@example.test"}, true, ${requesterCreatedAt}, ${requesterUpdatedAt})
  `;

  await prisma.$executeRaw`
    INSERT INTO "tickets"
      ("id", "ticketNumber", "ticketDate", "requesterId", "categoryId", "relatedSystemId",
       "summary", "description", "requestedPriority", "itPriority", "currentStatus",
       "idempotencyKey", "createdAt", "updatedAt")
    VALUES
      (5101, ${"LAB2-2026-0001"}, ${ticketDate}, 4101, 3101, 3201,
       ${"Legacy attachment ticket"}, ${"Pre-existing Lab 2 ticket used for migration evidence."},
       ${"HIGH"}::"RequestedPriority", NULL, ${"NEW"}::"CurrentStatus",
       ${"lab2-migration-fixture-ticket-0001"}, ${createdAt}, ${updatedAt}),
      (5102, ${"LAB2-2026-0002"}, ${ticketDate}, 4102, 3101, 3201,
       ${"Legacy history ticket"}, ${"A second pre-existing Lab 2 ticket verifies count and ownership preservation."},
       ${"LOW"}::"RequestedPriority", NULL, ${"NEW"}::"CurrentStatus",
       ${"lab2-migration-fixture-ticket-0002"}, ${createdAt}, ${updatedAt})
  `;

  await prisma.$executeRaw`
    INSERT INTO "attachments"
      ("id", "ticketId", "uploadedByRequesterId", "originalFilename", "storageKey",
       "mimeType", "sizeBytes", "uploadedAt", "availabilityState", "unavailableAt",
       "unavailableReason", "removedAt", "removedByRequesterId", "removalReason")
    VALUES
      (6101, 5101, 4101, ${"legacy-evidence.pdf"}, ${storageKey}, ${"application/pdf"},
       29, ${uploadedAt}, ${"UNAVAILABLE"}::"AttachmentAvailability", ${unavailableAt},
       ${"Legacy storage temporarily unavailable"}, ${removedAt}, 4102,
       ${"Removed by the Lab 2 requester workflow"})
  `;
}

async function readLab2FixtureSnapshot(prisma: PrismaClient): Promise<Lab2FixtureSnapshot> {
  const users = await prisma.$queryRaw<Lab2UserSnapshot[]>`
    SELECT "id", "displayName", "email", "isActive", "createdAt", "updatedAt"
    FROM "development_requesters"
    ORDER BY "id"
  `;
  const tickets = await prisma.$queryRaw<Lab2TicketSnapshot[]>`
    SELECT "id", "ticketNumber", "ticketDate", "requesterId", "categoryId", "relatedSystemId",
           "summary", "description", "requestedPriority", "currentStatus", "idempotencyKey",
           "createdAt", "updatedAt"
    FROM "tickets"
    ORDER BY "id"
  `;
  const attachments = await prisma.$queryRaw<Lab2AttachmentSnapshot[]>`
    SELECT "id", "ticketId", "uploadedByRequesterId", "removedByRequesterId", "storageKey",
           "availabilityState", "originalFilename", "mimeType", "sizeBytes", "uploadedAt",
           "unavailableAt", "unavailableReason", "removedAt", "removalReason"
    FROM "attachments"
    ORDER BY "id"
  `;
  const attachment = attachments[0];
  if (attachment === undefined) {
    throw new Error("The Lab 2 migration fixture did not create an Attachment.");
  }

  return { users, tickets, attachments, attachment };
}

async function readLab3FixtureSnapshot(prisma: PrismaClient): Promise<Lab3FixtureSnapshot> {
  const users = await prisma.$queryRaw<Lab3UserSnapshot[]>`
    SELECT "id", "displayName", "email", "isActive", "createdAt", "updatedAt", "role"
    FROM "users"
    ORDER BY "id"
  `;
  const tickets = await prisma.$queryRaw<Lab3TicketSnapshot[]>`
    SELECT "id", "ticketNumber", "ticketDate", "requesterId", "categoryId", "relatedSystemId",
           "summary", "description", "requestedPriority", "itPriority", "currentStatus",
           "idempotencyKey", "createdAt", "updatedAt"
    FROM "tickets"
    ORDER BY "id"
  `;
  const attachments = await prisma.$queryRaw<Lab3AttachmentSnapshot[]>`
    SELECT "id", "ticketId", "uploadedByUserId", "removedByUserId", "storageKey",
           "availabilityState", "originalFilename", "mimeType", "sizeBytes", "uploadedAt",
           "unavailableAt", "unavailableReason", "removedAt", "removalReason"
    FROM "attachments"
    ORDER BY "id"
  `;

  return { users, tickets, attachments };
}

async function createLab2MigrationFixture(
  basePrisma: PrismaClient,
): Promise<Lab2MigrationFixture> {
  const allMigrations = await migrationNames();
  const lab2BoundaryIndex = allMigrations.indexOf(LAB2_LAST_MIGRATION);
  if (lab2BoundaryIndex < 0) {
    throw new Error(`Could not find the Lab 2 migration boundary: ${LAB2_LAST_MIGRATION}`);
  }

  const lab2Migrations = allMigrations.slice(0, lab2BoundaryIndex + 1);
  const postLab2Migrations = allMigrations.slice(lab2BoundaryIndex + 1);
  const schemaName = `lab3_mig_${randomUUID().replaceAll("-", "")}`;
  const databaseUrl = databaseUrlForSchema(schemaName);
  const workspace = await createMigrationWorkspace();
  const attachmentStorageDirectory = await mkdtemp(
    join(tmpdir(), "toktickit-lab3-attachments-"),
  );
  const previousAttachmentStorageDirectory = process.env.ATTACHMENT_STORAGE_DIR;
  let fixturePrisma: PrismaClient | null = null;
  let storageKey: string | null = null;
  let schemaCreated = false;
  let cleaned = false;

  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;

    try {
      if (fixturePrisma !== null) await fixturePrisma.$disconnect();
    } finally {
      if (storageKey !== null) {
        process.env.ATTACHMENT_STORAGE_DIR = attachmentStorageDirectory;
        await removeStoredAttachment(storageKey).catch(() => undefined);
      }
      if (schemaCreated) {
        await basePrisma.$executeRawUnsafe(`DROP SCHEMA "${schemaName}" CASCADE`);
      }
      await rm(attachmentStorageDirectory, { recursive: true, force: true });
      await rm(workspace.root, { recursive: true, force: true });
      if (previousAttachmentStorageDirectory === undefined) {
        delete process.env.ATTACHMENT_STORAGE_DIR;
      } else {
        process.env.ATTACHMENT_STORAGE_DIR = previousAttachmentStorageDirectory;
      }
    }
  };

  try {
    await basePrisma.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
    schemaCreated = true;
    fixturePrisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

    await deployMigrations(databaseUrl, workspace.schemaPath, lab2Migrations);

    process.env.ATTACHMENT_STORAGE_DIR = attachmentStorageDirectory;
    const attachmentBytes = Buffer.from("%PDF-1.4\nLab 2 migration fixture\n", "utf8");
    storageKey = await storeAttachmentBytes(attachmentBytes);
    await insertLab2Fixture(fixturePrisma, storageKey);

    return {
      prisma: fixturePrisma,
      databaseUrl,
      schemaPath: workspace.schemaPath,
      postLab2Migrations,
      allMigrations,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

describe("Lab 3 migration and seed regression (MIG-01/MIG-02)", () => {
  const prisma = getPrisma();

  beforeAll(async () => {
    await prisma.$connect();
  }, MIGRATION_REGRESSION_TIMEOUT);

  afterAll(async () => {
    await prisma.$disconnect();
  }, MIGRATION_REGRESSION_TIMEOUT);

  it("preserves migrated Ticket and Attachment identity, ownership, history, and relationships", async () => {
    const fixture = await createLab2MigrationFixture(prisma);

    try {
      const before = await readLab2FixtureSnapshot(fixture.prisma);
      const attachmentBytesBefore = await readStoredAttachment(before.attachment.storageKey);
      const attachmentDigestBefore = createHash("sha256")
        .update(attachmentBytesBefore)
        .digest("hex");

      await deployMigrations(fixture.databaseUrl, fixture.schemaPath, fixture.postLab2Migrations);

      const after = await readLab3FixtureSnapshot(fixture.prisma);
      const appliedMigrations = await fixture.prisma.$queryRaw<Array<{ migration_name: string }>>`
        SELECT "migration_name"
        FROM "_prisma_migrations"
        WHERE "finished_at" IS NOT NULL
        ORDER BY "started_at"
      `;

      expect(appliedMigrations.map((row) => row.migration_name)).toEqual(
        fixture.allMigrations,
      );
      expect(after.users).toEqual(
        before.users.map((user) => ({
          ...user,
          email: user.email.trim().toLowerCase(),
          role: "REQUESTER",
        })),
      );
      expect(after.tickets).toEqual(
        before.tickets.map((ticket) => ({
          ...ticket,
          itPriority: ticket.requestedPriority,
        })),
      );
      expect(after.attachments).toEqual(
        before.attachments.map(({ uploadedByRequesterId, removedByRequesterId, ...attachment }) => ({
          ...attachment,
          uploadedByUserId: uploadedByRequesterId,
          removedByUserId: removedByRequesterId,
        })),
      );
      expect(after.tickets).toHaveLength(2);
      expect(after.attachments).toHaveLength(1);
      expect(after.tickets.map((ticket) => ticket.requesterId)).toEqual(
        before.tickets.map((ticket) => ticket.requesterId),
      );
      expect(after.attachments[0]?.ticketId).toBe(after.tickets[0]?.id);

      const attachmentBytesAfter = await readStoredAttachment(after.attachments[0]!.storageKey);
      expect(createHash("sha256").update(attachmentBytesAfter).digest("hex")).toBe(
        attachmentDigestBefore,
      );
      expect(attachmentBytesAfter.equals(attachmentBytesBefore)).toBe(true);

      const orphanTickets = await fixture.prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS count
        FROM "tickets" t
        LEFT JOIN "users" u ON u."id" = t."requesterId"
        WHERE u."id" IS NULL
      `;
      const orphanAttachments = await fixture.prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS count
        FROM "attachments" a
        LEFT JOIN "tickets" t ON t."id" = a."ticketId"
        LEFT JOIN "users" uploader ON uploader."id" = a."uploadedByUserId"
        WHERE t."id" IS NULL OR uploader."id" IS NULL
      `;
      expect(orphanTickets[0]?.count).toBe(0);
      expect(orphanAttachments[0]?.count).toBe(0);
    } finally {
      await fixture.cleanup();
    }
  }, MIGRATION_REGRESSION_TIMEOUT);

  it("provisions required seed data and is safe to run twice", async () => {
    const seedPassword = process.env.LAB3_SEED_INITIAL_PASSWORD ?? "";
    expect(passwordCodePointLength(seedPassword)).toBeGreaterThanOrEqual(12);
    expect(passwordCodePointLength(seedPassword)).toBeLessThanOrEqual(128);

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
