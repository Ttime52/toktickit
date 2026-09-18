import { createHash, createHmac, randomBytes } from "node:crypto";

import argon2 from "argon2";
import type { Prisma, PrismaClient, UserRole } from "@prisma/client";

import { ApiError } from "./errors.js";

export const SESSION_COOKIE_NAME = "toktickit_session";
export const SESSION_IDLE_MS = 8 * 60 * 60 * 1000;
export const LOGIN_THROTTLE_WINDOW_MS = 15 * 60 * 1000;
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export type AuthUserShape = {
  id: number;
  displayName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
};

export type AuthSession = {
  sessionId: string;
  token: string;
  user: AuthUserShape;
};

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

const USER_SHAPE_SELECT = {
  id: true,
  displayName: true,
  email: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
} satisfies Prisma.UserSelect;

// Production deployments should provide AUTH_THROTTLE_SECRET so multiple API
// instances share the same one-way bucket key. A process-scoped fallback keeps
// local development safe without committing a reusable secret.
const PROCESS_THROTTLE_SECRET = randomBytes(32).toString("hex");

function nowPlus(milliseconds: number): Date {
  return new Date(Date.now() + milliseconds);
}

function sessionHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function throttleKey(email: string, ipAddress: string): string {
  const secret = process.env.AUTH_THROTTLE_SECRET || PROCESS_THROTTLE_SECRET;
  return createHmac("sha256", secret)
    .update(`${email}|${ipAddress}`, "utf8")
    .digest("hex");
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

export function passwordPolicyError(value: string): string | null {
  if (value.length < PASSWORD_MIN_LENGTH || value.length > PASSWORD_MAX_LENGTH) {
    return `Password must be ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.`;
  }
  if (!/[A-Z]/u.test(value)) return "Password must contain an uppercase letter.";
  if (!/[a-z]/u.test(value)) return "Password must contain a lowercase letter.";
  if (!/[0-9]/u.test(value)) return "Password must contain a number.";
  if (!/[^A-Za-z0-9]/u.test(value)) return "Password must contain a special character.";
  return null;
}

export function toUserShape(user: {
  id: number;
  displayName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
}): AuthUserShape {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
  };
}

async function isLoginBlocked(
  prisma: PrismaExecutor,
  keyHash: string,
  now = new Date(),
): Promise<boolean> {
  const bucket = await prisma.loginThrottleBucket.findUnique({
    where: { keyHash },
    select: { failedCount: true, blockedUntil: true },
  });
  return bucket !== null && bucket.failedCount >= 5 && bucket.blockedUntil > now;
}

async function recordFailedLogin(
  prisma: PrismaExecutor,
  keyHash: string,
  now = new Date(),
): Promise<boolean> {
  const existing = await prisma.loginThrottleBucket.findUnique({
    where: { keyHash },
  });
  const windowExpired =
    existing === null ||
    now.getTime() - existing.firstFailedAt.getTime() >= LOGIN_THROTTLE_WINDOW_MS;
  const firstFailedAt = windowExpired ? now : existing.firstFailedAt;
  const failedCount = windowExpired ? 1 : existing.failedCount + 1;
  const blockedUntil = new Date(firstFailedAt.getTime() + LOGIN_THROTTLE_WINDOW_MS);

  await prisma.loginThrottleBucket.upsert({
    where: { keyHash },
    update: { failedCount, firstFailedAt, blockedUntil },
    create: { keyHash, failedCount, firstFailedAt, blockedUntil },
  });

  return failedCount >= 5;
}

