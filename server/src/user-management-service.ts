import argon2 from "argon2";
import type { Prisma, PrismaClient, UserRole } from "@prisma/client";

import { ApiError, validationError } from "./errors.js";
import {
  isValidEmail,
  normalizeEmail,
  passwordPolicyError,
  toUserShape,
  type AuthUserShape,
} from "./auth-service.js";

export const USER_ROLES = [
  "REQUESTER",
  "IT_STAFF",
  "ADMINISTRATOR",
] as const;

export type ManagedUserRole = (typeof USER_ROLES)[number];

const USER_SELECT = {
  id: true,
  displayName: true,
  email: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

type UserRecord = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;
type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

export interface ManagedUser extends AuthUserShape {
  createdAt: string;
  updatedAt: string;
}

export interface CreateManagedUserInput {
  displayName: string;
  email: string;
  role: ManagedUserRole;
  isActive: boolean;
  initialPassword: string;
}

export interface UpdateManagedUserInput {
  displayName?: string;
  email?: string;
  role?: ManagedUserRole;
  isActive?: boolean;
}

export interface ResetManagedUserPasswordInput {
  initialPassword: string;
}

export interface UserListQuery {
  search: string;
  role: ManagedUserRole | null;
}

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ApiError };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isManagedRole(value: unknown): value is ManagedUserRole {
  return typeof value === "string" && USER_ROLES.includes(value as ManagedUserRole);
}

function isOwnerRole(role: UserRole): boolean {
  return role === "IT_STAFF" || role === "ADMINISTRATOR";
}

function duplicateEmailError(): ApiError {
  return new ApiError(
    409,
    "EMAIL_ALREADY_EXISTS",
    "A User with this email already exists.",
  );
}

function userNotFoundError(): ApiError {
  return new ApiError(404, "USER_NOT_FOUND", "User was not found.");
}

function administratorSafetyError(): ApiError {
  return new ApiError(
    409,
    "ADMINISTRATOR_SAFETY_CONFLICT",
    "The change would leave the system without an active Administrator.",
  );
}

function ticketOwnerSafetyError(): ApiError {
  return new ApiError(
    409,
    "TICKET_OWNER_SAFETY_CONFLICT",
    "Reassign this User's owned Tickets before deactivation or role change.",
  );
}

function serializeManagedUser(user: UserRecord): ManagedUser {
  return {
    ...toUserShape(user),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function validateInitialPassword(
  value: unknown,
  fields: Record<string, string>,
): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    fields.initialPassword = "Initial password is required.";
    return undefined;
  }
  const policyError = passwordPolicyError(value);
  if (policyError !== null) fields.initialPassword = policyError;
  return value;
}

export function validateCreateManagedUserBody(
  body: unknown,
): ValidationResult<CreateManagedUserInput> {
  if (!isRecord(body)) {
    return { ok: false, error: validationError({ body: "A JSON object is required." }) };
  }

  const fields: Record<string, string> = {};
  const allowed = new Set([
    "displayName",
    "email",
    "role",
    "isActive",
    "initialPassword",
  ]);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) fields[key] = "This field is not accepted.";
  }

  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  if (displayName.length < 2 || displayName.length > 120) {
    fields.displayName = "Display name must be 2 to 120 characters after trimming.";
  }

  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  if (!isValidEmail(email)) fields.email = "Enter a valid email address.";

  if (!isManagedRole(body.role)) {
    fields.role = "Role must be REQUESTER, IT_STAFF, or ADMINISTRATOR.";
  }

  if (typeof body.isActive !== "boolean") {
    fields.isActive = "isActive must be explicitly true or false.";
  }

  const initialPassword = validateInitialPassword(body.initialPassword, fields);

  if (Object.keys(fields).length > 0) return { ok: false, error: validationError(fields) };

  return {
    ok: true,
    value: {
      displayName,
      email,
      role: body.role as ManagedUserRole,
      isActive: body.isActive as boolean,
      initialPassword: initialPassword as string,
    },
  };
}

export function validateUpdateManagedUserBody(
  body: unknown,
): ValidationResult<UpdateManagedUserInput> {
  if (!isRecord(body)) {
    return { ok: false, error: validationError({ body: "A JSON object is required." }) };
  }

  const fields: Record<string, string> = {};
  const allowed = new Set(["displayName", "email", "role", "isActive"]);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) fields[key] = "This field is not accepted.";
  }
  if (Object.keys(body).length === 0) fields.body = "At least one User field is required.";

  let displayName: string | undefined;
  if (hasOwn(body, "displayName")) {
    displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    if (displayName.length < 2 || displayName.length > 120) {
      fields.displayName = "Display name must be 2 to 120 characters after trimming.";
    }
  }

  let email: string | undefined;
  if (hasOwn(body, "email")) {
    email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
    if (!isValidEmail(email)) fields.email = "Enter a valid email address.";
  }

  let role: ManagedUserRole | undefined;
  if (hasOwn(body, "role")) {
    if (!isManagedRole(body.role)) {
      fields.role = "Role must be REQUESTER, IT_STAFF, or ADMINISTRATOR.";
    } else {
      role = body.role;
    }
  }

  let isActive: boolean | undefined;
  if (hasOwn(body, "isActive")) {
    if (typeof body.isActive !== "boolean") {
      fields.isActive = "isActive must be true or false.";
    } else {
      isActive = body.isActive;
    }
  }

  if (Object.keys(fields).length > 0) return { ok: false, error: validationError(fields) };
  return { ok: true, value: { displayName, email, role, isActive } };
}

