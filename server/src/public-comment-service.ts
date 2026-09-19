import type { PrismaClient, UserRole } from "@prisma/client";

import { ApiError, validationError } from "./errors.js";

const COMMENT_AUTHOR_SELECT = {
  id: true,
  displayName: true,
  role: true,
} as const;

export interface PublicCommentItem {
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

function serializeComment(comment: {
  id: number;
  ticketId: number;
  content: string;
  createdAt: Date;
  author: { id: number; displayName: string; role: UserRole };
}): PublicCommentItem {
  return {
    id: comment.id,
    ticketId: comment.ticketId,
    content: comment.content,
    author: comment.author,
    createdAt: comment.createdAt.toISOString(),
  };
}

function commentInclude() {
  return {
    author: { select: COMMENT_AUTHOR_SELECT },
  } as const;
}

async function assertCommentAccess(
  prisma: PrismaClient,
  ticketId: number,
  userId: number,
  role: UserRole,
) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, requesterId: true },
  });

  if (ticket === null || (role === "REQUESTER" && ticket.requesterId !== userId)) {
    throw new ApiError(404, "TICKET_NOT_FOUND", "Ticket was not found.");
  }

  return ticket;
}

export function validatePublicCommentBody(body: unknown) {
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
    fields.content = "Comment content must be 1 to 2,000 characters after trimming.";
  }

  if (Object.keys(fields).length > 0) return validationError(fields);
  return { content };
}

export async function listPublicComments(
  prisma: PrismaClient,
  ticketId: number,
  userId: number,
  role: UserRole,
): Promise<PublicCommentItem[]> {
  await assertCommentAccess(prisma, ticketId, userId, role);

  const comments = await prisma.publicComment.findMany({
    where: { ticketId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: commentInclude(),
  });

  return comments.map(serializeComment);
}

export async function createPublicComment(
  prisma: PrismaClient,
  ticketId: number,
  userId: number,
  role: UserRole,
  content: string,
): Promise<PublicCommentItem> {
  await assertCommentAccess(prisma, ticketId, userId, role);

  const comment = await prisma.publicComment.create({
    data: { ticketId, authorUserId: userId, content },
    include: commentInclude(),
  });

  return serializeComment(comment);
}
