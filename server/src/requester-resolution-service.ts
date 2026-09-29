import type { PrismaClient } from "@prisma/client";

import { ApiError } from "./errors.js";
import {
  fullTicketInclude,
  type FullTicketRecord,
} from "./ticket-service.js";

const INDICATION_STATUSES = ["IN_PROGRESS", "WAITING_FOR_REQUESTER"] as const;

function isIndicationStatus(status: string): boolean {
  return (INDICATION_STATUSES as readonly string[]).includes(status);
}

function notFound(): ApiError {
  return new ApiError(404, "TICKET_NOT_FOUND", "Ticket was not found.");
}

export async function recordProblemAppearsResolved(
  prisma: PrismaClient,
  ticketId: number,
  requesterId: number,
): Promise<FullTicketRecord> {
  return prisma.$transaction(async (transaction) => {
    const ticket = await transaction.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        requesterId: true,
        currentStatus: true,
        requesterResolutionIndicatedAt: true,
      },
    });

    if (ticket === null || ticket.requesterId !== requesterId) {
      throw notFound();
    }

    if (ticket.requesterResolutionIndicatedAt !== null) {
      throw new ApiError(
        409,
        "RESOLUTION_INDICATION_ALREADY_RECORDED",
        "A resolution indication has already been recorded for this Ticket.",
      );
    }

    if (!isIndicationStatus(ticket.currentStatus)) {
      throw new ApiError(
        409,
        "RESOLUTION_INDICATION_NOT_ALLOWED",
        "A resolution indication is not available in the current Ticket status.",
      );
    }

    const now = new Date();
    const updated = await transaction.ticket.updateMany({
      where: {
        id: ticketId,
        requesterId,
        requesterResolutionIndicatedAt: null,
        currentStatus: { in: [...INDICATION_STATUSES] },
      },
      data: {
        requesterResolutionIndicatedAt: now,
        requesterResolutionIndicatedByUserId: requesterId,
      },
    });

    if (updated.count !== 1) {
      const current = await transaction.ticket.findUnique({
        where: { id: ticketId },
        select: {
          requesterResolutionIndicatedAt: true,
          currentStatus: true,
          requesterId: true,
        },
      });

      if (current === null || current.requesterId !== requesterId) {
        throw notFound();
      }
      if (current.requesterResolutionIndicatedAt !== null) {
        throw new ApiError(
          409,
          "RESOLUTION_INDICATION_ALREADY_RECORDED",
          "A resolution indication has already been recorded for this Ticket.",
        );
      }
      throw new ApiError(
        409,
        "RESOLUTION_INDICATION_NOT_ALLOWED",
        "A resolution indication is not available in the current Ticket status.",
      );
    }

    const result = await transaction.ticket.findUnique({
      where: { id: ticketId },
      include: fullTicketInclude,
    });

    if (result === null) throw notFound();
    return result;
  });
}
