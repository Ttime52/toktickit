-- Issue 24: durable Action Taken idempotency records.
-- The row is written in the same transaction as the Action Taken and parent
-- Ticket version update, so a failed mutation cannot leave a replay record.
CREATE TABLE "action_taken_idempotency" (
    "scope" VARCHAR(80) NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "actorUserId" INTEGER NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,
    "actionTakenId" BIGINT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_taken_idempotency_pkey" PRIMARY KEY ("scope", "key")
);

CREATE UNIQUE INDEX "action_taken_idempotency_actionTakenId_key"
  ON "action_taken_idempotency"("actionTakenId");
CREATE INDEX "action_taken_idempotency_actorUserId_scope_idx"
  ON "action_taken_idempotency"("actorUserId", "scope");
CREATE INDEX "action_taken_idempotency_ticketId_idx"
  ON "action_taken_idempotency"("ticketId");

ALTER TABLE "action_taken_idempotency"
  ADD CONSTRAINT "action_taken_idempotency_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "action_taken_idempotency_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "tickets"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "action_taken_idempotency_actionTakenId_fkey"
  FOREIGN KEY ("actionTakenId") REFERENCES "actions_taken"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