export function validateResetManagedUserPasswordBody(
  body: unknown,
): ValidationResult<ResetManagedUserPasswordInput> {
  if (!isRecord(body)) {
    return { ok: false, error: validationError({ body: "A JSON object is required." }) };
  }

  const fields: Record<string, string> = {};
  if (!hasOwn(body, "initialPassword")) {
    fields.initialPassword = "Initial password is required.";
  }
  for (const key of Object.keys(body)) {
    if (key !== "initialPassword") fields[key] = "This field is not accepted.";
  }
  const initialPassword = validateInitialPassword(body.initialPassword, fields);
  if (Object.keys(fields).length > 0) return { ok: false, error: validationError(fields) };
  return { ok: true, value: { initialPassword: initialPassword as string } };
}

export function parseUserListQuery(
  query: Record<string, unknown>,
): ValidationResult<UserListQuery> {
  const fields: Record<string, string> = {};
  for (const key of Object.keys(query)) {
    if (key !== "search" && key !== "role") {
      fields[key] = `Unknown query parameter: ${key}.`;
    }
  }

  const rawSearch = query.search;
  if (rawSearch !== undefined && typeof rawSearch !== "string") {
    fields.search = "search must be a single text value.";
  }
  const search = typeof rawSearch === "string" ? rawSearch.trim() : "";
  if (search.length > 100) fields.search = "search must be at most 100 characters.";

  const rawRole = query.role;
  let role: ManagedUserRole | null = null;
  if (rawRole !== undefined) {
    if (!isManagedRole(rawRole)) fields.role = "role must be a valid User role.";
    else role = rawRole;
  }

  if (Object.keys(fields).length > 0) {
    return { ok: false, error: validationError(fields, "Invalid User query.") };
  }
  return { ok: true, value: { search, role } };
}

export async function listManagedUsers(
  prisma: PrismaClient,
  query: UserListQuery,
): Promise<ManagedUser[]> {
  const where: Prisma.UserWhereInput = {};
  if (query.role !== null) where.role = query.role;
  if (query.search.length > 0) {
    where.OR = [
      { displayName: { contains: query.search, mode: "insensitive" } },
      { email: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: [{ displayName: "asc" }, { id: "asc" }],
    select: USER_SELECT,
  });
  return users.map(serializeManagedUser);
}

function isUniqueEmailError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export async function createManagedUser(
  prisma: PrismaClient,
  input: CreateManagedUserInput,
): Promise<ManagedUser> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing !== null) throw duplicateEmailError();

  const passwordHash = await argon2.hash(input.initialPassword, {
    type: argon2.argon2id,
  });
  try {
    const user = await prisma.user.create({
      data: {
        displayName: input.displayName,
        email: input.email,
        role: input.role,
        isActive: input.isActive,
        passwordHash,
        mustChangePassword: true,
      },
      select: USER_SELECT,
    });
    return serializeManagedUser(user);
  } catch (error) {
    if (isUniqueEmailError(error)) throw duplicateEmailError();
    throw error;
  }
}

export async function updateManagedUser(
  prisma: PrismaClient,
  userId: number,
  actorId: number,
  input: UpdateManagedUserInput,
): Promise<ManagedUser> {
  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.user.findUnique({
      where: { id: userId },
      select: {
        ...USER_SELECT,
        passwordHash: false,
      },
    });
    if (existing === null) throw userNotFoundError();

    const nextRole = input.role ?? existing.role;
    const nextIsActive = input.isActive ?? existing.isActive;

    if (actorId === userId && existing.isActive && !nextIsActive) {
      throw administratorSafetyError();
    }

    const ownedTicketCount = await transaction.ticket.count({
      where: { assignedToUserId: userId },
    });
    if ((!nextIsActive || !isOwnerRole(nextRole)) && ownedTicketCount > 0) {
      throw ticketOwnerSafetyError();
    }

    const removesActiveAdministrator =
      existing.role === "ADMINISTRATOR" &&
      existing.isActive &&
      (nextRole !== "ADMINISTRATOR" || !nextIsActive);
    if (removesActiveAdministrator) {
      const activeAdministrators = await transaction.user.count({
        where: { role: "ADMINISTRATOR", isActive: true },
      });
      if (activeAdministrators <= 1) throw administratorSafetyError();
    }

    const data: Prisma.UserUpdateInput = {};
    if (input.displayName !== undefined) data.displayName = input.displayName;
    if (input.email !== undefined) data.email = input.email;
    if (input.role !== undefined) data.role = input.role;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    if (input.email !== undefined && input.email !== existing.email) {
      const duplicate = await transaction.user.findUnique({
        where: { email: input.email },
        select: { id: true },
      });
      if (duplicate !== null && duplicate.id !== userId) throw duplicateEmailError();
    }

    let updated: UserRecord;
    try {
      updated = await transaction.user.update({
        where: { id: userId },
        data,
        select: USER_SELECT,
      });
    } catch (error) {
      if (isUniqueEmailError(error)) throw duplicateEmailError();
      throw error;
    }

    if (existing.isActive && !nextIsActive) {
      await transaction.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return serializeManagedUser(updated);
  });
}

export async function resetManagedUserPassword(
  prisma: PrismaClient,
  userId: number,
  input: ResetManagedUserPasswordInput,
): Promise<ManagedUser> {
  const passwordHash = await argon2.hash(input.initialPassword, {
    type: argon2.argon2id,
  });

  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (existing === null) throw userNotFoundError();

    const updated = await transaction.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: true },
      select: USER_SELECT,
    });
    await transaction.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return serializeManagedUser(updated);
  });
}
