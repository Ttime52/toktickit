import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "../../src/prisma.js";
import { seedDatabase } from "../../prisma/seed.js";

type ColumnRow = {
  table_name: string;
  column_name: string;
  is_nullable: string;
  column_default: string | null;
};

type EnumRow = { type_name: string; enum_label: string };
type IndexRow = { table_name: string; index_name: string; is_unique: boolean };
type ForeignKeyRow = {
  table_name: string;
  column_name: string;
  referenced_table: string;
  referenced_column: string;
  delete_action: string;
};

const TABLE_NAMES = [
  "categories",
  "users",
  "related_systems",
  "tickets",
  "ticket_number_counters",
  "attachments",
  "sessions",
  "login_throttle_buckets",
  "public_comments",
  "internal_notes",
];

const EXPECTED_COLUMNS: Record<string, Record<string, "YES" | "NO">> = {
  categories: {
    id: "NO",
    name: "NO",
    isActive: "NO",
    createdAt: "NO",
    updatedAt: "NO",
  },
  users: {
    id: "NO",
    displayName: "NO",
    email: "NO",
    passwordHash: "NO",
    role: "NO",
    isActive: "NO",
    mustChangePassword: "NO",
    lastLoginAt: "YES",
    createdAt: "NO",
    updatedAt: "NO",
  },
  related_systems: {
    id: "NO",
    name: "NO",
    isActive: "NO",
    createdAt: "NO",
    updatedAt: "NO",
  },
  tickets: {
    id: "NO",
    ticketNumber: "NO",
    ticketDate: "NO",
    requesterId: "NO",
    categoryId: "NO",
    relatedSystemId: "NO",
    summary: "NO",
    description: "NO",
    requestedPriority: "NO",
    itPriority: "NO",
    currentStatus: "NO",
    assignedToUserId: "YES",
    assignedAt: "YES",
    requesterResolutionIndicatedAt: "YES",
    requesterResolutionIndicatedByUserId: "YES",
    idempotencyKey: "NO",
    version: "NO",
    resolvedAt: "YES",
    closedAt: "YES",
    cancelledAt: "YES",
    resolutionSummary: "YES",
    closureSummary: "YES",
    cancelReason: "YES",
    reopenReason: "YES",
    createdAt: "NO",
    updatedAt: "NO",
  },
  ticket_number_counters: { year: "NO", nextValue: "NO" },
  attachments: {
    id: "NO",
    ticketId: "NO",
    uploadedByUserId: "NO",
    originalFilename: "NO",
    storageKey: "NO",
    mimeType: "NO",
    sizeBytes: "NO",
    uploadedAt: "NO",
    availabilityState: "NO",
    unavailableAt: "YES",
    unavailableReason: "YES",
    removedAt: "YES",
    removedByUserId: "YES",
    removalReason: "YES",
  },
  sessions: {
    id: "NO",
    userId: "NO",
    createdAt: "NO",
    lastSeenAt: "NO",
    expiresAt: "NO",
    revokedAt: "YES",
  },
  public_comments: {
    id: "NO",
    ticketId: "NO",
    authorUserId: "NO",
    content: "NO",
    createdAt: "NO",
  },
  internal_notes: {
    id: "NO",
    ticketId: "NO",
    authorUserId: "NO",
    content: "NO",
    createdAt: "NO",
  },
};

