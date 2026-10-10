import { createHash } from "node:crypto";

import type { Prisma, PrismaClient, UserRole } from "@prisma/client";

import { ApiError, validationError } from "./errors.js";

const ACTION_ACTOR_SELECT = {
  id: true,
  displayName: true,
  role: true,
} as const;

const ACTION_INCLUDE = {
  performedBy: { select: ACTION_ACTOR_SELECT },
  updatedBy: { select: ACTION_ACTOR_SELECT },
} as const satisfies Prisma.ActionTakenInclude;

const ACTION_MUTATION_INCLUDE = {
  ...ACTION_INCLUDE,
  ticket: {
    select: {
      id: true,
      requesterId: true,
      version: true,
    },
  },
} as const satisfies Prisma.ActionTakenInclude;

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;
type ActionRecord = Prisma.ActionTakenGetPayload<{
  include: typeof ACTION_INCLUDE;
}>;
type ActionMutationRecord = Prisma.ActionTakenGetPayload<{
  include: typeof ACTION_MUTATION_INCLUDE;
}>;

const CREATE_FIELDS = new Set([
  "actionAt",
  "actionDescription",
  "result",
  "followUpRequired",
  "followUpNote",
  "attachmentNotes",
]);

const UPDATE_FIELDS = new Set([...CREATE_FIELDS, "expectedTicketVersion"]);

const ACTION_LIST_PAGE_SIZES = new Set([10, 20, 50, 100]);
const MAX_FUTURE_ACTION_TIME_MS = 5 * 60 * 1000;
const ACTION_TAKEN_CREATE_SCOPE = "actions-taken:create";

export interface ActionTakenInput {
  actionAt: Date;
  actionDescription: string;
  result: string;
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
}

export interface ActionTakenPatch extends ActionTakenInput {
  expectedTicketVersion: number;
}

export interface ActionTakenListQuery {
  page: number;
  pageSize: 10 | 20 | 50 | 100;
}

export interface ActionTakenItem {
  id: number;
  ticketId: number;
  actionAt: string;
  actionDescription: string;
  result: string;
  performedBy: {
    id: number;
    displayName: string;
    role: UserRole;
  };
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: {
    id: number;
    displayName: string;
    role: UserRole;
  } | null;
  version: number;
  etag: string;
}

export interface ActionTakenListResult {
  data: ActionTakenItem[];
  meta: {
    page: number;
    pageSize: ActionTakenListQuery["pageSize"];
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    ticketVersion: number;
  };
}

export interface ActionTakenMutationResult {
  action: ActionTakenItem;
  ticketVersion: number;
  idempotentReplay?: boolean;
}

export interface ActionTakenPreconditions {
  actionVersion: number;
  ticketVersion: number;
}

export interface CreateActionTakenOptions {
  ticketVersion: number;
  idempotencyKey: string;
}

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ApiError };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function codePointLength(value: string): number {
  return [...value].length;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function actionIdAsNumber(id: bigint): number {
  const numberId = Number(id);
  return Number.isSafeInteger(numberId) ? numberId : Number.MAX_SAFE_INTEGER;
}

function actionEtag(id: bigint, version: number): string {
  return `"action-taken-${actionIdAsNumber(id)}-v${version}"`;
}

function ticketNotFound(): ApiError {
  return new ApiError(404, "TICKET_NOT_FOUND", "Ticket was not found.");
}

function actionNotFound(): ApiError {
  return new ApiError(404, "ACTION_NOT_FOUND", "Action Taken was not found.");
}

function assertWritableRole(role: UserRole): void {
  if (role !== "IT_STAFF" && role !== "ADMINISTRATOR") {
    throw new ApiError(
      403,
      "FORBIDDEN",
      "You are not allowed to modify Actions Taken.",
    );
  }
}

function normalizeActionAt(value: unknown, fields: Record<string, string>): Date | null {
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/u.test(value)) {
    fields.actionAt = "Action Date/Time must be an ISO 8601 timestamp with an explicit UTC offset.";
    return null;
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    fields.actionAt = "Action Date/Time must be a valid timestamp.";
    return null;
  }

  if (timestamp > Date.now() + MAX_FUTURE_ACTION_TIME_MS) {
    fields.actionAt = "Action Date/Time cannot be more than five minutes in the future.";
    return null;
  }

  return new Date(timestamp);
}

