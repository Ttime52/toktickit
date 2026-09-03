import type {
  Prisma,
  PrismaClient,
  RequestedPriority,
} from "@prisma/client";

import { ApiError } from "./errors.js";
import {
  serializeAttachmentMetadata,
  type AttachmentMetadataRecord,
} from "./attachments.js";
import { allocateTicketNumber, TicketNumberExhaustedError } from "./ticket-number.js";
import {
  normalizedPayloadKey,
  type NormalizedCreateTicketInput,
} from "./ticket-validation.js";

export const fullTicketInclude = {
  requester: {
    select: { id: true, displayName: true, email: true },
  },
  category: {
    select: { id: true, name: true },
  },
  relatedSystem: {
    select: { id: true, name: true },
  },
  attachments: {
    orderBy: { id: "asc" },
    select: {
      id: true,
      ticketId: true,
      originalFilename: true,
      storageKey: true,
      mimeType: true,
      sizeBytes: true,
      uploadedAt: true,
      availabilityState: true,
      unavailableAt: true,
      unavailableReason: true,
      removedAt: true,
      removalReason: true,
    },
  },
} satisfies Prisma.TicketInclude;

export type FullTicketRecord = Prisma.TicketGetPayload<{
  include: typeof fullTicketInclude;
}>;

export function serializeTicket(ticket: FullTicketRecord) {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    ticketDate: ticket.ticketDate.toISOString(),
    requester: ticket.requester,
    category: ticket.category,
    relatedSystem: ticket.relatedSystem,
    summary: ticket.summary,
    requestedPriority: ticket.requestedPriority,
    itPriority: ticket.itPriority,
    description: ticket.description,
    currentStatus: ticket.currentStatus,
    attachments: ticket.attachments.map((attachment) =>
      serializeAttachmentMetadata(
        attachment as AttachmentMetadataRecord,
        ticket.requesterId,
      ),
    ),
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

export interface CreateTicketResult {
  ticket: FullTicketRecord;
  idempotentReplay: boolean;
}

function isEquivalentTicket(
  ticket: FullTicketRecord,
  input: NormalizedCreateTicketInput,
): boolean {
  return (
    normalizedPayloadKey({
      requesterId: ticket.requesterId,
      categoryId: ticket.categoryId,
      relatedSystemId: ticket.relatedSystemId,
      summary: ticket.summary,
      requestedPriority: ticket.requestedPriority,
      description: ticket.description,
    }) === normalizedPayloadKey(input)
  );
}

function isIdempotencyUniqueError(error: unknown): boolean {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    error.code !== "P2002"
  ) {
    return false;
  }

  const meta = "meta" in error ? error.meta : undefined;
  const target =
    typeof meta === "object" && meta !== null && "target" in meta
      ? meta.target
      : undefined;
  return Array.isArray(target)
    ? target.some((value) => String(value).includes("idempotencyKey"))
    : String(target ?? "").includes("idempotencyKey");
}

async function readReplay(
  prisma: PrismaClient,
  idempotencyKey: string,
  input: NormalizedCreateTicketInput,
): Promise<CreateTicketResult | null> {
  const existing = await prisma.ticket.findUnique({
    where: { idempotencyKey },
    include: fullTicketInclude,
  });
  if (existing === null) return null;

  if (!isEquivalentTicket(existing, input)) {
    throw new ApiError(
      409,
      "IDEMPOTENCY_KEY_REUSED",
      "The Idempotency-Key was already used with different ticket data.",
    );
  }

  return { ticket: existing, idempotentReplay: true };
}

export async function createTicket(
  prisma: PrismaClient,
  input: NormalizedCreateTicketInput,
  idempotencyKey: string,
): Promise<CreateTicketResult> {
  const [requester, category, relatedSystem] = await Promise.all([
    prisma.developmentRequester.findUnique({
      where: { id: input.requesterId },
      select: { id: true, displayName: true, email: true, isActive: true },
    }),
    prisma.category.findUnique({
      where: { id: input.categoryId },
      select: { id: true, name: true, isActive: true },
    }),
    prisma.relatedSystem.findUnique({
      where: { id: input.relatedSystemId },
      select: { id: true, name: true, isActive: true },
    }),
  ]);

  if (requester === null || !requester.isActive) {
    throw new ApiError(
      400,
      "REQUESTER_CONTEXT_INVALID",
      "The selected Development Requester is not active.",
      { requesterId: "Select an active Development Requester." },
    );
  }

  const referenceFields: Record<string, string> = {};
  if (category === null || !category.isActive) {
    referenceFields.categoryId = "Select an active Category.";
  }
  if (relatedSystem === null || !relatedSystem.isActive) {
    referenceFields.relatedSystemId = "Select an active Related System.";
  }
  if (Object.keys(referenceFields).length > 0) {
    throw new ApiError(
      400,
      "INVALID_REFERENCE",
      "One or more selected reference values are not active.",
      referenceFields,
    );
  }

  try {
    return await prisma.$transaction(async (transaction) => {
      const existing = await transaction.ticket.findUnique({
        where: { idempotencyKey },
        include: fullTicketInclude,
      });

      if (existing !== null) {
        if (!isEquivalentTicket(existing, input)) {
          throw new ApiError(
            409,
            "IDEMPOTENCY_KEY_REUSED",
            "The Idempotency-Key was already used with different ticket data.",
          );
        }
        return { ticket: existing, idempotentReplay: true };
      }

      const ticketDate = new Date();
      const ticketNumber = await allocateTicketNumber(transaction, ticketDate);

      const ticket = await transaction.ticket.create({
        data: {
          ticketNumber,
          ticketDate,
          requesterId: input.requesterId,
          categoryId: input.categoryId,
          relatedSystemId: input.relatedSystemId,
          summary: input.summary,
          description: input.description,
          requestedPriority: input.requestedPriority as RequestedPriority,
          currentStatus: "NEW",
          idempotencyKey,
        },
        include: fullTicketInclude,
      });

      return { ticket, idempotentReplay: false };
    });
  } catch (error) {
    if (error instanceof TicketNumberExhaustedError) {
      throw new ApiError(
        409,
        "TICKET_NUMBER_EXHAUSTED",
        "Ticket numbers are exhausted for the current year.",
      );
    }

    if (error instanceof ApiError) throw error;

    if (isIdempotencyUniqueError(error)) {
      const replay = await readReplay(prisma, idempotencyKey, input);
      if (replay !== null) return replay;
    }

    throw error;
  }
}