const EXPECTED_INDEXES = [
  ["categories_pkey", true],
  ["categories_name_key", true],
  ["categories_isActive_name_idx", false],
  ["users_pkey", true],
  ["users_email_key", true],
  ["users_role_isActive_displayName_idx", false],
  ["users_role_isActive_email_idx", false],
  ["related_systems_pkey", true],
  ["related_systems_name_key", true],
  ["related_systems_isActive_name_idx", false],
  ["tickets_pkey", true],
  ["tickets_ticketNumber_key", true],
  ["tickets_idempotencyKey_key", true],
  ["tickets_requesterId_updatedAt_idx", false],
  ["tickets_requesterId_currentStatus_idx", false],
  ["tickets_requesterId_categoryId_idx", false],
  ["tickets_requesterId_relatedSystemId_idx", false],
  ["tickets_requesterId_requestedPriority_idx", false],
  ["ticket_number_counters_pkey", true],
  ["attachments_pkey", true],
  ["attachments_storageKey_key", true],
  ["attachments_ticketId_removedAt_idx", false],
  ["attachments_ticketId_uploadedAt_idx", false],
  ["sessions_pkey", true],
  ["sessions_userId_revokedAt_expiresAt_idx", false],
  ["public_comments_pkey", true],
  ["public_comments_ticketId_createdAt_id_idx", false],
  ["internal_notes_pkey", true],
  ["internal_notes_ticketId_createdAt_id_idx", false],
] as const;

const EXPECTED_FOREIGN_KEYS = [
  ["tickets", "requesterId", "users", "id", "RESTRICT"],
  ["tickets", "categoryId", "categories", "id", "RESTRICT"],
  ["tickets", "relatedSystemId", "related_systems", "id", "RESTRICT"],
  ["tickets", "assignedToUserId", "users", "id", "SET NULL"],
  ["tickets", "requesterResolutionIndicatedByUserId", "users", "id", "SET NULL"],
  ["attachments", "ticketId", "tickets", "id", "RESTRICT"],
  ["attachments", "uploadedByUserId", "users", "id", "RESTRICT"],
  ["attachments", "removedByUserId", "users", "id", "SET NULL"],
  ["sessions", "userId", "users", "id", "CASCADE"],
  ["public_comments", "ticketId", "tickets", "id", "RESTRICT"],
  ["public_comments", "authorUserId", "users", "id", "RESTRICT"],
  ["internal_notes", "ticketId", "tickets", "id", "RESTRICT"],
  ["internal_notes", "authorUserId", "users", "id", "RESTRICT"],
] as const;

const EXPECTED_SEEDED_CATEGORIES = [
  "Account and Access",
  "Hardware",
  "Software",
  "Network",
];
const EXPECTED_SEEDED_SYSTEMS = [
  "Email",
  "Campus Wi-Fi",
  "VPN",
  "LEB2 App",
  "Grade Submission App",
  "Printer",
  "Corporate Laptop",
];
const EXPECTED_SEEDED_REQUESTER_EMAILS = [
  "arun.chaiyasit@example.test",
  "boonmee.srisuk@example.test",
  "chalida.wongsa@example.test",
  "darin.phromma@example.test",
  "inactive.requester@example.test",
];

