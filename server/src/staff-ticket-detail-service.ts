import type {
  CurrentStatus,
  ItPriority,
  Prisma,
  PrismaClient,
  RequestedPriority,
  UserRole,
} from "@prisma/client";

import {
  attachmentMetadataSelect,
  serializeAttachmentMetadata,
  type AttachmentMetadataRecord,
} from "./attachments.js";
import { ApiError, validationError } from "./errors.js";
import {
  internalNoteInclude,
  serializeInternalNote,
  type InternalNoteItem,
} from "./internal-note-service.js";
import {
  serializePublicComment,
  type PublicCommentItem,
} from "./public-comment-service.js";
import { REQUESTED_PRIORITIES } from "./ticket-validation.js";
import { TICKET_STATUSES, type TicketStatusValue } from "./ticket-query.js";

const AUTHOR_SELECT = {
  id: true,
  displayName: true,
  role: true,
} as const;

export const STAFF_STATUS_TRANSITIONS: Record<
  TicketStatusValue,
  readonly TicketStatusValue[]
> = {
  NEW: ["OPEN", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "CANCELLED"],
  CANCELLED: ["REOPENED"],
};

const staffTicketDetailInclude = {
  requester: {
    select: { id: true, displayName: true, email: true },
  },
  category: {
    select: { id: true, name: true },
  },
  relatedSystem: {
    select: { id: true, name: true },
  },
  assignedTo: {
    select: { id: true, displayName: true, role: true },
  },
  attachments: {
    orderBy: { id: "asc" },
    select: attachmentMetadataSelect,
  },
  publicComments: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { author: { select: AUTHOR_SELECT } },
  },
  internalNotes: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: internalNoteInclude(),
  },
} satisfies Prisma.TicketInclude;

type StaffTicketDetailRecord = Prisma.TicketGetPayload<{
  include: typeof staffTicketDetailInclude;
}>;

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

export interface StaffOwnerSummary {
  id: number;
  displayName: string;
  role: UserRole;
}

export interface StaffUserOption extends StaffOwnerSummary {}

export interface StaffTicketDetail {
  id: number;
  ticketNumber: string;
  ticketDate: string;
  requester: { id: number; displayName: string; email: string };
  category: { id: number; name: string };
  relatedSystem: { id: number; name: string };
  summary: string;
  requestedPriority: RequestedPriority;
  itPriority: ItPriority;
  description: string;
  currentStatus: CurrentStatus;
  ticketOwner: StaffOwnerSummary | null;
  assignedTo: StaffOwnerSummary | null;
  requesterResolutionIndicatedAt: string | null;
  attachments: Array<ReturnType<typeof serializeAttachmentMetadata>>;
  attachmentCount: number;
  publicComments: PublicCommentItem[];
  internalNotes: InternalNoteItem[];
  createdAt: string;
  updatedAt: string;
}

function ownerSummary(
  owner: StaffTicketDetailRecord["assignedTo"],
): StaffOwnerSummary | null {
  return owner === null
    ? null
    : { id: owner.id, displayName: owner.displayName, role: owner.role };
}

export function serializeStaffTicketDetail(
  ticket: StaffTicketDetailRecord,
): StaffTicketDetail {
  const ticketOwner = ownerSummary(ticket.assignedTo);
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
    ticketOwner,
    assignedTo: ticketOwner,
    requesterResolutionIndicatedAt:
      ticket.requesterResolutionIndicatedAt?.toISOString() ?? null,
    attachments: ticket.attachments.map((attachment) =>
      serializeAttachmentMetadata(
        attachment as AttachmentMetadataRecord,
        ticket.requesterId,
      ),
    ),
    attachmentCount: ticket.attachments.length,
    publicComments: ticket.publicComments.map(serializePublicComment),
    internalNotes: ticket.internalNotes.map(serializeInternalNote),
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

function ticketNotFound(): ApiError {
  return new ApiError(404, "TICKET_NOT_FOUND", "Ticket was not found.");
}

export async function getStaffTicketDetail(
  prisma: PrismaExecutor,
  ticketId: number,
): Promise<StaffTicketDetail> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: staffTicketDetailInclude,
  });
  if (ticket === null) throw ticketNotFound();
  return serializeStaffTicketDetail(ticket);
}

export async function listStaffUserOptions(
  prisma: PrismaClient,
): Promise<StaffUserOption[]> {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: ["IT_STAFF", "ADMINISTRATOR"] },
    },
    select: { id: true, displayName: true, role: true },
  });

  return users.sort((left, right) => {
    const nameOrder = left.displayName.localeCompare(right.displayName, undefined, {
      sensitivity: "base",
    });
    return nameOrder === 0 ? left.id - right.id : nameOrder;
  });
}

export type StaffTicketAction = "claim" | "assign" | "reassign";

