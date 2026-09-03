import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import type { Request } from "express";
import type { Prisma } from "@prisma/client";

import { ApiError } from "./errors.js";

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ACTIVE_ATTACHMENTS = 5;

const MAX_MULTIPART_BODY_BYTES = MAX_ATTACHMENT_BYTES + 128 * 1024;

const MIME_BY_EXTENSION = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
} as const;

const MIME_TYPES: Set<string> = new Set(Object.values(MIME_BY_EXTENSION));

export interface ParsedUpload {
  filename: string;
  mimeType: string;
  bytes: Buffer;
}

export interface ValidatedAttachment {
  originalFilename: string;
  mimeType: (typeof MIME_BY_EXTENSION)[keyof typeof MIME_BY_EXTENSION];
  sizeBytes: number;
  bytes: Buffer;
}

export function basenameOfFilename(filename: string): string {
  const pieces = filename.split(/[\\/]/u);
  return pieces[pieces.length - 1] ?? "";
}

export function sanitizeOriginalFilename(filename: string): string {
  let safeName = basenameOfFilename(filename);

  try {
    safeName = safeName.normalize("NFC");
  } catch {
    // A malformed Unicode value should still become safe display metadata.
  }

  safeName = safeName
    .trim()
    .replace(/[\u0000-\u001f\u007f\\/]/gu, "_")
    .replace(/[^\p{L}\p{N} ._-]/gu, "_")
    .slice(0, 120)
    .trim();

  return safeName || "attachment";
}

function hasSignature(
  mimeType: string,
  bytes: Buffer,
): boolean {
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  }

  if (mimeType === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      )
    );
  }

  if (mimeType === "image/webp") {
    return (
      bytes.length >= 12 &&
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }

  return bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-";
}

function attachmentError(
  status: number,
  code: string,
  message: string,
): ApiError {
  return new ApiError(status, code, message);
}

export function validateAttachmentFile(
  file: ParsedUpload,
): { ok: true; value: ValidatedAttachment } | { ok: false; error: ApiError } {
  const filename = basenameOfFilename(file.filename);
  const extension = filename.includes(".")
    ? filename.slice(filename.lastIndexOf(".")).toLowerCase()
    : "";
  const suppliedMimeType = file.mimeType.trim().toLowerCase();
  const expectedMimeType = MIME_BY_EXTENSION[extension as keyof typeof MIME_BY_EXTENSION];

  if (
    expectedMimeType === undefined ||
    !MIME_TYPES.has(suppliedMimeType) ||
    expectedMimeType !== suppliedMimeType
  ) {
    return {
      ok: false,
      error: attachmentError(
        415,
        "ATTACHMENT_TYPE_NOT_ALLOWED",
        "Only JPG, JPEG, PNG, WEBP, and PDF attachments are allowed.",
      ),
    };
  }

  if (file.bytes.length > MAX_ATTACHMENT_BYTES) {
    return {
      ok: false,
      error: attachmentError(
        413,
        "ATTACHMENT_TOO_LARGE",
        "Attachment size must not exceed 5 MiB.",
      ),
    };
  }

  if (!hasSignature(expectedMimeType, file.bytes)) {
    return {
      ok: false,
      error: attachmentError(
        415,
        "ATTACHMENT_SIGNATURE_INVALID",
        "The attachment content does not match its declared type.",
      ),
    };
  }

  return {
    ok: true,
    value: {
      originalFilename: sanitizeOriginalFilename(file.filename),
      mimeType: expectedMimeType,
      sizeBytes: file.bytes.length,
      bytes: file.bytes,
    },
  };
}

function headerValue(headers: string[], name: string): string | undefined {
  const line = headers.find((header) =>
    header.toLowerCase().startsWith(`${name.toLowerCase()}:`),
  );
  return line?.slice(line.indexOf(":") + 1).trim();
}

function parseDisposition(value: string | undefined) {
  if (value === undefined) return null;

  const name = /(?:^|;)\s*name="([^"]*)"/iu.exec(value)?.[1];
  const filename = /(?:^|;)\s*filename="([^"]*)"/iu.exec(value)?.[1];
  if (name === undefined || filename === undefined) return null;
  return { name, filename };
}

function readRequestBody(req: Request, maxBytes: number): Promise<Buffer> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const cleanup = () => {
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
      req.off("aborted", onAborted);
    };

    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const onData = (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > maxBytes) {
        req.resume();
        rejectOnce(
          attachmentError(
            413,
            "ATTACHMENT_TOO_LARGE",
            "Attachment size must not exceed 5 MiB.",
          ),
        );
        return;
      }
      chunks.push(buffer);
    };

    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolveBody(Buffer.concat(chunks));
    };

    const onError = (error: Error) => rejectOnce(error);
    const onAborted = () => rejectOnce(new Error("Multipart request aborted."));

    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
    req.on("aborted", onAborted);
  });
}

function parseBoundary(contentType: string): string | null {
  if (!/^multipart\/form-data\s*;/iu.test(contentType)) return null;
  return /(?:^|;)\s*boundary="?([^";]+)"?/iu.exec(contentType)?.[1] ?? null;
}

