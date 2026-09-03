import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "../../src/App.js";

const activeRequesters = [
  {
    id: 1,
    displayName: "Arun Chaiyasit",
    email: "arun.chaiyasit@example.test",
  },
  {
    id: 2,
    displayName: "Boonmee Srisuk",
    email: "boonmee.srisuk@example.test",
  },
];

function mockRequesterResponse(body: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    json: vi.fn().mockResolvedValue(body),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.history.replaceState({}, "", "/my-tickets");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Development Requester Selection (UI-01)", () => {
  it("shows a readable loading state and disables selection actions", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => new Promise(() => undefined)),
    );

    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Development Requester Selection" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Select a Development Requester to test requester-specific ticket behavior. This is not a login screen."),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading Development Requesters",
    );
    expect(screen.getByRole("combobox", { name: /Development Requester/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("renders active options, excludes inactive data, and continues to the shell", async () => {
    mockRequesterResponse([
      ...activeRequesters,
      {
        id: 99,
        displayName: "Inactive Test Requester",
        email: "inactive.requester@example.test",
        isActive: false,
      },
    ]);

    const user = userEvent.setup();
    render(<App />);

    const select = await screen.findByRole("combobox", {
      name: /Development Requester/,
    });
    expect(select).not.toBeDisabled();
    expect(
      screen.queryByRole("option", { name: /Inactive Test Requester/ }),
    ).not.toBeInTheDocument();

    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect(continueButton).toBeDisabled();
    await user.selectOptions(select, "1");
    expect(continueButton).toBeEnabled();
    await user.click(continueButton);

    expect(
      await screen.findByRole("heading", { name: "My Tickets" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Arun Chaiyasit")).toBeInTheDocument();
  });

  it("shows an empty state with Retry when no active requester exists", async () => {
    const fetchMock = mockRequesterResponse([]);
    render(<App />);

    expect(
      await screen.findByText("No active Development Requesters are available."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows a safe failure and retries the requester request", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("SQL password and stack path"))
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(activeRequesters),
      });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<App />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Unable to load Development Requesters. Please try again.",
    );
    expect(alert).not.toHaveTextContent("SQL password");
    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() =>
      expect(screen.getByRole("option", { name: /Arun Chaiyasit/ })).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