export interface StaffTicketUpdateInput {
  action?: StaffTicketAction;
  assignedToUserId?: number;
  itPriority?: ItPriority;
  currentStatus?: TicketStatusValue;
  confirmStatusChange?: boolean;
}

type StaffTicketUpdateResult =
  | { ok: true; value: StaffTicketUpdateInput }
  | { ok: false; error: ApiError };

const UPDATE_FIELDS = new Set([
  "action",
  "assignedToUserId",
  "itPriority",
  "currentStatus",
  "confirmStatusChange",
]);

const OWNER_UPDATE_FIELDS = new Set(["action", "assignedToUserId"]);

function positiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    return null;
  }
  return value;
}

export function validateStaffTicketUpdateBody(
  body: unknown,
  mode: "full" | "owner" = "full",
): StaffTicketUpdateResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return {
      ok: false,
      error: validationError({ body: "A JSON object is required." }),
    };
  }

  const record = body as Record<string, unknown>;
  const allowedFields = mode === "owner" ? OWNER_UPDATE_FIELDS : UPDATE_FIELDS;
  const fields: Record<string, string> = {};
  for (const key of Object.keys(record)) {
    if (!allowedFields.has(key)) fields[key] = "This field is not accepted.";
  }

  const actionValue = record.action;
  let action: StaffTicketAction | undefined;
  if (actionValue !== undefined) {
    if (actionValue !== "claim" && actionValue !== "assign" && actionValue !== "reassign") {
      fields.action = "Action must be claim, assign, or reassign.";
    } else {
      action = actionValue;
    }
  }

  let assignedToUserId: number | undefined;
  if (record.assignedToUserId !== undefined) {
    assignedToUserId = positiveInteger(record.assignedToUserId) ?? undefined;
    if (assignedToUserId === undefined) {
      fields.assignedToUserId = "An active IT Staff or Administrator ID is required.";
    }
  }

  let itPriority: ItPriority | undefined;
  if (record.itPriority !== undefined) {
    if (!REQUESTED_PRIORITIES.includes(record.itPriority as ItPriority)) {
      fields.itPriority = "IT Priority must be LOW, MEDIUM, HIGH, or URGENT.";
    } else {
      itPriority = record.itPriority as ItPriority;
    }
  }

  let currentStatus: TicketStatusValue | undefined;
  if (record.currentStatus !== undefined) {
    if (!TICKET_STATUSES.includes(record.currentStatus as TicketStatusValue)) {
      fields.currentStatus = "Current Status must be a valid Ticket status.";
    } else {
      currentStatus = record.currentStatus as TicketStatusValue;
    }
  }

  let confirmStatusChange: boolean | undefined;
  if (record.confirmStatusChange !== undefined) {
    if (typeof record.confirmStatusChange !== "boolean") {
      fields.confirmStatusChange = "confirmStatusChange must be a boolean.";
    } else {
      confirmStatusChange = record.confirmStatusChange;
    }
  }

  if (action === "claim" && assignedToUserId !== undefined) {
    fields.assignedToUserId = "Claim does not accept an assignee ID.";
  }
  if ((action === "assign" || action === "reassign") && assignedToUserId === undefined) {
    fields.assignedToUserId = "An assignee ID is required for assign or reassign.";
  }
  if (mode === "full" && assignedToUserId !== undefined && action === undefined) {
    fields.action = "Action is required when changing the Ticket Owner.";
  }
  if (mode === "owner" && action === undefined && assignedToUserId === undefined) {
    fields.assignedToUserId = "An assignee ID or claim action is required.";
  }
  if (confirmStatusChange !== undefined && currentStatus === undefined) {
    fields.confirmStatusChange = "A target Current Status is required for confirmation.";
  }

  const hasChange =
    action !== undefined ||
    assignedToUserId !== undefined ||
    itPriority !== undefined ||
    currentStatus !== undefined;
  if (!hasChange) fields.body = "At least one permitted change is required.";

  if (Object.keys(fields).length > 0) {
    return { ok: false, error: validationError(fields) };
  }

  return {
    ok: true,
    value: { action, assignedToUserId, itPriority, currentStatus, confirmStatusChange },
  };
}

function isFormalStatus(status: TicketStatusValue): boolean {
  return status === "RESOLVED" || status === "CLOSED";
}

function isOwnerRole(role: UserRole): boolean {
  return role === "IT_STAFF" || role === "ADMINISTRATOR";
}

