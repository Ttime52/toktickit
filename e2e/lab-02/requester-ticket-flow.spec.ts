import { expect, test } from "@playwright/test";

import {
  openRequesterSelection,
  navigateFromShell,
  PNG_BYTES,
  selectFirstRequester,
  waitForTicketInList,
} from "./test-support";

test.describe("Issue 7 requester ticket flow", () => {
  test("selects requester, creates ticket, opens detail, and removes an attachment", async ({
    page,
  }, testInfo) => {
    await openRequesterSelection(page);
    const requester = await selectFirstRequester(page);
    await expect(page.getByText(requester.displayName, { exact: true })).toBeVisible();

    await page.route("**/api/tickets", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }

      await route.continue({
        headers: {
          ...route.request().headers(),
          "idempotency-key": `issue7-flow-${testInfo.project.name}`,
        },
      });
    });

    await navigateFromShell(page, "Create Ticket");
    await expect(page.getByRole("heading", { name: "Create Ticket" })).toBeVisible();
    await expect(page.getByLabel(/Category/u)).toBeEnabled();
    await expect(page.getByLabel(/Related System/u)).toBeEnabled();

    await page.getByLabel(/Category/u).selectOption({ index: 1 });
    await page.getByLabel(/Related System/u).selectOption({ index: 1 });
    await page.getByLabel(/Summary/u).fill(
      `Issue 7 full flow ${testInfo.project.name} fixture`,
    );
    await page.getByLabel(/Description/u).fill(
      "This ticket verifies the complete requester journey and attachment lifecycle.",
    );

    await page.locator("form.zen-create-card").getByRole("button", {
      name: "Create Ticket",
    }).click();

    await expect(page.getByRole("heading", { name: "Ticket created" })).toBeVisible();
    const ticketNumber = await page
      .locator(".zen-success-panel strong")
      .textContent();
    expect(ticketNumber).toMatch(/^TT-\d{4}-\d{6}$/u);

    // Verify the newly-created Ticket is returned by the requester-scoped list
    // before opening its detail page.
    await page.getByRole("button", { name: "My Tickets" }).click();
    await page.waitForURL(/\/my-tickets$/u);
    await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
    if (ticketNumber === null) {
      throw new Error("The create success state did not expose a Ticket Number.");
    }
    await waitForTicketInList(page, ticketNumber);
    await page.locator(`[aria-label="Open ${ticketNumber}"]:visible`).first().click();
    await page.waitForURL(/\/tickets\/\d+$/u);
    await expect(page.getByRole("heading", { name: "Ticket Detail" })).toBeVisible();
    await expect(page.getByText(ticketNumber ?? "", { exact: true })).toBeVisible();

    const attachmentName = `issue-7-proof-${testInfo.project.name}.png`;
    const attachmentInput = page.getByLabel("Add Attachment");
    await attachmentInput.setInputFiles({
      name: attachmentName,
      mimeType: "image/png",
      buffer: PNG_BYTES,
    });

    const attachmentRow = page
      .locator(".zen-detail-attachment-row")
      .filter({ hasText: attachmentName })
      .last();
    await expect(attachmentRow).toContainText(attachmentName);
    await expect(attachmentRow.getByText("Active", { exact: true })).toBeVisible();

    const previewLink = attachmentRow.getByRole("link", { name: "Preview" });
    await expect(previewLink).toHaveAttribute("href", /disposition=inline/u);
    await expect(
      attachmentRow.getByRole("link", { name: "Download" }),
    ).toHaveAttribute("download", attachmentName);

    await attachmentRow.getByRole("button", { name: "Remove" }).click();
    const removeDialog = page.getByRole("dialog", { name: "Remove Attachment?" });
    await expect(removeDialog).toBeVisible();
    await removeDialog.getByLabel(/Removal reason/u).fill("No longer needed for QA");
    await removeDialog.getByRole("button", { name: "Remove Attachment" }).click();

    await expect(attachmentRow.getByText("Removed", { exact: true })).toBeVisible();
    await expect(attachmentRow).toContainText("Download unavailable");
    await expect(attachmentRow.getByRole("link")).toHaveCount(0);
  });
});
