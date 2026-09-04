import type { PrismaClient } from "@prisma/client";

import {
  attachmentMetadataSelect,
  readStoredAttachment,
  removeStoredAttachment,
  serializeAttachmentMetadata,
  type AttachmentMetadataRecord,
} from "./attachments.js";
import { ApiError } from "./errors.js";
import { assertOwnedTicket } from "./ticket-service.js";

export interface OwnedAttachment {
  attachment: AttachmentMetadataRecord;
  requesterId: number;
}

function attachmentNotFound(): ApiError {
  return new ApiError(404, "ATTACHMENT_NOT_FOUND", "Attachment was not found.");
}

export async function listOwnedAttachments(
  prisma: PrismaClient,
  ticketId: number,
  requesterId: number,
) {
  await assertOwnedTicket(prisma, ticketId, requesterId);
  const attachments = await prisma.attachment.findMany({
    where: { ticketId },
    orderBy: { id: "asc" },
    select: attachmentMetadataSelect,
  });

  return attachments.map((attachment) =>
    serializeAttachmentMetadata(attachment, requesterId),
  );
}

export async function getOwnedAttachment(
  prisma: PrismaClient,
  ticketId: number,
  attachmentId: number,
  requesterId: number,
): Promise<OwnedAttachment> {
  await assertOwnedTicket(prisma, ticketId, requesterId);

  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: attachmentMetadataSelect,
  });

  if (attachment === null || attachment.ticketId !== ticketId) {
    throw attachmentNotFound();
  }

  return { attachment, requesterId };
}

export async function downloadOwnedAttachment(
  prisma: PrismaClient,
  ticketId: number,
  attachmentId: number,
  requesterId: number,
) {
  const { attachment } = await getOwnedAttachment(
    prisma,
    ticketId,
    attachmentId,
    requesterId,
  );

  if (
    attachment.removedAt !== null ||
    attachment.availabilityState === "UNAVAILABLE"
  ) {
    throw new ApiError(
      410,
      "ATTACHMENT_NOT_AVAILABLE",
      "This Attachment is no longer available for download.",
    );
  }

  try {
    const bytes = await readStoredAttachment(attachment.storageKey);
    return { attachment, bytes };
  } catch {
    try {
      await prisma.attachment.updateMany({
        where: { id: attachment.id, removedAt: null },
        data: {
          availabilityState: "UNAVAILABLE",
          unavailableAt: new Date(),
          unavailableReason: "Attachment bytes are unavailable.",
        },
      });
    } catch {
      // Keep the outward error safe even if recording the unavailable state fails.
    }

    throw new ApiError(
      503,
      "STORAGE_UNAVAILABLE",
      "Attachment storage is unavailable.",
    );
  }
}

function normalizeRemovalReason(reason: unknown): string {
  if (typeof reason !== "string") {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Removal reason must be 3 to 200 characters.",
      { reason: "Enter a removal reason from 3 to 200 characters." },
    );
  }

  const trimmed = reason.trim();
  if (trimmed.length < 3 || trimmed.length > 200) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Removal reason must be 3 to 200 characters.",
      { reason: "Enter a removal reason from 3 to 200 characters." },
    );
  }

  return trimmed;
}

export async function softRemoveOwnedAttachment(
  prisma: PrismaClient,
  ticketId: number,
  attachmentId: number,
  requesterId: number,
  reason: unknown,
) {
  const { attachment } = await getOwnedAttachment(
    prisma,
    ticketId,
    attachmentId,
    requesterId,
  );
  const normalizedReason = normalizeRemovalReason(reason);

  if (attachment.removedAt !== null) {
    throw new ApiError(
      409,
      "ATTACHMENT_ALREADY_REMOVED",
      "This Attachment has already been removed.",
    );
  }

  const removed = await prisma.attachment.update({
    where: { id: attachmentId },
    data: {
      removedAt: new Date(),
      removedByRequesterId: requesterId,
      removalReason: normalizedReason,
    },
    select: attachmentMetadataSelect,
  });

  try {
    await removeStoredAttachment(attachment.storageKey);
  } catch {
    // The row is already soft-removed, so the bytes are inaccessible even if
    // physical cleanup must be retried by infrastructure later.
    throw new ApiError(
      503,
      "STORAGE_UNAVAILABLE",
      "Attachment storage cleanup is unavailable.",
    );
  }

  return serializeAttachmentMetadata(removed, requesterId);
}
