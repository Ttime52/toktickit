import { expect, test } from "@playwright/test";

import {
  createFixtureTicket,
  navigateFromShell,
  openRequesterSelection,
  selectFirstRequester,
  waitForTicketInList,
} from "./test-support";

test.describe("Issue 7 visual QA checklist", () => {
  test("keeps Zen Green tokens, field states, badges, and actions consistent", async ({
    page,
    request,
  }, testInfo) => {
    const fixture = await createFixtureTicket(
      request,
      `visual-${testInfo.project.name}`,
    );

    await openRequesterSelection(page);
    const tokens = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);
      return Object.fromEntries(
        [
          "primary",
          "secondary",
          "pale",
          "page",
          "surface",
          "border",
          "text",
          "muted",
          "readonly",
          "error",
          "error-bg",
          "warning",
          "warning-bg",
          "success",
          "danger",
          "disabled-bg",
          "disabled-text",
          "focus",
        ].map((name) => [
          name,
          styles.getPropertyValue(`--zen-${name}`).trim().toLowerCase(),
        ]),
      );
    });
    expect(tokens).toEqual({
      primary: "#006b3c",
      secondary: "#0b7a46",
      pale: "#eaf6ef",
      page: "#f5f7f6",
      surface: "#ffffff",
      border: "#c7d3cd",
      text: "#17352a",
      muted: "#5c6f65",
      readonly: "#eef3f0",
      error: "#a12a2a",
      "error-bg": "#fff1f1",
      warning: "#9a6700",
      "warning-bg": "#fff8e1",
      success: "#0b7a46",
      danger: "#b42318",
      "disabled-bg": "#dde5e0",
      "disabled-text": "#7b8981",
      focus: "#0b7a46",
    });
    await expect(page.getByText("This is not a login screen.", { exact: false })).toBeVisible();

    await selectFirstRequester(page);
    await navigateFromShell(page, "Create Ticket");
    await expect(page.getByRole("heading", { name: "Create Ticket" })).toBeVisible();
    await expect(page.getByText("Generated on submit", { exact: true })).toHaveCount(2);

    const editableFieldHeights = await page.locator(
      ".zen-form-field input, .zen-form-field select, .zen-form-field textarea",
    ).evaluateAll((elements) =>
      elements.map((element) => Math.round(element.getBoundingClientRect().height)),
    );
    expect(editableFieldHeights.length).toBeGreaterThan(0);
    expect(Math.min(...editableFieldHeights)).toBeGreaterThanOrEqual(44);
    const visibleButtonHeights = await page.locator(
      ".zen-button:visible, .zen-text-button:visible",
    ).evaluateAll((elements) =>
      elements.map((element) => Math.round(element.getBoundingClientRect().height)),
    );
    expect(visibleButtonHeights.length).toBeGreaterThan(0);
    expect(Math.min(...visibleButtonHeights)).toBeGreaterThanOrEqual(44);

    await navigateFromShell(page, "My Tickets");
    await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
    await waitForTicketInList(page, fixture.ticketNumber);
    await expect(page.locator(".zen-badge:visible").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Clear Filters" })).toBeVisible();
    await expect(page.getByLabel("Page size")).toHaveValue("10");

    await page.locator(
      `[aria-label="Open ${fixture.ticketNumber}"]:visible`,
    ).first().click();
    await page.waitForURL(new RegExp(`/tickets/${fixture.id}$`, "u"));
    await expect(page.getByRole("heading", { name: "Ticket Detail" })).toBeVisible();
    await expect(page.locator(".zen-detail-card")).toBeVisible();
    await expect(page.locator(".zen-read-only-item").first()).toBeVisible();
    await expect(page.getByText(/Public Comments|Internal Notes|Actions Taken/iu)).toHaveCount(0);
  });
});
