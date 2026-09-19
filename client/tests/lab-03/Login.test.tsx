import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "../../src/App.js";

const user = {
  id: 7,
  displayName: "Narin Example",
  email: "narin@example.test",
  role: "IT_STAFF",
  isActive: true,
  mustChangePassword: false,
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Login screen (UI-01)", () => {
  it("validates fields, signs in, and renders the authenticated identity and role", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: { code: "AUTHENTICATION_REQUIRED" } }, 401))
      .mockResolvedValueOnce(jsonResponse({ data: { user } }));
    vi.stubGlobal("fetch", fetchMock);

    const userEventInstance = userEvent.setup();
    render(<App />);

    await userEventInstance.click(await screen.findByRole("button", { name: "Sign in" }));
    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("Password is required.")).toBeInTheDocument();

    await userEventInstance.type(screen.getByLabelText(/Email/), user.email);
    await userEventInstance.type(screen.getByLabelText(/^Password/), "Password1!");
    await userEventInstance.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Narin Example")).toBeInTheDocument();
    expect(screen.getByText("narin@example.test")).toBeInTheDocument();
    expect(screen.getByText("IT Staff")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Logout" })).toBeInTheDocument();
    const loginCall = fetchMock.mock.calls.find(([url]) => url === "http://localhost:3000/api/auth/login");
    expect(loginCall).toBeDefined();
    expect(loginCall?.[1]).toEqual(expect.objectContaining({ credentials: "include" }));
  });

  it("uses a generic message for invalid or inactive accounts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(jsonResponse({ error: { code: "AUTHENTICATION_REQUIRED" } }, 401))
        .mockResolvedValueOnce(
          jsonResponse(
            { error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } },
            401,
          ),
        ),
    );

    const userEventInstance = userEvent.setup();
    render(<App />);
    await userEventInstance.type(await screen.findByLabelText(/Email/), "inactive@example.test");
    await userEventInstance.type(screen.getByLabelText(/^Password/), "Password1!");
    await userEventInstance.click(screen.getByRole("button", { name: "Sign in" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Unable to sign in with those details.");
    expect(alert).not.toHaveTextContent("inactive@example.test");
  });
});
