import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "../../src/App.js";

const gatedUser = {
  id: 7,
  displayName: "Narin Example",
  email: "narin@example.test",
  role: "IT_STAFF",
  isActive: true,
  mustChangePassword: true,
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

describe("Mandatory Change Password screen (UI-01)", () => {
  it("keeps normal navigation unavailable until a valid password change succeeds", async () => {
    const changedUser = { ...gatedUser, mustChangePassword: false };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { user: gatedUser } }))
      .mockResolvedValueOnce(jsonResponse({ data: { user: changedUser } }));
    vi.stubGlobal("fetch", fetchMock);

    const userEventInstance = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Change your password" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Logout" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ticket Queue" })).not.toBeInTheDocument();

    await userEventInstance.type(screen.getByLabelText(/Current password/), "CurrentPassword1!");
    await userEventInstance.type(screen.getByLabelText(/^New password/), "NewPassword2@");
    await userEventInstance.type(screen.getByLabelText(/Confirm new password/), "NewPassword2@");
    await userEventInstance.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByRole("heading", { name: "Your IT Staff workspace" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://localhost:3000/api/auth/change-password",
      expect.objectContaining({ credentials: "include" }),
    );
  });
});
