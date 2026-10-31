import { expect, test } from "@playwright/test";

import {
  assertNoHorizontalOverflow,
  captureScreen,
  createFixtureTicket,
  createRequesterSession,
  disposeRequesterSession,
  navigateFromShell,
  openRequesterWorkspace,
  waitForTicketInList,
} from "./test-support";

test.describe("Lab 2 responsive regression evidence", () => {
  test("captures current requester screens and checks viewport fit", async ({
    page,
  }, testInfo) => {
    const session = await createRequesterSession(`responsive-${testInfo.project.name}`);
    try {
      const fixture = await createFixtureTicket(
        session.requester.context,
        `responsive-${testInfo.project.name}`,
      );

      await openRequesterWorkspace(page, session);
      await captureScreen(page, testInfo, "my-tickets");

      await navigateFromShell(page, "Create Ticket");
      await expect(page.getByRole("heading", { name: "Create Ticket" })).toBeVisible();
      await captureScreen(page, testInfo, "create-ticket");

      await navigateFromShell(page, "My Tickets");
      await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
      await waitForTicketInList(page, fixture.ticketNumber);

      const viewportWidth = page.viewportSize()?.width ?? 0;
      const table = page.locator(".zen-ticket-table-wrap");
      const cards = page.locator(".zen-ticket-card-list");
      if (viewportWidth < 768) {
        await expect(table).not.toBeVisible();
        await expect(cards).toBeVisible();
      } else if (viewportWidth >= 1200) {
        await expect(table).toBeVisible();
        await expect(cards).not.toBeVisible();
      }

      if (testInfo.project.name === "tablet") {
        await page.setViewportSize({ width: 900, height: 768 });
        await assertNoHorizontalOverflow(page);
        const toolbarColumns = await page.locator(".zen-ticket-toolbar").evaluate(
          (element) => getComputedStyle(element).gridTemplateColumns.split(" ").length,
        );
        expect(toolbarColumns).toBe(2);
        await page.setViewportSize({ width: 1024, height: 768 });
      }

      await page.locator(
        `[aria-label="Open ${fixture.ticketNumber}"]:visible`,
      ).first().click();
      await page.waitForURL(new RegExp(`/tickets/${fixture.id}$`, "u"));
      await expect(page.getByRole("heading", { name: "Ticket Detail" })).toBeVisible();
      await captureScreen(page, testInfo, "ticket-detail");

      if (testInfo.project.name === "mobile") {
        await page.setViewportSize({ width: 320, height: 844 });
        await page.goto("/select-requester");
        await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
        await expect(page.getByText(/Development Requester|Change Requester/iu)).toHaveCount(0);
        await assertNoHorizontalOverflow(page);
      }
    } finally {
      await disposeRequesterSession(session);
    }
  });
});
