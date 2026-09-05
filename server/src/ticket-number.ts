import type { Prisma } from "@prisma/client";

export const MAX_TICKET_SEQUENCE = 999_999;

export class TicketNumberExhaustedError extends Error {
  constructor(year: number) {
    super(`Ticket number sequence exhausted for ${year}.`);
    this.name = "TicketNumberExhaustedError";
  }
}

export function formatTicketNumber(year: number, sequence: number): string {
  if (
    !Number.isInteger(year) ||
    year < 1 ||
    !Number.isInteger(sequence) ||
    sequence < 1 ||
    sequence > MAX_TICKET_SEQUENCE
  ) {
    throw new TicketNumberExhaustedError(year);
  }

  return `TT-${String(year).padStart(4, "0")}-${String(sequence).padStart(
    6,
    "0",
  )}`;
}

/**
 * Allocate the next number while the caller's Prisma transaction is open.
 * The counter row is inserted once per UTC year and locked with FOR UPDATE
 * before its value is consumed.
 */
export async function allocateTicketNumber(
  transaction: Prisma.TransactionClient,
  ticketDate: Date,
): Promise<string> {
  const year = ticketDate.getUTCFullYear();

  await transaction.$executeRaw`
    INSERT INTO "ticket_number_counters" ("year", "nextValue")
    VALUES (${year}, 1)
    ON CONFLICT ("year") DO NOTHING
  `;

  const rows = await transaction.$queryRaw<Array<{ nextValue: number }>>`
    SELECT "nextValue"
    FROM "ticket_number_counters"
    WHERE "year" = ${year}
    FOR UPDATE
  `;

  const counter = rows[0];
  if (counter === undefined || counter.nextValue > MAX_TICKET_SEQUENCE) {
    throw new TicketNumberExhaustedError(year);
  }

  const sequence = counter.nextValue;
  await transaction.ticketNumberCounter.update({
    where: { year },
    data: { nextValue: sequence + 1 },
  });

  return formatTicketNumber(year, sequence);
}
