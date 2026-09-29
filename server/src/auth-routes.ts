import type { Request, Response, Router } from "express";
import express from "express";

import { ApiError, sendApiError, validationError } from "./errors.js";
import {
  authenticateUser,
  changePassword,
  isValidEmail,
  normalizeEmail,
  passwordPolicyError,
  revokeSession,
  SESSION_COOKIE_NAME,
  type AuthSession,
} from "./auth-service.js";
import {
  requireAuth,
  requireSameOrigin,
} from "./auth-middleware.js";
import { getPrisma } from "./prisma.js";

const router: Router = express.Router();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function remoteAddress(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function cookieSecure(req: Request): boolean {
  return req.secure || process.env.COOKIE_SECURE === "true";
}

function setSessionCookie(res: Response, req: Request, session: AuthSession) {
  res.cookie(SESSION_COOKIE_NAME, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(req),
    path: "/",
    maxAge: 8 * 60 * 60 * 1000,
  });
}

function clearSessionCookie(res: Response, req: Request) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(req),
    path: "/",
  });
}

router.post("/login", requireSameOrigin, async (req, res) => {
  const body = req.body;
  if (!isRecord(body)) {
    sendApiError(res, validationError({ body: "A JSON object is required." }));
    return;
  }

  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  const password = typeof body.password === "string" ? body.password : "";
  const fields: Record<string, string> = {};
  if (!isValidEmail(email)) fields.email = "Enter a valid email address.";
  if (password.length === 0) fields.password = "Password is required.";
  if (Object.keys(fields).length > 0) {
    sendApiError(res, validationError(fields));
    return;
  }

  try {
    const session = await authenticateUser(
      getPrisma(),
      email,
      password,
      remoteAddress(req),
    );
    setSessionCookie(res, req, session);
    res.status(200).json({ data: { user: session.user } });
  } catch (error) {
    sendApiError(res, error);
  }
});

router.post("/logout", requireSameOrigin, requireAuth, async (req, res) => {
  try {
    await revokeSession(getPrisma(), req.auth!.sessionId);
    clearSessionCookie(res, req);
    res.status(204).send();
  } catch (error) {
    sendApiError(res, error);
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.status(200).json({ data: { user: req.auth!.user } });
});

router.post(
  "/change-password",
  requireSameOrigin,
  requireAuth,
  async (req, res) => {
    const body = req.body;
    if (!isRecord(body)) {
      sendApiError(res, validationError({ body: "A JSON object is required." }));
      return;
    }

    const currentPassword =
      typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword =
      typeof body.newPassword === "string" ? body.newPassword : "";
    const fields: Record<string, string> = {};
    if (currentPassword.length === 0) fields.currentPassword = "Current password is required.";
    if (newPassword.length === 0) {
      fields.newPassword = "New password is required.";
    } else {
      const policyError = passwordPolicyError(newPassword);
      if (policyError !== null) fields.newPassword = policyError;
    }
    if (Object.keys(fields).length > 0) {
      sendApiError(res, validationError(fields));
      return;
    }

    try {
      const session = await changePassword(
        getPrisma(),
        req.auth!.sessionId,
        req.auth!.user.id,
        currentPassword,
        newPassword,
      );
      setSessionCookie(res, req, session);
      res.status(200).json({ data: { user: session.user } });
    } catch (error) {
      sendApiError(res, error);
    }
  },
);

export default router;