function normalizeRequiredText(
  value: unknown,
  field: "actionDescription" | "result",
  label: string,
  fields: Record<string, string>,
): string {
  if (typeof value !== "string") {
    fields[field] = `${label} is required.`;
    return "";
  }

  const normalized = value.trim();
  if (codePointLength(normalized) < 1 || codePointLength(normalized) > 2000) {
    fields[field] = `${label} must be 1 to 2,000 characters after trimming.`;
  }
  return normalized;
}

function normalizeOptionalText(
  value: unknown,
  field: "followUpNote" | "attachmentNotes",
  label: string,
  maxLength: number,
  fields: Record<string, string>,
): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    fields[field] = `${label} must be text or null.`;
    return null;
  }

  const normalized = value.trim();
  if (codePointLength(normalized) > maxLength) {
    fields[field] = `${label} must be at most ${maxLength} characters after trimming.`;
  }
  return normalized.length === 0 ? null : normalized;
}

function validateActionBodyKeys(
  body: unknown,
  allowedFields: Set<string>,
): { record: Record<string, unknown>; fields: Record<string, string> } | ApiError {
  if (!isRecord(body)) return validationError({ body: "A JSON object is required." });

  const fields: Record<string, string> = {};
  for (const key of Object.keys(body)) {
    if (!allowedFields.has(key)) fields[key] = "This field is not accepted.";
  }
  return { record: body, fields };
}

function validateFollowUp(
  followUpRequired: unknown,
  followUpNote: unknown,
  fields: Record<string, string>,
): { followUpRequired: boolean; followUpNote: string | null } {
  if (typeof followUpRequired !== "boolean") {
    fields.followUpRequired = "Follow-Up Required? must be a boolean.";
  }

  const required = followUpRequired === true;
  const note = normalizeOptionalText(
    followUpNote,
    "followUpNote",
    "Follow-up Note",
    1000,
    fields,
  );

  if (required && (note === null || note.length === 0)) {
    fields.followUpNote = "A follow-up note is required when follow-up is required.";
  }
  if (!required && note !== null) {
    fields.followUpNote = "Follow-up Note must be empty when follow-up is not required.";
  }

  return { followUpRequired: required, followUpNote: required ? note : null };
}

export function validateCreateActionTakenBody(body: unknown): ValidationResult<ActionTakenInput> {
  const checked = validateActionBodyKeys(body, CREATE_FIELDS);
  if (checked instanceof ApiError) return { ok: false, error: checked };

  const { record, fields } = checked;
  const actionAt = normalizeActionAt(record.actionAt, fields);
  const actionDescription = normalizeRequiredText(
    record.actionDescription,
    "actionDescription",
    "Action Description",
    fields,
  );
  const result = normalizeRequiredText(record.result, "result", "Result", fields);
  const followUp = validateFollowUp(
    record.followUpRequired,
    record.followUpNote,
    fields,
  );
  const attachmentNotes = normalizeOptionalText(
    record.attachmentNotes,
    "attachmentNotes",
    "Attachment Notes",
    1000,
    fields,
  );

  if (Object.keys(fields).length > 0 || actionAt === null) {
    return { ok: false, error: validationError(fields) };
  }

  return {
    ok: true,
    value: {
      actionAt,
      actionDescription,
      result,
      followUpRequired: followUp.followUpRequired,
      followUpNote: followUp.followUpNote,
      attachmentNotes,
    },
  };
}