export async function authenticateUser(
  prisma: PrismaClient,
  emailInput: string,
  password: string,
  ipAddress: string,
): Promise<AuthSession> {
  const email = normalizeEmail(emailInput);
  const keyHash = throttleKey(email, ipAddress);
  const now = new Date();

  if (await isLoginBlocked(prisma, keyHash, now)) {
    throw new ApiError(
      429,
      "AUTHENTICATION_RATE_LIMITED",
      "Too many sign-in attempts. Please try again later.",
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { ...USER_SHAPE_SELECT, passwordHash: true },
  });

  let valid = user !== null && user.isActive;
  if (valid && user !== null) {
    try {
      valid = await argon2.verify(user.passwordHash, password);
    } catch {
      valid = false;
    }
  }

  if (!valid || user === null) {
    const blocked = await recordFailedLogin(prisma, keyHash, now);
    if (blocked) {
      throw new ApiError(
        429,
        "AUTHENTICATION_RATE_LIMITED",
        "Too many sign-in attempts. Please try again later.",
      );
    }
    throw new ApiError(
      401,
      "INVALID_CREDENTIALS",
      "Email or password is incorrect.",
    );
  }

  await prisma.loginThrottleBucket.deleteMany({ where: { keyHash } });

  const token = randomBytes(32).toString("base64url");
  const sessionId = sessionHash(token);
  const expiresAt = nowPlus(SESSION_IDLE_MS);
  const sessionUser = await prisma.$transaction(async (transaction) => {
    const updatedUser = await transaction.user.update({
      where: { id: user.id },
      data: { lastLoginAt: now },
      select: USER_SHAPE_SELECT,
    });
    await transaction.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        createdAt: now,
        lastSeenAt: now,
        expiresAt,
      },
    });
    return updatedUser;
  });

  return { sessionId, token, user: toUserShape(sessionUser) };
}

function readCookie(cookieHeader: string | undefined): string | null {
  if (cookieHeader === undefined) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name !== SESSION_COOKIE_NAME) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return null;
}

export function readSessionToken(cookieHeader: string | undefined): string | null {
  try {
    return readCookie(cookieHeader);
  } catch {
    return null;
  }
}

export async function resolveSession(
  prisma: PrismaClient,
  token: string,
): Promise<{ sessionId: string; user: AuthUserShape } | null> {
  const sessionId = sessionHash(token);
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: { select: USER_SHAPE_SELECT } },
  });
  const now = new Date();

  if (session === null) return null;
  if (session.revokedAt !== null || session.expiresAt <= now || !session.user.isActive) {
    if (session.revokedAt === null) {
      await prisma.session.update({
        where: { id: sessionId },
        data: { revokedAt: now },
      });
    }
    return null;
  }

  await prisma.session.update({
    where: { id: sessionId },
    data: { lastSeenAt: now, expiresAt: nowPlus(SESSION_IDLE_MS) },
  });

  return { sessionId, user: toUserShape(session.user) };
}

export async function revokeSession(
  prisma: PrismaClient,
  sessionId: string,
): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function changePassword(
  prisma: PrismaClient,
  sessionId: string,
  userId: number,
  currentPassword: string,
  newPassword: string,
): Promise<AuthSession> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ...USER_SHAPE_SELECT, passwordHash: true },
  });
  if (user === null || !user.isActive) {
    throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.");
  }

  let currentPasswordMatches = false;
  try {
    currentPasswordMatches = await argon2.verify(user.passwordHash, currentPassword);
  } catch {
    currentPasswordMatches = false;
  }
  if (!currentPasswordMatches) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Current password is incorrect.");
  }

  const policyError = passwordPolicyError(newPassword);
  if (policyError !== null) {
    throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.", {
      newPassword: policyError,
    });
  }
  if (currentPassword === newPassword) {
    throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.", {
      newPassword: "New password must be different from the current password.",
    });
  }

  const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
  const token = randomBytes(32).toString("base64url");
  const newSessionId = sessionHash(token);
  const now = new Date();
  const updatedUser = await prisma.$transaction(async (transaction) => {
    const nextUser = await transaction.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
      select: USER_SHAPE_SELECT,
    });
    await transaction.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
    await transaction.session.create({
      data: {
        id: newSessionId,
        userId,
        createdAt: now,
        lastSeenAt: now,
        expiresAt: nowPlus(SESSION_IDLE_MS),
      },
    });
    return nextUser;
  });

  return { sessionId: newSessionId, token, user: toUserShape(updatedUser) };
}
