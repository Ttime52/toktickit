import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

import {
  allocateTicketNumber,
  formatTicketNumber,
  TicketNumberExhaustedError,
} from "../../src/ticket-number.js";

function fakeTransaction(nextValue: number) {
  return {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([{ nextValue }]),
    ticketNumberCounter: {
      update: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as Prisma.TransactionClient;
}

describe("Issue 4 Ticket Number allocation (UNIT-01)", () => {
  it("formats a six-digit number using the UTC year", () => {
    expect(formatTicketNumber(2026, 1)).toBe("TT-2026-000001");
    expect(formatTicketNumber(2026, 999999)).toBe("TT-2026-999999");
  });

  it("locks the yearly counter, starts at one, and advances it", async () => {
    const transaction = fakeTransaction(1);
    const ticketNumber = await allocateTicketNumber(
      transaction,
      new Date("2026-12-31T23:59:59.999Z"),
    );

    expect(ticketNumber).toBe("TT-2026-000001");
    expect(transaction.$queryRaw).toHaveBeenCalledOnce();
    expect(transaction.ticketNumberCounter.update).toHaveBeenCalledWith({
      where: { year: 2026 },
      data: { nextValue: 2 },
    });
  });

  it("maps the exhausted boundary to a domain error", async () => {
    await expect(
      allocateTicketNumber(
        fakeTransaction(1_000_000),
        new Date("2026-01-01T00:00:00.000Z"),
      ),
    ).rejects.toBeInstanceOf(TicketNumberExhaustedError);
  });
});
