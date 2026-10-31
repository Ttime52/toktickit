-- Preserve the parent Ticket version returned by the original idempotent create.
ALTER TABLE "action_taken_idempotency"
  ADD COLUMN "ticketVersion" INTEGER;

UPDATE "action_taken_idempotency" AS records
SET "ticketVersion" = tickets."version"
FROM "tickets" AS tickets
WHERE tickets."id" = records."ticketId";

ALTER TABLE "action_taken_idempotency"
  ALTER COLUMN "ticketVersion" SET NOT NULL;