export function validateUpdateActionTakenBody(
  body: unknown,
  existing: {
    actionDateTime: Date;
    description: string;
    result: string;
    followUpRequired: boolean;
    followUpNote: string | null;
    attachmentNotes: string | null;
  },
): ValidationResult<ActionTakenPatch> {
  const checked = validateActionBodyKeys(body, UPDATE_FIELDS);
  if (checked instanceof ApiError) return { ok: false, error: checked };

  const { record, fields } = checked;
  if (!Object.keys(record).some((key) => CREATE_FIELDS.has(key))) {
    fields.body = "At least one editable Action Taken field is required.";
  }

  const actionAt = normalizeActionAt(
    record.actionAt === undefined
      ? existing.actionDateTime.toISOString()
      : record.actionAt,
    fields,
  );
  const actionDescription = normalizeRequiredText(
    record.actionDescription === undefined ? existing.description : record.actionDescription,
    "actionDescription",
    "Action Description",
    fields,
  );
  const result = normalizeRequiredText(
    record.result === undefined ? existing.result : record.result,
    "result",
    "Result",
    fields,
  );

  const nextFollowUpRequired =
    record.followUpRequired === undefined
      ? existing.followUpRequired
      : record.followUpRequired;
  const followUpNoteValue =
    record.followUpRequired === false && record.followUpNote === undefined
      ? null
      : record.followUpNote === undefined
        ? existing.followUpNote
        : record.followUpNote;
  const followUp = validateFollowUp(
    nextFollowUpRequired,
    followUpNoteValue,
    fields,
  );
  const attachmentNotes = normalizeOptionalText(
    record.attachmentNotes === undefined
      ? existing.attachmentNotes
      : record.attachmentNotes,
    "attachmentNotes",
    "Attachment Notes",
    1000,
    fields,
  );

  let expectedTicketVersion = 0;
  if (!positiveInteger(record.expectedTicketVersion)) {
    fields.expectedTicketVersion = "expectedTicketVersion must be a positive integer.";
  } else {
    expectedTicketVersion = record.expectedTicketVersion;
  }

  if (Object.keys(fields).length > 0 || actionAt === null) {
    return { ok: false, error: validationError(fields) };
  }

  return {
    ok: true,
    value: {
      actionAt,
      actionDescription,
      result,
      followUpRequired: followUp.followUpRequired,
      followUpNote: followUp.followUpNote,
      attachmentNotes,
      expectedTicketVersion,
    },
  };
}

export function parseActionTakenListQuery(
  query: Record<string, unknown>,
): ValidationResult<ActionTakenListQuery> {
  const fields: Record<string, string> = {};
  for (const key of Object.keys(query)) {
    if (key !== "page" && key !== "pageSize") {
      fields[key] = "This query parameter is not accepted.";
    }
  }

  let page = 1;
  if (query.page !== undefined) {
    if (typeof query.page !== "string" || !/^[1-9]\d*$/u.test(query.page)) {
      fields.page = "page must be a positive integer.";
    } else {
      page = Number(query.page);
      if (!Number.isSafeInteger(page)) fields.page = "page must be a positive integer.";
    }
  }

  let pageSize: ActionTakenListQuery["pageSize"] = 20;
  if (query.pageSize !== undefined) {
    if (typeof query.pageSize !== "string" || !/^[1-9]\d*$/u.test(query.pageSize)) {
      fields.pageSize = "pageSize must be one of 10, 20, 50, or 100.";
    } else {
      const parsed = Number(query.pageSize);
      if (!ACTION_LIST_PAGE_SIZES.has(parsed)) {
        fields.pageSize = "pageSize must be one of 10, 20, 50, or 100.";
      } else {
        pageSize = parsed as ActionTakenListQuery["pageSize"];
      }
    }
  }

  if (Object.keys(fields).length > 0) {
    return { ok: false, error: validationError(fields) };
  }
  return { ok: true, value: { page, pageSize } };
}

function serializeActionTaken(action: ActionRecord): ActionTakenItem {
  return {
    id: actionIdAsNumber(action.id),
    ticketId: action.ticketId,
    actionAt: action.actionDateTime.toISOString(),
    actionDescription: action.description,
    result: action.result,
    performedBy: action.performedBy,
    followUpRequired: action.followUpRequired,
    followUpNote: action.followUpNote,
    attachmentNotes: action.attachmentNotes,
    createdAt: action.createdAt.toISOString(),
    updatedAt: action.updatedAt.toISOString(),
    updatedBy: action.updatedBy,
    version: action.version,
    etag: actionEtag(action.id, action.version),
  };
}

