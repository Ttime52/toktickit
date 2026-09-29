import type { NextFunction, Request, RequestHandler, Response } from "express";

import { ApiError, sendApiError } from "./errors.js";
import {
  readSessionToken,
  resolveSession,
  type AuthUserShape,
} from "./auth-service.js";
import { getPrisma } from "./prisma.js";

export type RequestAuth = {
  sessionId: string;
  user: AuthUserShape;
};

declare global {
  namespace Express {
    interface Request {
      auth?: RequestAuth;
    }
  }
}

export const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = readSessionToken(req.headers.cookie);
  if (token === null) {
    sendApiError(
      res,
      new ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication is required."),
    );
    return;
  }

  void resolveSession(getPrisma(), token)
    .then((session) => {
      if (session === null) {
        sendApiError(
          res,
          new ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication is required."),
        );
        return;
      }
      req.auth = session;
      next();
    })
    .catch((error: unknown) => sendApiError(res, error));
}

export function requirePasswordChangeComplete(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.auth?.user.mustChangePassword === true) {
    sendApiError(
      res,
      new ApiError(
        403,
        "PASSWORD_CHANGE_REQUIRED",
        "Change your password before using the application.",
      ),
    );
    return;
  }
  next();
}

export function requireRoles(...roles: AuthUserShape["role"][]): RequestHandler {
  return (req, res, next) => {
    if (req.auth === undefined) {
      sendApiError(
        res,
        new ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication is required."),
      );
      return;
    }
    if (!roles.includes(req.auth.user.role)) {
      sendApiError(
        res,
        new ApiError(403, "FORBIDDEN", "You are not allowed to perform this action."),
      );
      return;
    }
    next();
  };
}

export function requireSameOrigin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const origin = req.get("Origin");
  if (origin !== CLIENT_ORIGIN) {
    sendApiError(
      res,
      new ApiError(403, "CSRF_ORIGIN_INVALID", "The request origin is not allowed."),
    );
    return;
  }
  next();
}