export async function updateStaffTicket(
  prisma: PrismaClient,
  ticketId: number,
  actorId: number,
  actorRole: UserRole,
  input: StaffTicketUpdateInput,
): Promise<StaffTicketDetail> {
  return prisma.$transaction(async (transaction) => {
    const ticket = await transaction.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        assignedToUserId: true,
        currentStatus: true,
        itPriority: true,
      },
    });
    if (ticket === null) throw ticketNotFound();

    if (actorRole !== "IT_STAFF" && actorRole !== "ADMINISTRATOR") {
      throw new ApiError(403, "FORBIDDEN", "You are not allowed to update Tickets.");
    }

    if (
      actorRole === "ADMINISTRATOR" &&
      (input.action !== undefined ||
        input.assignedToUserId !== undefined ||
        input.currentStatus !== undefined)
    ) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Administrators may change IT Priority only.",
      );
    }

    let nextOwnerId: number | undefined;
    let ownerChanged = false;
    let effectiveAction = input.action;

    if (input.action === "claim") {
      if (actorRole !== "IT_STAFF") {
        throw new ApiError(403, "FORBIDDEN", "Only IT Staff may claim Tickets.");
      }
      if (ticket.assignedToUserId !== null) {
        throw new ApiError(
          409,
          "TICKET_ALREADY_ASSIGNED",
          "Only an unassigned Ticket can be claimed.",
        );
      }
      nextOwnerId = actorId;
      ownerChanged = true;
    } else if (input.assignedToUserId !== undefined) {
      if (actorRole !== "IT_STAFF") {
        throw new ApiError(403, "FORBIDDEN", "Only IT Staff may assign Ticket owners.");
      }

      if (effectiveAction === undefined) {
        effectiveAction = ticket.assignedToUserId === null ? "assign" : "reassign";
      }
      if (effectiveAction === "assign" && ticket.assignedToUserId !== null) {
        throw new ApiError(
          409,
          "TICKET_ALREADY_ASSIGNED",
          "Use reassign when the Ticket already has an owner.",
        );
      }
      if (effectiveAction === "reassign" && ticket.assignedToUserId === null) {
        throw new ApiError(
          409,
          "TICKET_UNASSIGNED",
          "Use assign when the Ticket has no owner.",
        );
      }
      if (ticket.assignedToUserId === input.assignedToUserId) {
        throw new ApiError(409, "OWNER_UNCHANGED", "The Ticket already has this owner.");
      }

      const owner = await transaction.user.findUnique({
        where: { id: input.assignedToUserId },
        select: { id: true, isActive: true, role: true },
      });
      if (owner === null || !owner.isActive || !isOwnerRole(owner.role)) {
        throw new ApiError(
          409,
          "INVALID_TICKET_OWNER",
          "The Ticket owner must be an active IT Staff or Administrator User.",
        );
      }
      nextOwnerId = owner.id;
      ownerChanged = true;
    }

    const statusChanged =
      input.currentStatus !== undefined && input.currentStatus !== ticket.currentStatus;
    if (input.currentStatus !== undefined && statusChanged) {
      if (actorRole !== "IT_STAFF") {
        throw new ApiError(403, "FORBIDDEN", "Only IT Staff may change Ticket status.");
      }
      if (!STAFF_STATUS_TRANSITIONS[ticket.currentStatus].includes(input.currentStatus)) {
        throw new ApiError(
          409,
          "INVALID_STATUS_TRANSITION",
          `The Ticket cannot move from ${ticket.currentStatus} to ${input.currentStatus}.`,
        );
      }
      if (isFormalStatus(input.currentStatus) && input.confirmStatusChange !== true) {
        throw new ApiError(
          400,
          "STATUS_CONFIRMATION_REQUIRED",
          "Explicit confirmation is required for Resolved or Closed.",
          { confirmStatusChange: "Set confirmStatusChange to true." },
        );
      }
    }

    const priorityChanged =
      input.itPriority !== undefined && input.itPriority !== ticket.itPriority;
    if (input.itPriority !== undefined && actorRole !== "IT_STAFF" && actorRole !== "ADMINISTRATOR") {
      throw new ApiError(403, "FORBIDDEN", "You are not allowed to change IT Priority.");
    }

    if (!ownerChanged && !statusChanged && !priorityChanged) {
      throw new ApiError(409, "NO_OPERATION", "The requested Ticket changes are already applied.");
    }

    const data: Prisma.TicketUncheckedUpdateInput = {};
    if (ownerChanged && nextOwnerId !== undefined) {
      data.assignedToUserId = nextOwnerId;
      data.assignedAt = new Date();
    }
    if (priorityChanged && input.itPriority !== undefined) {
      data.itPriority = input.itPriority;
    }
    if (statusChanged && input.currentStatus !== undefined) {
      data.currentStatus = input.currentStatus;
      if (input.currentStatus === "IN_PROGRESS" || input.currentStatus === "REOPENED") {
        data.requesterResolutionIndicatedAt = null;
        data.requesterResolutionIndicatedByUserId = null;
      }
    }

    await transaction.ticket.update({ where: { id: ticketId }, data });
    const updated = await transaction.ticket.findUnique({
      where: { id: ticketId },
      include: staffTicketDetailInclude,
    });
    if (updated === null) throw ticketNotFound();
    return serializeStaffTicketDetail(updated);
  });
}
