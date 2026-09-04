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
import {
  type TicketListQuery,
  type TicketSortField,
} from "./ticket-query.js";

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

const ticketListSelect = {
  id: true,
  ticketNumber: true,
  ticketDate: true,
  summary: true,
  category: {
    select: { id: true, name: true },
  },
  relatedSystem: {
    select: { id: true, name: true },
  },
  requestedPriority: true,
  itPriority: true,
  currentStatus: true,
  updatedAt: true,
  attachments: {
    where: {
      removedAt: null,
      availabilityState: "AVAILABLE",
    },
    select: { id: true },
  },
} satisfies Prisma.TicketSelect;

type TicketListRecord = Prisma.TicketGetPayload<{
  select: typeof ticketListSelect;
}>;

export interface TicketListItem {
  id: number;
  ticketNumber: string;
  ticketDate: string;
  summary: string;
  category: { id: number; name: string };
  relatedSystem: { id: number; name: string };
  requestedPriority: RequestedPriority;
  itPriority: FullTicketRecord["itPriority"];
  currentStatus: FullTicketRecord["currentStatus"];
  attachmentCount: number;
  updatedAt: string;
}

export interface TicketListMeta {
  page: number;
  pageSize: TicketListQuery["pageSize"];
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface TicketListResult {
  data: TicketListItem[];
  meta: TicketListMeta;
}

export async function assertActiveRequester(
  prisma: PrismaClient,
  requesterId: number,
) {
  const requester = await prisma.developmentRequester.findUnique({
    where: { id: requesterId },
    select: { id: true, isActive: true },
  });

  if (requester === null || !requester.isActive) {
    throw new ApiError(
      400,
      "REQUESTER_CONTEXT_INVALID",
      "The selected Development Requester is not active.",
      { requesterId: "Select an active Development Requester." },
    );
  }

  return requester;
}

export async function assertOwnedTicket(
  prisma: PrismaClient,
  ticketId: number,
  requesterId: number,
) {
  await assertActiveRequester(prisma, requesterId);

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, requesterId: true },
  });

  if (ticket === null) {
    throw new ApiError(404, "TICKET_NOT_FOUND", "Ticket was not found.");
  }

  if (ticket.requesterId !== requesterId) {
    throw new ApiError(
      403,
      "OWNERSHIP_FORBIDDEN",
      "This Ticket is not available for the selected Requester.",
    );
  }

  return ticket;
}

export async function getOwnedTicket(
  prisma: PrismaClient,
  ticketId: number,
  requesterId: number,
): Promise<FullTicketRecord> {
  await assertOwnedTicket(prisma, ticketId, requesterId);

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: fullTicketInclude,
  });

  if (ticket === null) {
    throw new ApiError(404, "TICKET_NOT_FOUND", "Ticket was not found.");
  }

  return ticket;
}

function serializeTicketListItem(ticket: TicketListRecord): TicketListItem {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    ticketDate: ticket.ticketDate.toISOString(),
    summary: ticket.summary,
    category: ticket.category,
    relatedSystem: ticket.relatedSystem,
    requestedPriority: ticket.requestedPriority,
    itPriority: ticket.itPriority,
    currentStatus: ticket.currentStatus,
    attachmentCount: ticket.attachments.length,
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

const priorityRank: Record<RequestedPriority, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  URGENT: 3,
};

function compareText(left: string, right: string): number {
  const normalizedLeft = left.toLocaleLowerCase("en-US");
  const normalizedRight = right.toLocaleLowerCase("en-US");
  if (normalizedLeft < normalizedRight) return -1;
  if (normalizedLeft > normalizedRight) return 1;
  return 0;
}

function compareTicketListRecords(
  left: TicketListRecord,
  right: TicketListRecord,
  sortBy: TicketSortField,
): number {
  switch (sortBy) {
    case "ticketNumber":
      return compareText(left.ticketNumber, right.ticketNumber);
    case "ticketDate":
      return left.ticketDate.getTime() - right.ticketDate.getTime();
    case "updatedAt":
      return left.updatedAt.getTime() - right.updatedAt.getTime();
    case "requestedPriority":
      return priorityRank[left.requestedPriority] - priorityRank[right.requestedPriority];
    case "currentStatus":
      return compareText(left.currentStatus, right.currentStatus);
    case "category":
      return compareText(left.category.name, right.category.name);
  }
}

function sortTicketListRecords(
  tickets: TicketListRecord[],
  query: TicketListQuery,
): TicketListRecord[] {
  return tickets.sort((left, right) => {
    const primary = compareTicketListRecords(left, right, query.sortBy);
    if (primary === 0) return right.id - left.id;
    return query.sortOrder === "asc" ? primary : -primary;
  });
}

function ownedTicketWhere(query: TicketListQuery): Prisma.TicketWhereInput {
  return {
    requesterId: query.requesterId,
    ...(query.categoryId === null ? {} : { categoryId: query.categoryId }),
    ...(query.relatedSystemId === null
      ? {}
      : { relatedSystemId: query.relatedSystemId }),
    ...(query.requestedPriority === null
      ? {}
      : { requestedPriority: query.requestedPriority }),
    ...(query.currentStatus === null
      ? {}
      : { currentStatus: query.currentStatus }),
    ...(query.search.length === 0
      ? {}
      : {
          OR: [
            {
              ticketNumber: {
                contains: query.search,
                mode: "insensitive",
              },
            },
            {
              summary: {
                contains: query.search,
                mode: "insensitive",
              },
            },
            {
              description: {
                contains: query.search,
                mode: "insensitive",
              },
            },
            {
              category: {
                name: {
                  contains: query.search,
                  mode: "insensitive",
                },
              },
            },
            {
              relatedSystem: {
                name: {
                  contains: query.search,
                  mode: "insensitive",
                },
              },
            },
          ],
        }),
  };
}

export async function listTickets(
  prisma: PrismaClient,
  query: TicketListQuery,
): Promise<TicketListResult> {
  await assertActiveRequester(prisma, query.requesterId);

  const tickets = await prisma.ticket.findMany({
    where: ownedTicketWhere(query),
    select: ticketListSelect,
  });
  const sortedTickets = sortTicketListRecords(tickets, query);
  const totalItems = sortedTickets.length;
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);
  const start = (query.page - 1) * query.pageSize;

  return {
    data: sortedTickets
      .slice(start, start + query.pageSize)
      .map(serializeTicketListItem),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
      hasNextPage: query.page < totalPages,
      hasPreviousPage: query.page > 1 && totalPages > 0,
    },
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
  const replay = await readReplay(prisma, idempotencyKey, input);
  if (replay !== null) return replay;

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