async function getAccessibleTicket(
  prisma: PrismaExecutor,
  ticketId: number,
  userId: number,
  role: UserRole,
) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, requesterId: true, version: true },
  });

  if (ticket === null || (role === "REQUESTER" && ticket.requesterId !== userId)) {
    throw ticketNotFound();
  }
  return ticket;
}

export async function getActionTakenForUpdate(
  prisma: PrismaClient,
  actionId: bigint,
  expectedTicketId?: number,
): Promise<ActionMutationRecord> {
  const action = await prisma.actionTaken.findUnique({
    where: { id: actionId },
    include: ACTION_MUTATION_INCLUDE,
  });
  if (action === null) throw actionNotFound();
  if (expectedTicketId !== undefined && action.ticketId !== expectedTicketId) {
    throw actionNotFound();
  }
  return action;
}

export async function listActionTaken(
  prisma: PrismaClient,
  ticketId: number,
  userId: number,
  role: UserRole,
  query: ActionTakenListQuery,
): Promise<ActionTakenListResult> {
  const ticket = await getAccessibleTicket(prisma, ticketId, userId, role);
  const where = { ticketId };
  const [totalItems, actions] = await Promise.all([
    prisma.actionTaken.count({ where }),
    prisma.actionTaken.findMany({
      where,
      orderBy: [{ actionDateTime: "asc" }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: ACTION_INCLUDE,
    }),
  ]);

  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);
  return {
    data: actions.map(serializeActionTaken),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
      hasNextPage: query.page < totalPages,
      hasPreviousPage: query.page > 1 && totalPages > 0,
      ticketVersion: ticket.version,
    },
  };
}

function normalizedPayload(input: ActionTakenInput): string {
  return JSON.stringify({
    actionAt: input.actionAt.toISOString(),
    actionDescription: input.actionDescription,
    result: input.result,
    followUpRequired: input.followUpRequired,
    followUpNote: input.followUpNote,
    attachmentNotes: input.attachmentNotes,
  });
}