describe("Lab 2/3 current User-backed database schema (DB-01)", () => {
  const prisma = getPrisma();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("keeps the migrated User-backed tables, columns, nullability, enums, and defaults", async () => {
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY(${TABLE_NAMES})
      ORDER BY table_name
    `;
    expect(tables.map(({ table_name }) => table_name)).toEqual([...TABLE_NAMES].sort());

    const legacyTable = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'development_requesters'
    `;
    expect(legacyTable).toHaveLength(0);

    const columns = await prisma.$queryRaw<ColumnRow[]>`
      SELECT table_name, column_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY(${TABLE_NAMES})
    `;
    const columnsByName = new Map(
      columns.map((column) => [`${column.table_name}.${column.column_name}`, column]),
    );

    for (const [tableName, expectedTableColumns] of Object.entries(EXPECTED_COLUMNS)) {
      for (const [columnName, expectedNullable] of Object.entries(expectedTableColumns)) {
        const column = columnsByName.get(`${tableName}.${columnName}`);
        expect(column, `${tableName}.${columnName}`).toBeDefined();
        if (column !== undefined) {
          expect(column.is_nullable, `${tableName}.${columnName}`).toBe(expectedNullable);
        }
      }
    }

    const expectedDefaults = {
      "categories.isActive": "true",
      "users.role": "REQUESTER",
      "users.isActive": "true",
      "users.mustChangePassword": "true",
      "related_systems.isActive": "true",
      "tickets.requestedPriority": "MEDIUM",
      "tickets.currentStatus": "NEW",
      "tickets.version": "1",
      "ticket_number_counters.nextValue": "1",
      "attachments.availabilityState": "AVAILABLE",
    };
    for (const [columnName, expectedDefault] of Object.entries(expectedDefaults)) {
      const column = columnsByName.get(columnName);
      expect(column, columnName).toBeDefined();
      expect(column?.column_default, columnName).toContain(expectedDefault);
    }

    const enums = await prisma.$queryRaw<EnumRow[]>`
      SELECT t.typname AS type_name, e.enumlabel AS enum_label
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname IN ('UserRole', 'RequestedPriority', 'ItPriority', 'CurrentStatus', 'AttachmentAvailability')
      ORDER BY t.typname, e.enumsortorder
    `;
    const enumValues = new Map<string, string[]>();
    for (const enumRow of enums) {
      const values = enumValues.get(enumRow.type_name) ?? [];
      values.push(enumRow.enum_label);
      enumValues.set(enumRow.type_name, values);
    }
    expect(enumValues.get("UserRole")).toEqual(["REQUESTER", "IT_STAFF", "ADMINISTRATOR"]);
    expect(enumValues.get("RequestedPriority")).toEqual(["LOW", "MEDIUM", "HIGH", "URGENT"]);
    expect(enumValues.get("ItPriority")).toEqual(["LOW", "MEDIUM", "HIGH", "URGENT"]);
    expect(enumValues.get("CurrentStatus")).toEqual([
      "NEW",
      "OPEN",
      "IN_PROGRESS",
      "WAITING_FOR_REQUESTER",
      "RESOLVED",
      "CLOSED",
      "REOPENED",
      "CANCELLED",
    ]);
    expect(enumValues.get("AttachmentAvailability")).toEqual(["AVAILABLE", "UNAVAILABLE"]);
  });

  it("keeps ownership, authorization, and lifecycle constraints after migration", async () => {
    const indexes = await prisma.$queryRaw<IndexRow[]>`
      SELECT tbl.relname AS table_name, idx.relname AS index_name, ind.indisunique AS is_unique
      FROM pg_index ind
      JOIN pg_class tbl ON tbl.oid = ind.indrelid
      JOIN pg_class idx ON idx.oid = ind.indexrelid
      JOIN pg_namespace namespace ON namespace.oid = tbl.relnamespace
      WHERE namespace.nspname = 'public' AND tbl.relname = ANY(${TABLE_NAMES})
    `;
    for (const [indexName, isUnique] of EXPECTED_INDEXES) {
      const index = indexes.find(({ index_name }) => index_name === indexName);
      expect(index, indexName).toBeDefined();
      expect(index?.is_unique, indexName).toBe(isUnique);
    }

    const foreignKeys = await prisma.$queryRaw<ForeignKeyRow[]>`
      SELECT source_table.relname AS table_name, source_column.attname AS column_name,
        target_table.relname AS referenced_table, target_column.attname AS referenced_column,
        CASE constraint_row.confdeltype WHEN 'r' THEN 'RESTRICT' WHEN 'n' THEN 'SET NULL'
          WHEN 'c' THEN 'CASCADE' WHEN 'd' THEN 'SET DEFAULT' WHEN 'a' THEN 'NO ACTION' ELSE 'UNKNOWN' END AS delete_action
      FROM pg_constraint constraint_row
      JOIN pg_class source_table ON source_table.oid = constraint_row.conrelid
      JOIN pg_class target_table ON target_table.oid = constraint_row.confrelid
      JOIN pg_namespace namespace ON namespace.oid = source_table.relnamespace
      JOIN pg_attribute source_column ON source_column.attrelid = constraint_row.conrelid AND source_column.attnum = constraint_row.conkey[1]
      JOIN pg_attribute target_column ON target_column.attrelid = constraint_row.confrelid AND target_column.attnum = constraint_row.confkey[1]
      WHERE constraint_row.contype = 'f' AND namespace.nspname = 'public'
        AND source_table.relname = ANY(${TABLE_NAMES})
    `;
    const foreignKeyNames = foreignKeys.map(({ table_name, column_name, referenced_table, referenced_column, delete_action }) =>
      `${table_name}.${column_name}->${referenced_table}.${referenced_column}:${delete_action}`,
    );
    for (const [tableName, columnName, referencedTable, referencedColumn, deleteAction] of EXPECTED_FOREIGN_KEYS) {
      expect(foreignKeyNames).toContain(
        `${tableName}.${columnName}->${referencedTable}.${referencedColumn}:${deleteAction}`,
      );
    }

    const checks = await prisma.$queryRaw<{ constraint_name: string }[]>`
      SELECT constraint_row.conname AS constraint_name
      FROM pg_constraint constraint_row
      JOIN pg_class table_row ON table_row.oid = constraint_row.conrelid
      JOIN pg_namespace namespace ON namespace.oid = table_row.relnamespace
      WHERE constraint_row.contype = 'c' AND namespace.nspname = 'public'
        AND constraint_row.conname IN ('ticket_number_counters_year_positive_check', 'ticket_number_counters_next_value_positive_check')
    `;
    expect(checks.map(({ constraint_name }) => constraint_name).sort()).toEqual([
      "ticket_number_counters_next_value_positive_check",
      "ticket_number_counters_year_positive_check",
    ]);
  });

  it("runs the User-based seed twice without duplicate accounts or reference data", async () => {
    const beforeCounts = {
      categories: await prisma.category.count(),
      relatedSystems: await prisma.relatedSystem.count(),
      users: await prisma.user.count(),
    };

    await seedDatabase(prisma);
    await seedDatabase(prisma);

    const afterCounts = {
      categories: await prisma.category.count(),
      relatedSystems: await prisma.relatedSystem.count(),
      users: await prisma.user.count(),
    };
    expect(afterCounts).toEqual(beforeCounts);
    expect(afterCounts.categories).toBe(4);
    expect(afterCounts.relatedSystems).toBeGreaterThanOrEqual(7);
    expect(afterCounts.users).toBeGreaterThanOrEqual(10);

    const categories = await prisma.category.findMany({
      where: { name: { in: EXPECTED_SEEDED_CATEGORIES } },
      select: { name: true },
      orderBy: { name: "asc" },
    });
    expect(categories.map(({ name }) => name)).toEqual([...EXPECTED_SEEDED_CATEGORIES].sort());

    const systems = await prisma.relatedSystem.findMany({
      where: { name: { in: EXPECTED_SEEDED_SYSTEMS } },
      select: { name: true },
      orderBy: { name: "asc" },
    });
    expect(systems.map(({ name }) => name)).toEqual([...EXPECTED_SEEDED_SYSTEMS].sort());

    const requesters = await prisma.user.findMany({
      where: { email: { in: EXPECTED_SEEDED_REQUESTER_EMAILS } },
      select: { email: true, isActive: true, role: true },
      orderBy: { email: "asc" },
    });
    expect(requesters).toHaveLength(5);
    expect(requesters.every(({ role }) => role === "REQUESTER")).toBe(true);
    expect(requesters.filter(({ isActive }) => isActive)).toHaveLength(4);
    expect(requesters.filter(({ isActive }) => !isActive)).toHaveLength(1);

    const activeRequesters = await prisma.user.findMany({
      where: { role: "REQUESTER", isActive: true },
      select: { email: true, isActive: true },
    });
    expect(activeRequesters.every(({ isActive }) => isActive)).toBe(true);
    expect(activeRequesters.map(({ email }) => email)).not.toContain("inactive.requester@example.test");
  }, 20_000);
});
