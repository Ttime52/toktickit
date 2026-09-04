import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";

import {
  MAX_ACTIVE_ATTACHMENTS,
  parseSingleMultipartFile,
  removeStoredAttachment,
  serializeAttachmentMetadata,
  storeAttachmentBytes,
  validateAttachmentFile,
} from "./attachments.js";
import { ApiError, sendApiError } from "./errors.js";
import { getPrisma } from "./prisma.js";
import { createTicket, serializeTicket } from "./ticket-service.js";
import {
  normalizeCreateTicketInput,
  validateIdempotencyKey,
} from "./ticket-validation.js";

// The Express app is exported separately from app.listen() (see index.ts) so
// Supertest can import `app` without opening a port.
export const app = express();

app.use(cors());
app.use(express.json());

function hasValidActiveQuery(req: Request): boolean {
  const active = req.query.active;
  return active === undefined || (typeof active === "string" && active === "true");
}

function invalidActiveQuery(res: Response) {
  res.status(400).json({
    error: {
      code: "INVALID_QUERY_PARAMETER",
      message: "The active query parameter must be true.",
    },
  });
}

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value !== "string" || !/^[1-9]\d*$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

// ---------------------------------------------------------------------------
// Lab 1 health check
// ---------------------------------------------------------------------------
app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", service: "TokTickIT API" });
});

// ---------------------------------------------------------------------------
// Issue 3 - Development Requester selector
// ---------------------------------------------------------------------------
async function listActiveDevelopmentRequesters(req: Request, res: Response) {
  if (!hasValidActiveQuery(req)) {
    invalidActiveQuery(res);
    return;
  }

  try {
    const requesters = await getPrisma().developmentRequester.findMany({
      where: { isActive: true },
      select: { id: true, displayName: true, email: true },
      orderBy: { id: "asc" },
    });

    res.status(200).json(requesters);
  } catch {
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to load Development Requesters.",
      },
    });
  }
}

app.get("/api/development-requesters", listActiveDevelopmentRequesters);
app.get("/api/requesters", listActiveDevelopmentRequesters);

// ---------------------------------------------------------------------------
// Issue 4 - active reference data
// ---------------------------------------------------------------------------
app.get("/api/categories", async (req: Request, res: Response) => {
  if (!hasValidActiveQuery(req)) {
    invalidActiveQuery(res);
    return;
  }

  try {
    const categories = await getPrisma().category.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });

    res.status(200).json(categories);
  } catch {
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to load Categories.",
      },
    });
  }
});

app.get("/api/related-systems", async (req: Request, res: Response) => {
  if (!hasValidActiveQuery(req)) {
    invalidActiveQuery(res);
    return;
  }

  try {
    const relatedSystems = await getPrisma().relatedSystem.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });

    res.status(200).json(relatedSystems);
  } catch {
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to load Related Systems.",
      },
    });
  }
});

// ---------------------------------------------------------------------------
// Issue 4 - Ticket creation
// ---------------------------------------------------------------------------
app.post("/api/tickets", async (req: Request, res: Response) => {
  const idempotencyKey = validateIdempotencyKey(req.get("Idempotency-Key"));
  if (idempotencyKey === null) {
    sendApiError(
      res,
      new ApiError(
        400,
        "VALIDATION_ERROR",
        "Request validation failed.",
        { idempotencyKey: "A valid 16 to 64 character ASCII key is required." },
      ),
    );
    return;
  }

  const normalized = normalizeCreateTicketInput(req.body);
  if (!normalized.ok) {
    sendApiError(res, normalized.error);
    return;
  }

  try {
    const result = await createTicket(
      getPrisma(),
      normalized.value,
      idempotencyKey,
    );

    res.status(result.idempotentReplay ? 200 : 201).json({
      data: serializeTicket(result.ticket),
      meta: { idempotentReplay: result.idempotentReplay },
    });
  } catch (error) {
    sendApiError(res, error);
  }
});