function normalizedPayloadHash(input: ActionTakenInput): string {
  return createHash("sha256").update(normalizedPayload(input), "utf8").digest("hex");
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function idempotencyConflict(): ApiError {
  return new ApiError(
    409,
    "IDEMPOTENCY_KEY_REUSED",
    "The Idempotency-Key was already used with different request data.",
  );
}

async function readIdempotentReplay(
  prisma: PrismaExecutor,
  key: string,
  actorId: number,
  ticketId: number,
  input: ActionTakenInput,
): Promise<ActionTakenMutationResult | null> {
  const entry = await prisma.actionTakenIdempotency.findUnique({
    where: {
      scope_key: {
        scope: ACTION_TAKEN_CREATE_SCOPE,
        key,
      },
    },
    include: {
      actionTaken: { include: ACTION_INCLUDE },
    },
  });
  if (entry === null) return null;

  if (
    entry.actorId !== actorId ||
    entry.ticketId !== ticketId ||
    entry.payloadHash !== normalizedPayloadHash(input)
  ) {
    throw idempotencyConflict();
  }

  return {
    action: serializeActionTaken(entry.actionTaken),
    ticketVersion: entry.ticketVersion,
    idempotentReplay: true,
  };
}

export async function createActionTaken(
  prisma: PrismaClient,
  ticketId: number,
  actorId: number,
  role: UserRole,
  input: ActionTakenInput,
  options: CreateActionTakenOptions,
): Promise<ActionTakenMutationResult> {
  assertWritableRole(role);

  const replay = await readIdempotentReplay(
    prisma,
    options.idempotencyKey,
    actorId,
    ticketId,
    input,
  );
  if (replay !== null) return replay;

  let result: ActionTakenMutationResult;
  try {
    result = await prisma.$transaction(async (transaction): Promise<ActionTakenMutationResult> => {
      const transactionReplay = await readIdempotentReplay(
        transaction,
        options.idempotencyKey,
        actorId,
        ticketId,
        input,
      );
      if (transactionReplay !== null) return transactionReplay;

      const ticket = await getAccessibleTicket(transaction, ticketId, actorId, role);
      if (options.ticketVersion !== ticket.version) {
        throw new ApiError(
          412,
          "STALE_WRITE",
          "The Ticket changed. Reload it before saving again.",
        );
      }

      const action = await transaction.actionTaken.create({
        data: {
          ticketId,
          actionDateTime: input.actionAt,
          description: input.actionDescription,
          result: input.result,
          performedById: actorId,
          followUpRequired: input.followUpRequired,
          followUpNote: input.followUpNote,
          attachmentNotes: input.attachmentNotes,
        },
        include: ACTION_INCLUDE,
      });

      const parentUpdate = await transaction.ticket.updateMany({
        where: { id: ticketId, version: options.ticketVersion },
        data: { version: { increment: 1 } },
      });
      if (parentUpdate.count !== 1) {
        throw new ApiError(
          412,
          "STALE_WRITE",
          "The Ticket changed. Reload it before saving again.",
        );
      }

      await transaction.actionTakenIdempotency.create({
        data: {
          scope: ACTION_TAKEN_CREATE_SCOPE,
          key: options.idempotencyKey,
          actorId,
          ticketId,
          payloadHash: normalizedPayloadHash(input),
          actionId: action.id,
          ticketVersion: options.ticketVersion + 1,
        },
      });

      return {
        action: serializeActionTaken(action),
        ticketVersion: options.ticketVersion + 1,
        idempotentReplay: false,
      };
    });
  } catch (error) {
    if (isUniqueConstraintError(error) || error instanceof ApiError) {
      const concurrentReplay = await readIdempotentReplay(
        prisma,
        options.idempotencyKey,
        actorId,
        ticketId,
        input,
      );
      if (concurrentReplay !== null) return concurrentReplay;
    }
    throw error;
  }

  return result;
}

export async function updateActionTaken(
  prisma: PrismaClient,
  actionId: bigint,
  actorId: number,
  role: UserRole,
  input: ActionTakenPatch,
  options: ActionTakenPreconditions,
  expectedTicketId?: number,
): Promise<ActionTakenMutationResult> {
  assertWritableRole(role);

  const result = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.actionTaken.findUnique({
      where: { id: actionId },
      include: ACTION_MUTATION_INCLUDE,
    });
    if (existing === null) throw actionNotFound();
    if (expectedTicketId !== undefined && existing.ticketId !== expectedTicketId) {
      throw actionNotFound();
    }

    const expectedActionVersion = options.actionVersion;
    const expectedTicketVersion = options.ticketVersion;
    if (
      expectedActionVersion !== existing.version ||
      expectedTicketVersion !== existing.ticket.version ||
      input.expectedTicketVersion !== expectedTicketVersion
    ) {
      throw new ApiError(
        412,
        "STALE_WRITE",
        "The Action Taken or parent Ticket changed. Reload before saving again.",
      );
    }

    const updatedAction = await transaction.actionTaken.updateMany({
      where: { id: actionId, version: expectedActionVersion },
      data: {
        actionDateTime: input.actionAt,
        description: input.actionDescription,
        result: input.result,
        followUpRequired: input.followUpRequired,
        followUpNote: input.followUpNote,
        attachmentNotes: input.attachmentNotes,
        updatedById: actorId,
        version: { increment: 1 },
      },
    });
    if (updatedAction.count !== 1) {
      throw new ApiError(
        412,
        "STALE_WRITE",
        "The Action Taken changed. Reload it before saving again.",
      );
    }

    const updatedTicket = await transaction.ticket.updateMany({
      where: { id: existing.ticketId, version: expectedTicketVersion },
      data: { version: { increment: 1 } },
    });
    if (updatedTicket.count !== 1) {
      throw new ApiError(
        412,
        "STALE_WRITE",
        "The Ticket changed. Reload it before saving again.",
      );
    }

    const action = await transaction.actionTaken.findUnique({
      where: { id: actionId },
      include: ACTION_INCLUDE,
    });
    if (action === null) throw actionNotFound();
    return { action, ticketVersion: expectedTicketVersion + 1 };
  });

  return {
    action: serializeActionTaken(result.action),
    ticketVersion: result.ticketVersion,
  };
}
