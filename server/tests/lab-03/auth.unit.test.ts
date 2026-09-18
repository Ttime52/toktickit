import { describe, expect, it } from "vitest";

import {
  isValidEmail,
  normalizeEmail,
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
