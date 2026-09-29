-- Issue 2: migrate the Lab 2 requester table in place.
-- Prisma runs PostgreSQL migrations transactionally. The preflight checks are
-- deliberately before the rename so a bad Lab 2 fixture is left untouched.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "tickets" AS ticket
    LEFT JOIN "development_requesters" AS requester
      ON requester."id" = ticket."requesterId"
    WHERE requester."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Issue 2 migration preflight failed: orphan ticket requester';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "attachments" AS attachment
    LEFT JOIN "development_requesters" AS requester
      ON requester."id" = attachment."uploadedByRequesterId"
    WHERE requester."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Issue 2 migration preflight failed: orphan attachment uploader';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "attachments" AS attachment
    LEFT JOIN "development_requesters" AS requester
      ON requester."id" = attachment."removedByRequesterId"
    WHERE attachment."removedByRequesterId" IS NOT NULL
      AND requester."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Issue 2 migration preflight failed: orphan attachment remover';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "tickets" WHERE "requestedPriority" IS NULL
  ) THEN
    RAISE EXCEPTION 'Issue 2 migration preflight failed: null requested priority';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "development_requesters"
    GROUP BY lower(btrim("email"))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Issue 2 migration preflight failed: duplicate normalized email';
  END IF;
END $$;

CREATE TYPE "UserRole" AS ENUM ('REQUESTER', 'IT_STAFF', 'ADMINISTRATOR');

ALTER TABLE "development_requesters" RENAME TO "users";
ALTER TABLE "users" RENAME CONSTRAINT "development_requesters_pkey" TO "users_pkey";
ALTER INDEX "development_requesters_email_key" RENAME TO "users_email_key";
DROP INDEX "development_requesters_isActive_displayName_idx";

-- Normalize only after the duplicate preflight, so the unique index cannot
-- fail halfway through the migration.
UPDATE "users"
SET "email" = lower(btrim("email"));

ALTER TABLE "users"
  ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'REQUESTER',
  ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "lastLoginAt" TIMESTAMP(3);

CREATE INDEX "users_role_isActive_displayName_idx"
  ON "users"("role", "isActive", "displayName");
CREATE INDEX "users_role_isActive_email_idx"
  ON "users"("role", "isActive", "email");

ALTER TABLE "attachments"
  RENAME COLUMN "uploadedByRequesterId" TO "uploadedByUserId";
ALTER TABLE "attachments"
  RENAME COLUMN "removedByRequesterId" TO "removedByUserId";
ALTER TABLE "attachments"
  RENAME CONSTRAINT "attachments_uploadedByRequesterId_fkey"
  TO "attachments_uploadedByUserId_fkey";
ALTER TABLE "attachments"
  RENAME CONSTRAINT "attachments_removedByRequesterId_fkey"
  TO "attachments_removedByUserId_fkey";

ALTER TABLE "tickets"
  ADD COLUMN "assignedToUserId" INTEGER,
  ADD COLUMN "assignedAt" TIMESTAMP(3),
  ADD COLUMN "requesterResolutionIndicatedAt" TIMESTAMP(3),
  ADD COLUMN "requesterResolutionIndicatedByUserId" INTEGER;

ALTER TABLE "tickets" ALTER COLUMN "currentStatus" DROP DEFAULT;
ALTER TYPE "CurrentStatus" RENAME TO "CurrentStatus_old";
CREATE TYPE "CurrentStatus" AS ENUM (
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_REQUESTER',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'CANCELLED'
);
ALTER TABLE "tickets"
  ALTER COLUMN "currentStatus" TYPE "CurrentStatus"
  USING ("currentStatus"::text::"CurrentStatus");
DROP TYPE "CurrentStatus_old";
ALTER TABLE "tickets"
  ALTER COLUMN "currentStatus" SET DEFAULT 'NEW';

-- Existing Lab 2 rows never had an operational priority. Preserve the
-- requested value exactly, then enforce the final non-null model contract.
UPDATE "tickets"
SET "itPriority" = "requestedPriority"::text::"ItPriority";
ALTER TABLE "tickets" ALTER COLUMN "itPriority" SET NOT NULL;

CREATE INDEX "tickets_assignedToUserId_updatedAt_idx"
  ON "tickets"("assignedToUserId", "updatedAt");
CREATE INDEX "tickets_currentStatus_updatedAt_idx"
  ON "tickets"("currentStatus", "updatedAt");
CREATE INDEX "tickets_itPriority_updatedAt_idx"
  ON "tickets"("itPriority", "updatedAt");

ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_assignedToUserId_fkey"
  FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_requesterResolutionIndicatedByUserId_fkey"
  FOREIGN KEY ("requesterResolutionIndicatedByUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "sessions" (
  "id" VARCHAR(128) NOT NULL,
  "userId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),

  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "login_throttle_buckets" (
  "keyHash" VARCHAR(128) NOT NULL,
  "failedCount" INTEGER NOT NULL,
  "firstFailedAt" TIMESTAMP(3) NOT NULL,
  "blockedUntil" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "login_throttle_buckets_pkey" PRIMARY KEY ("keyHash")
);

CREATE TABLE "public_comments" (
  "id" SERIAL NOT NULL,
  "ticketId" INTEGER NOT NULL,
  "authorUserId" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "public_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "internal_notes" (
  "id" SERIAL NOT NULL,
  "ticketId" INTEGER NOT NULL,
  "authorUserId" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "internal_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sessions_userId_revokedAt_expiresAt_idx"
  ON "sessions"("userId", "revokedAt", "expiresAt");
CREATE INDEX "public_comments_ticketId_createdAt_id_idx"
  ON "public_comments"("ticketId", "createdAt", "id");
CREATE INDEX "internal_notes_ticketId_createdAt_id_idx"
  ON "internal_notes"("ticketId", "createdAt", "id");

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public_comments"
  ADD CONSTRAINT "public_comments_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "tickets"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public_comments"
  ADD CONSTRAINT "public_comments_authorUserId_fkey"
  FOREIGN KEY ("authorUserId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "internal_notes"
  ADD CONSTRAINT "internal_notes_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "tickets"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "internal_notes"
  ADD CONSTRAINT "internal_notes_authorUserId_fkey"
  FOREIGN KEY ("authorUserId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- passwordHash is intentionally nullable only during this migration. The
-- seed provisions every existing/new account and applies SET NOT NULL after
-- it has verified that no row remains without an Argon2id hash.
