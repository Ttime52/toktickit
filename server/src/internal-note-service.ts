import type { PrismaClient, UserRole } from "@prisma/client";

import { ApiError, validationError } from "./errors.js";

const NOTE_AUTHOR_SELECT = {
  id: true,
  displayName: true,
  role: true,
} as const;

export interface InternalNoteItem {
  id: number;
  ticketId: number;
  content: string;
  author: {
    id: number;
    displayName: string;
    role: UserRole;
  };
  createdAt: string;
}

export function serializeInternalNote(note: {
  id: number;
  ticketId: number;
  content: string;
  createdAt: Date;
  author: { id: number; displayName: string; role: UserRole };
}): InternalNoteItem {
  return {
    id: note.id,
    ticketId: note.ticketId,
    content: note.content,
    author: note.author,
    createdAt: note.createdAt.toISOString(),
  };
}

export function internalNoteInclude() {
  return {
    author: { select: NOTE_AUTHOR_SELECT },
  } as const;
}

function ticketNotFound(): ApiError {
  return new ApiError(404, "TICKET_NOT_FOUND", "Ticket was not found.");
}

async function assertNoteTicketAccess(
  prisma: PrismaClient,
  ticketId: number,
  role: UserRole,
) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true },
  });

  if (ticket === null) throw ticketNotFound();
  if (role !== "IT_STAFF" && role !== "ADMINISTRATOR") {
    throw new ApiError(
      403,
      "FORBIDDEN",
      "You are not allowed to access Internal Notes.",
    );
  }
  return ticket;
}

export function validateInternalNoteBody(body: unknown) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return validationError({ body: "A JSON object is required." });
  }

  const record = body as Record<string, unknown>;
  const fields: Record<string, string> = {};
  for (const key of Object.keys(record)) {
    if (key !== "content") fields[key] = "This field is not accepted.";
  }

  const content = typeof record.content === "string" ? record.content.trim() : "";
  if (content.length < 1 || content.length > 2000) {
    fields.content = "Internal Note content must be 1 to 2,000 characters after trimming.";
  }

  if (Object.keys(fields).length > 0) return validationError(fields);
  return { content };
}

export async function listInternalNotes(
  prisma: PrismaClient,
  ticketId: number,
  role: UserRole,
): Promise<InternalNoteItem[]> {
  await assertNoteTicketAccess(prisma, ticketId, role);

  const notes = await prisma.internalNote.findMany({
    where: { ticketId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: internalNoteInclude(),
  });

  return notes.map(serializeInternalNote);
}

export async function createInternalNote(
  prisma: PrismaClient,
  ticketId: number,
  userId: number,
  role: UserRole,
  content: string,
): Promise<InternalNoteItem> {
  await assertNoteTicketAccess(prisma, ticketId, role);
  if (role !== "IT_STAFF") {
    throw new ApiError(
      403,
      "FORBIDDEN",
      "You are not allowed to post Internal Notes.",
    );
  }

  const note = await prisma.internalNote.create({
    data: { ticketId, authorUserId: userId, content },
    include: internalNoteInclude(),
  });

  return serializeInternalNote(note);
}
