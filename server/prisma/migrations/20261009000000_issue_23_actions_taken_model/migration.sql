-- Issue 23: additive Ticket concurrency/workflow fields and Actions Taken.
-- Prisma applies migrations in a transaction. These checks fail before any
-- schema change when the database is not the expected Lab 3 shape.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'tickets'
      AND column_name = 'version'
  ) THEN
    RAISE EXCEPTION 'Issue 23 migration preflight failed: tickets.version already exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "tickets" AS ticket
    LEFT JOIN "users" AS requester ON requester."id" = ticket."requesterId"
    WHERE requester."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Issue 23 migration preflight failed: orphan Ticket requester';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "tickets" AS ticket
    LEFT JOIN "categories" AS category ON category."id" = ticket."categoryId"
    WHERE category."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Issue 23 migration preflight failed: orphan Ticket category';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "tickets" AS ticket
    LEFT JOIN "related_systems" AS related_system
      ON related_system."id" = ticket."relatedSystemId"
    WHERE related_system."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Issue 23 migration preflight failed: orphan Ticket related system';
  END IF;
END $$;

-- Add nullable workflow fields first so every existing row can be backfilled
-- explicitly. No historical Action Taken rows are synthesized.
ALTER TABLE "tickets"
  ADD COLUMN "version" INTEGER,
  ADD COLUMN "resolvedAt" TIMESTAMP(3),
  ADD COLUMN "closedAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "resolutionSummary" TEXT,
  ADD COLUMN "closureSummary" TEXT,
  ADD COLUMN "cancelReason" TEXT,
  ADD COLUMN "reopenReason" TEXT;

UPDATE "tickets"
SET "version" = 1
WHERE "version" IS NULL;

-- These timestamps are migration-boundary evidence for existing workflow
-- state. They are intentionally not represented as fabricated Actions Taken.
UPDATE "tickets"
SET "resolvedAt" = "updatedAt"
WHERE "currentStatus" IN ('RESOLVED', 'CLOSED')
  AND "resolvedAt" IS NULL;

UPDATE "tickets"
SET "closedAt" = "updatedAt"
WHERE "currentStatus" = 'CLOSED'
  AND "closedAt" IS NULL;

UPDATE "tickets"
SET "cancelledAt" = "updatedAt"
WHERE "currentStatus" = 'CANCELLED'
  AND "cancelledAt" IS NULL;

ALTER TABLE "tickets"
  ALTER COLUMN "version" SET DEFAULT 1,
  ALTER COLUMN "version" SET NOT NULL;

CREATE TABLE "actions_taken" (
    "id" BIGSERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "actionAt" TIMESTAMP(3) NOT NULL,
    "actionDescription" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "performedByUserId" INTEGER NOT NULL,
    "followUpRequired" BOOLEAN NOT NULL,
    "followUpNote" TEXT,
    "attachmentNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedByUserId" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "seedKey" VARCHAR(120),

    CONSTRAINT "actions_taken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "actions_taken_seedKey_key"
  ON "actions_taken"("seedKey");
CREATE INDEX "actions_taken_ticketId_actionAt_id_idx"
  ON "actions_taken"("ticketId", "actionAt", "id");
CREATE INDEX "actions_taken_ticketId_followUpRequired_idx"
  ON "actions_taken"("ticketId", "followUpRequired");
CREATE INDEX "actions_taken_performedByUserId_actionAt_idx"
  ON "actions_taken"("performedByUserId", "actionAt");

CREATE INDEX "tickets_assignedToUserId_currentStatus_idx"
  ON "tickets"("assignedToUserId", "currentStatus");
CREATE INDEX "tickets_itPriority_currentStatus_idx"
  ON "tickets"("itPriority", "currentStatus");
CREATE INDEX "tickets_resolvedAt_idx"
  ON "tickets"("resolvedAt");

ALTER TABLE "actions_taken"
  ADD CONSTRAINT "actions_taken_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "tickets"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "actions_taken_performedByUserId_fkey"
  FOREIGN KEY ("performedByUserId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "actions_taken_updatedByUserId_fkey"
  FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
