import { describe, expect, it } from "vitest";

import {
  MAX_ATTACHMENT_BYTES,
  sanitizeOriginalFilename,
  validateAttachmentFile,
} from "../../src/attachments.js";

describe("Issue 4 Attachment validation (UNIT-04)", () => {
  it.each([
    ["photo.JPG", "image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0x00])],
    ["photo.jpeg", "image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0x00])],
    ["photo.PNG", "image/png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ["photo.webp", "image/webp", Buffer.from("RIFFxxxxWEBP", "ascii")],
    ["notes.PDF", "application/pdf", Buffer.from("%PDF-1.7", "ascii")],
  ])("accepts a permitted %s upload", (filename, mimeType, bytes) => {
    const result = validateAttachmentFile({ filename, mimeType, bytes });
    expect(result).toMatchObject({ ok: true, value: { sizeBytes: bytes.length } });
  });

  it("rejects mismatched MIME/extension, signatures, and oversized files", () => {
    const mismatch = validateAttachmentFile({
      filename: "photo.png",
      mimeType: "image/jpeg",
      bytes: Buffer.from([0xff, 0xd8, 0xff]),
    });
    const signatureMismatch = validateAttachmentFile({
      filename: "photo.png",
      mimeType: "image/png",
      bytes: Buffer.from("not-a-png"),
    });
    const bytes = Buffer.alloc(MAX_ATTACHMENT_BYTES);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const boundary = validateAttachmentFile({
      filename: "exact.png",
      mimeType: "image/png",
      bytes,
    });
    const oversized = validateAttachmentFile({
      filename: "large.png",
      mimeType: "image/png",
      bytes: Buffer.concat([bytes, Buffer.from([0x00])]),
    });

    expect(mismatch).toMatchObject({ ok: false, error: { code: "ATTACHMENT_TYPE_NOT_ALLOWED", status: 415 } });
    expect(signatureMismatch).toMatchObject({ ok: false, error: { code: "ATTACHMENT_SIGNATURE_INVALID", status: 415 } });
    expect(boundary).toMatchObject({ ok: true, value: { sizeBytes: MAX_ATTACHMENT_BYTES } });
    expect(oversized).toMatchObject({ ok: false, error: { code: "ATTACHMENT_TOO_LARGE", status: 413 } });
  });

  it("keeps only safe basename display metadata", () => {
    const unsafe = sanitizeOriginalFilename("..\\folder/  résumé (final).png\u0000");
    expect(unsafe).not.toContain("folder");
    expect(unsafe).not.toContain("/");
    expect(unsafe).not.toContain("\\");
    expect(unsafe).not.toContain("\u0000");
    expect(unsafe.length).toBeLessThanOrEqual(120);
    expect(sanitizeOriginalFilename("///")).toBe("attachment");
    expect(sanitizeOriginalFilename("")).toBe("attachment");
  });
});