// ---------------------------------------------------------------------------
// Issue 4 - Attachment upload after a Ticket exists
// ---------------------------------------------------------------------------
app.post(
  "/api/tickets/:ticketId/attachments",
  async (req: Request, res: Response) => {
    const ticketId = parsePositiveInteger(req.params.ticketId);
    const requesterId = parsePositiveInteger(req.query.requesterId);

    if (ticketId === null || requesterId === null) {
      sendApiError(
        res,
        new ApiError(
          400,
          "VALIDATION_ERROR",
          "Ticket ID and requesterId must be positive integers.",
          {
            ...(ticketId === null ? { ticketId: "A positive integer is required." } : {}),
            ...(requesterId === null
              ? { requesterId: "A positive integer is required." }
              : {}),
          },
        ),
      );
      return;
    }

    try {
      const prisma = getPrisma();
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { id: true, requesterId: true },
      });

      if (ticket === null) {
        sendApiError(
          res,
          new ApiError(404, "TICKET_NOT_FOUND", "Ticket was not found."),
        );
        return;
      }

      if (ticket.requesterId !== requesterId) {
        sendApiError(
          res,
          new ApiError(
            403,
            "OWNERSHIP_FORBIDDEN",
            "This Ticket is not available for the selected Requester.",
          ),
        );
        return;
      }

      const upload = await parseSingleMultipartFile(req);
      const validation = validateAttachmentFile(upload);
      if (!validation.ok) {
        sendApiError(res, validation.error);
        return;
      }

      const activeAttachmentCount = await prisma.attachment.count({
        where: {
          ticketId,
          removedAt: null,
          availabilityState: "AVAILABLE",
        },
      });
      if (activeAttachmentCount >= MAX_ACTIVE_ATTACHMENTS) {
        sendApiError(
          res,
          new ApiError(
            409,
            "ATTACHMENT_LIMIT_REACHED",
            "A Ticket may have at most five active Attachments.",
          ),
        );
        return;
      }

      let storageKey: string | null = null;
      try {
        storageKey = await storeAttachmentBytes(validation.value.bytes);
      } catch {
        sendApiError(
          res,
          new ApiError(
            503,
            "STORAGE_UNAVAILABLE",
            "Attachment storage is unavailable.",
          ),
        );
        return;
      }

      try {
        const attachment = await prisma.attachment.create({
          data: {
            ticketId,
            uploadedByRequesterId: requesterId,
            originalFilename: validation.value.originalFilename,
            storageKey,
            mimeType: validation.value.mimeType,
            sizeBytes: validation.value.sizeBytes,
          },
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
        });

        res.status(201).json({
          data: serializeAttachmentMetadata(attachment, requesterId),
        });
      } catch (error) {
        if (storageKey !== null) {
          try {
            await removeStoredAttachment(storageKey);
          } catch {
            sendApiError(
              res,
              new ApiError(
                503,
                "STORAGE_UNAVAILABLE",
                "The Attachment could not be saved safely.",
              ),
            );
            return;
          }
        }

        if (error instanceof ApiError) {
          sendApiError(res, error);
        } else {
          sendApiError(
            res,
            new ApiError(
              500,
              "INTERNAL_ERROR",
              "Unable to save the Attachment.",
            ),
          );
        }
      }
    } catch (error) {
      sendApiError(res, error);
    }
  },
);

// Express JSON parsing errors must use the same safe JSON error shape as the
// rest of the API instead of returning an HTML stack-trace page.
app.use(
  (
    error: unknown,
    _req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    const parseError = error as { type?: string; status?: number };
    if (parseError.type === "entity.parse.failed" || parseError.status === 400) {
      sendApiError(
        res,
        new ApiError(400, "VALIDATION_ERROR", "Malformed JSON request body."),
      );
      return;
    }

    sendApiError(res, error);
  },
);

export default app;
