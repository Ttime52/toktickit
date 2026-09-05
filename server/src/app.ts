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
import {
  downloadOwnedAttachment,
  getOwnedAttachment,
  listOwnedAttachments,
  softRemoveOwnedAttachment,
} from "./attachment-service.js";
import { ApiError, sendApiError } from "./errors.js";
import { getPrisma } from "./prisma.js";
import {
  assertOwnedTicket,
  createTicket,
  getOwnedTicket,
  listTickets,
  serializeTicket,
} from "./ticket-service.js";
import { parseTicketListQuery } from "./ticket-query.js";
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

type TicketScope = { ticketId: number; requesterId: number };
type AttachmentScope = TicketScope & { attachmentId: number };

function parseTicketScope(req: Request, res: Response): TicketScope | null {
  const ticketId = parsePositiveInteger(req.params.ticketId);
  const requesterId = parsePositiveInteger(req.query.requesterId);
  const fields: Record<string, string> = {};

  if (ticketId === null) fields.ticketId = "A positive integer is required.";
  if (requesterId === null) fields.requesterId = "A positive integer is required.";

  if (Object.keys(fields).length > 0) {
    sendApiError(
      res,
      new ApiError(
        400,
        "VALIDATION_ERROR",
        "Ticket ID and requesterId must be positive integers.",
        fields,
      ),
    );
    return null;
  }

  return { ticketId: ticketId as number, requesterId: requesterId as number };
}

function parseAttachmentScope(
  req: Request,
  res: Response,
): AttachmentScope | null {
  const ticketId = parsePositiveInteger(req.params.ticketId);
  const attachmentId = parsePositiveInteger(req.params.attachmentId);
  const requesterId = parsePositiveInteger(req.query.requesterId);
  const fields: Record<string, string> = {};

  if (ticketId === null) fields.ticketId = "A positive integer is required.";
  if (attachmentId === null) fields.attachmentId = "A positive integer is required.";
  if (requesterId === null) fields.requesterId = "A positive integer is required.";

  if (Object.keys(fields).length > 0) {
    sendApiError(
      res,
      new ApiError(
        400,
        "VALIDATION_ERROR",
        "Ticket ID, Attachment ID, and requesterId must be positive integers.",
        fields,
      ),
    );
    return null;
  }

  return {
    ticketId: ticketId as number,
    attachmentId: attachmentId as number,
    requesterId: requesterId as number,
  };
}

function safeDownloadFilename(filename: string): string {
  return filename.replace(/["\\\r\n]/gu, "_") || "attachment";
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
// Issue 5 - requester-owned Ticket list
// ---------------------------------------------------------------------------
app.get("/api/tickets", async (req: Request, res: Response) => {
  const parsedQuery = parseTicketListQuery(req.query as Record<string, unknown>);
  if (!parsedQuery.ok) {
    sendApiError(res, parsedQuery.error);
    return;
  }

  try {
    const result = await listTickets(getPrisma(), parsedQuery.value);
    res.status(200).json(result);
  } catch (error) {
    sendApiError(res, error);
  }
});

// ---------------------------------------------------------------------------
// Issue 6 - requester-owned Ticket Detail and Attachment lifecycle
// ---------------------------------------------------------------------------
app.get("/api/tickets/:ticketId", async (req: Request, res: Response) => {
  const scope = parseTicketScope(req, res);
  if (scope === null) return;

  try {
    const ticket = await getOwnedTicket(
      getPrisma(),
      scope.ticketId,
      scope.requesterId,
    );
    res.status(200).json({ data: serializeTicket(ticket) });
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get(
  "/api/tickets/:ticketId/attachments",
  async (req: Request, res: Response) => {
    const scope = parseTicketScope(req, res);
    if (scope === null) return;

    try {
      const data = await listOwnedAttachments(
        getPrisma(),
        scope.ticketId,
        scope.requesterId,
      );
      res.status(200).json({ data });
    } catch (error) {
      sendApiError(res, error);
    }
  },
);

app.get(
  "/api/tickets/:ticketId/attachments/:attachmentId",
  async (req: Request, res: Response) => {
    const scope = parseAttachmentScope(req, res);
    if (scope === null) return;

    try {
      const { attachment } = await getOwnedAttachment(
        getPrisma(),
        scope.ticketId,
        scope.attachmentId,
        scope.requesterId,
      );
      res.status(200).json({
        data: serializeAttachmentMetadata(attachment, scope.requesterId),
      });
    } catch (error) {
      sendApiError(res, error);
    }
  },
);

app.get(
  "/api/tickets/:ticketId/attachments/:attachmentId/download",
  async (req: Request, res: Response) => {
    const scope = parseAttachmentScope(req, res);
    if (scope === null) return;

    try {
      const { attachment, bytes } = await downloadOwnedAttachment(
        getPrisma(),
        scope.ticketId,
        scope.attachmentId,
        scope.requesterId,
      );
      res
        .status(200)
        .set("Content-Type", attachment.mimeType)
        .set(
          "Content-Disposition",
          `${req.query.disposition === "inline" ? "inline" : "attachment"}; filename="${safeDownloadFilename(attachment.originalFilename)}"`,
        )
        .set("Content-Length", String(bytes.length))
        .send(bytes);
    } catch (error) {
      sendApiError(res, error);
    }
  },
);

app.delete(
  "/api/tickets/:ticketId/attachments/:attachmentId",
  async (req: Request, res: Response) => {
    const scope = parseAttachmentScope(req, res);
    if (scope === null) return;

    const body =
      typeof req.body === "object" && req.body !== null
        ? (req.body as Record<string, unknown>)
        : {};

    try {
      const data = await softRemoveOwnedAttachment(
        getPrisma(),
        scope.ticketId,
        scope.attachmentId,
        scope.requesterId,
        body.reason,
      );
      res.status(200).json({ data });
    } catch (error) {
      sendApiError(res, error);
    }
  },
);

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
      await assertOwnedTicket(prisma, ticketId, requesterId);

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
