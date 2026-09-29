import { describe, expect, it } from "vitest";

import {
  isValidEmail,
  normalizeEmail,
  passwordCodePointLength,
  passwordPolicyError,
  readSessionToken,
  toUserShape,
} from "../../src/auth-service.js";

describe("Issue 3 authentication helpers (UNIT-01/UNIT-02)", () => {
  it("normalizes and validates email without exposing a browser identity source", () => {
    expect(normalizeEmail("  Narin@Example.TEST ")).toBe("narin@example.test");
    expect(isValidEmail("narin@example.test")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
  });

  it("enforces the adaptive-password policy", () => {
    expect(passwordPolicyError("short")).toMatch(/12 to 128/u);
    expect(passwordPolicyError("longpasswordonly")).toMatch(/uppercase/u);
    expect(passwordPolicyError("ValidPassword1!")).toBeNull();
  });

  it("counts password length by Unicode code points at both boundaries", () => {
    const minimum = `Aa1!😀${"x".repeat(7)}`;
    const belowMinimum = `Aa1!😀${"x".repeat(6)}`;
    const maximum = `Aa1!😀${"x".repeat(123)}`;
    const aboveMaximum = `Aa1!😀${"x".repeat(124)}`;

    expect(passwordCodePointLength(minimum)).toBe(12);
    expect(minimum.length).toBe(13);
    expect(passwordPolicyError(minimum)).toBeNull();
    expect(passwordPolicyError(belowMinimum)).toMatch(/12 to 128/u);
    expect(passwordCodePointLength(maximum)).toBe(128);
    expect(maximum.length).toBe(129);
    expect(passwordPolicyError(maximum)).toBeNull();
    expect(passwordPolicyError(aboveMaximum)).toMatch(/12 to 128/u);
  });

  it("reads only the opaque session cookie and returns a safe User shape", () => {
    expect(readSessionToken("other=value; toktickit_session=opaque-value")).toBe(
      "opaque-value",
    );
    expect(readSessionToken("toktickit_session=opaque%20value")).toBe("opaque value");
    expect(readSessionToken(undefined)).toBeNull();

    const safeUser = toUserShape({
      id: 7,
      displayName: "Narin Example",
      email: "narin@example.test",
      role: "IT_STAFF",
      isActive: true,
      mustChangePassword: true,
    });
    expect(safeUser).toEqual({
      id: 7,
      displayName: "Narin Example",
      email: "narin@example.test",
      role: "IT_STAFF",
      isActive: true,
      mustChangePassword: true,
    });
    expect(safeUser).not.toHaveProperty("passwordHash");
  });
});