/** Parse the one-file multipart contract without accepting arbitrary form fields. */
export async function parseSingleMultipartFile(req: Request): Promise<ParsedUpload> {
  const contentType = req.headers["content-type"];
  if (typeof contentType !== "string") {
    throw attachmentError(
      400,
      "VALIDATION_ERROR",
      "A multipart/form-data upload with one file field is required.",
    );
  }

  const boundary = parseBoundary(contentType);
  if (boundary === null || boundary.length === 0) {
    throw attachmentError(
      400,
      "VALIDATION_ERROR",
      "A multipart/form-data boundary is required.",
    );
  }

  const body = await readRequestBody(req, MAX_MULTIPART_BODY_BYTES);
  const delimiter = Buffer.from(`--${boundary}`);
  const nextDelimiter = Buffer.from(`\r\n--${boundary}`);

  if (!body.subarray(0, delimiter.length).equals(delimiter)) {
    throw attachmentError(
      400,
      "VALIDATION_ERROR",
      "The multipart upload is malformed.",
    );
  }

  const parts: Array<{ name: string; filename: string; mimeType: string; bytes: Buffer }> = [];
  let cursor = delimiter.length;

  while (cursor <= body.length) {
    if (body.subarray(cursor, cursor + 2).toString("ascii") === "--") break;
    if (body.subarray(cursor, cursor + 2).toString("ascii") !== "\r\n") {
      throw attachmentError(400, "VALIDATION_ERROR", "The multipart upload is malformed.");
    }

    const partStart = cursor + 2;
    const partEnd = body.indexOf(nextDelimiter, partStart);
    if (partEnd < 0) {
      throw attachmentError(400, "VALIDATION_ERROR", "The multipart upload is malformed.");
    }

    const part = body.subarray(partStart, partEnd);
    const headersEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headersEnd < 0) {
      throw attachmentError(400, "VALIDATION_ERROR", "The multipart upload is malformed.");
    }

    const headers = part.subarray(0, headersEnd).toString("utf8").split("\r\n");
    const disposition = parseDisposition(headerValue(headers, "content-disposition"));
    if (disposition === null) {
      throw attachmentError(400, "VALIDATION_ERROR", "The multipart upload is malformed.");
    }

    parts.push({
      name: disposition.name,
      filename: disposition.filename,
      mimeType: headerValue(headers, "content-type") ?? "",
      bytes: part.subarray(headersEnd + 4),
    });

    cursor = partEnd + 2;
  }

  if (parts.length !== 1 || parts[0]?.name !== "file") {
    throw attachmentError(
      400,
      "VALIDATION_ERROR",
      "The upload must contain exactly one file field named file.",
    );
  }

  const part = parts[0];
  if (part === undefined || part.filename.length === 0 || part.mimeType.length === 0) {
    throw attachmentError(
      400,
      "VALIDATION_ERROR",
      "The upload must contain one named file with a type.",
    );
  }

  return {
    filename: part.filename,
    mimeType: part.mimeType,
    bytes: part.bytes,
  };
}

const DEFAULT_STORAGE_DIRECTORY = fileURLToPath(
  new URL("../.data/attachments", import.meta.url),
);

export function attachmentStorageDirectory(): string {
  return resolve(process.env.ATTACHMENT_STORAGE_DIR ?? DEFAULT_STORAGE_DIRECTORY);
}

function storagePath(storageKey: string): string {
  if (!/^[a-f0-9-]{16,80}$/iu.test(storageKey)) {
    throw new Error("Invalid storage key.");
  }

  const directory = attachmentStorageDirectory();
  const candidate = resolve(directory, storageKey);
  if (dirname(candidate) !== resolve(directory)) {
    throw new Error("Invalid storage path.");
  }
  return candidate;
}

export async function storeAttachmentBytes(bytes: Buffer): Promise<string> {
  const storageKey = randomUUID();
  const path = storagePath(storageKey);
  await mkdir(attachmentStorageDirectory(), { recursive: true });
  await writeFile(path, bytes, { flag: "wx" });
  return storageKey;
}

export async function removeStoredAttachment(storageKey: string): Promise<void> {
  try {
    await unlink(storagePath(storageKey));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
  }
}

export async function readStoredAttachment(storageKey: string): Promise<Buffer> {
  return readFile(storagePath(storageKey));
}

export type AttachmentMetadataRecord = Prisma.AttachmentGetPayload<{
  select: {
    id: true;
    ticketId: true;
    originalFilename: true;
    storageKey: true;
    mimeType: true;
    sizeBytes: true;
    uploadedAt: true;
    availabilityState: true;
    unavailableAt: true;
    unavailableReason: true;
    removedAt: true;
    removalReason: true;
  };
}>;

export function serializeAttachmentMetadata(
  attachment: AttachmentMetadataRecord,
  requesterId: number,
) {
  const state =
    attachment.removedAt !== null
      ? "removed"
      : attachment.availabilityState === "UNAVAILABLE"
        ? "unavailable"
        : "active";
  const active = state === "active";

  return {
    id: attachment.id,
    ticketId: attachment.ticketId,
    originalFilename: attachment.originalFilename,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    uploadedAt: attachment.uploadedAt.toISOString(),
    state,
    removedAt: attachment.removedAt?.toISOString() ?? null,
    unavailableAt: attachment.unavailableAt?.toISOString() ?? null,
    unavailableReason: attachment.unavailableReason,
    removalReason: attachment.removalReason,
    previewable: active,
    downloadUrl: active
      ? `/api/tickets/${attachment.ticketId}/attachments/${attachment.id}/download?requesterId=${requesterId}`
      : null,
  };
}
