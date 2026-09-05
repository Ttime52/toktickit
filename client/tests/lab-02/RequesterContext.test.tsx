import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "../../src/App.js";
import { REQUESTER_STORAGE_KEY } from "../../src/RequesterContext.js";

const requesters = [
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

function mockRequesterResponse() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue(requesters),
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

describe("Requester context and navigation (UI-02)", () => {
  it("redirects an unselected My Tickets URL to the selection screen", async () => {
    mockRequesterResponse();
    window.history.replaceState({}, "", "/my-tickets");

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: "Development Requester Selection",
      }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/select-requester");
  });

  it("restores a valid stored requester and removes an invalid stored id", async () => {
    mockRequesterResponse();
    window.localStorage.setItem(REQUESTER_STORAGE_KEY, "2");

    const { unmount } = render(<App />);
    expect(
      await screen.findByRole("heading", { name: "My Tickets" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Boonmee Srisuk")).toBeInTheDocument();

    unmount();
    window.localStorage.setItem(REQUESTER_STORAGE_KEY, "999");
    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: "Development Requester Selection",
      }),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem(REQUESTER_STORAGE_KEY)).toBeNull();
  });

  it("persists selection, updates the shell, and clears requester-scoped state on change", async () => {
    mockRequesterResponse();
    const user = userEvent.setup();
    render(<App />);

    const select = await screen.findByRole("combobox", {
      name: /Development Requester/,
    });
    await user.selectOptions(select, "1");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(window.localStorage.getItem(REQUESTER_STORAGE_KEY)).toBe("1");
    expect(screen.getByText("Arun Chaiyasit")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Change Requester" }));
    expect(
      await screen.findByRole("heading", {
        name: "Development Requester Selection",
      }),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem(REQUESTER_STORAGE_KEY)).toBeNull();

    const changedSelect = screen.getByRole("combobox", {
      name: /Development Requester/,
    });
    await user.selectOptions(changedSelect, "2");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(window.localStorage.getItem(REQUESTER_STORAGE_KEY)).toBe("2");
    expect(screen.getByText("Boonmee Srisuk")).toBeInTheDocument();
  });
});
