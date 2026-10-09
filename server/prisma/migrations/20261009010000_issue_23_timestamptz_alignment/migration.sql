-- Align the Issue 23 temporal columns with the Lab 4 contract.
-- Existing TIMESTAMP(3) values are application UTC values, so AT TIME ZONE
-- preserves their represented instant when moving to TIMESTAMPTZ(3).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = 'actions_taken'
  ) THEN
    RAISE EXCEPTION 'Issue 23 timestamp alignment failed: actions_taken is missing';
  END IF;
END $$;

ALTER TABLE "tickets"
  ALTER COLUMN "resolvedAt" TYPE TIMESTAMPTZ(3)
    USING ("resolvedAt" AT TIME ZONE 'UTC'),
  ALTER COLUMN "closedAt" TYPE TIMESTAMPTZ(3)
    USING ("closedAt" AT TIME ZONE 'UTC'),
  ALTER COLUMN "cancelledAt" TYPE TIMESTAMPTZ(3)
    USING ("cancelledAt" AT TIME ZONE 'UTC');

ALTER TABLE "actions_taken"
  ALTER COLUMN "actionAt" TYPE TIMESTAMPTZ(3)
    USING ("actionAt" AT TIME ZONE 'UTC'),
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3)
    USING ("createdAt" AT TIME ZONE 'UTC'),
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3)
    USING ("updatedAt" AT TIME ZONE 'UTC');
