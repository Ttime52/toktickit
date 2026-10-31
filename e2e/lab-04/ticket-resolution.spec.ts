import { expect, test } from "@playwright/test";

import {
  authenticateUser,
  captureLab4Screen,
  createAdminSession,
  createApiContext,
  createAuthenticatedRequesterTicket,
  createManagedUser,
  loginThroughUi,
  uniqueEmail,
} from "./test-support.js";

test.describe("Lab 4 Ticket resolution regression", () => {
  test("claims a Ticket, advances it through In Progress, and requires resolution evidence", async ({ page }, testInfo) => {
    const admin = await createAdminSession();
    const requesterContext = await createApiContext();
    const staffContext = await createApiContext();

    try {
      const requesterEmail = uniqueEmail("issue28-resolution-requester");
      const staffEmail = uniqueEmail("issue28-resolution-staff");
      await createManagedUser(admin.context, {
        displayName: "Issue 28 Resolution Requester",
        email: requesterEmail,
        role: "REQUESTER",
        isActive: true,
      });
      await createManagedUser(admin.context, {
        displayName: "Issue 28 Resolution Staff",
        email: staffEmail,
        role: "IT_STAFF",
        isActive: true,
      });

      const requester = await authenticateUser(requesterContext, requesterEmail);
      const staff = await authenticateUser(staffContext, staffEmail);
      const ticket = await createAuthenticatedRequesterTicket(requester.context, "ticket-resolution");

      await loginThroughUi(page, staffEmail, staff.password);
      await page.goto(`/staff/tickets/${ticket.id}`);
      await expect(page.getByRole("heading", { name: "Ticket Detail" })).toBeVisible();
      await expect(page.getByLabel("Current Status", { exact: true })).toHaveValue("NEW");

      await page.getByRole("button", { name: "Claim Ticket", exact: true }).click();
      await expect(page.locator("#staff-detail-owner")).toHaveValue(String(staff.user.id));

      await page.getByLabel("IT Priority", { exact: true }).selectOption("HIGH");
      await page.getByLabel("Current Status", { exact: true }).selectOption("OPEN");
      await page.getByRole("button", { name: "Save Work Changes", exact: true }).click();
      await expect(page.getByText("Ticket updated successfully.", { exact: true })).toBeVisible();
      await expect(page.locator(".zen-detail-ticket-number .zen-badge-status")).toHaveText("Open");

      await page.getByLabel("Current Status", { exact: true }).selectOption("IN_PROGRESS");
      await page.getByRole("button", { name: "Save Work Changes", exact: true }).click();
      await expect(page.locator(".zen-detail-ticket-number .zen-badge-status")).toHaveText("In Progress");

      await page.getByLabel("Current Status", { exact: true }).selectOption("RESOLVED");
      await expect(page.getByRole("dialog", { name: "Confirm status change" })).toBeVisible();
      await page.getByLabel(/Resolution Summary/iu).fill(
        "The service was restarted and monitoring confirms the error rate is back to normal.",
      );
      await page.getByLabel(/I confirm this formal Resolved transition/iu).check();
      await page.getByRole("dialog", { name: "Confirm status change" }).getByRole("button", { name: "Confirm", exact: true }).click();
      await expect(page.locator(".zen-detail-ticket-number .zen-badge-status")).toHaveText("Resolved");
      await page.keyboard.press("Tab");
      await expect(page.locator(":focus")).toBeVisible();
      await captureLab4Screen(page, testInfo, "ticket-resolution");

      const detailResponse = await staff.context.get(`/api/staff/tickets/${ticket.id}`);
      expect(detailResponse.status()).toBe(200);
      const detailBody = (await detailResponse.json()) as {
        data: { currentStatus: string; resolutionSummary: string | null };
      };
      expect(detailBody.data.currentStatus).toBe("RESOLVED");
      expect(detailBody.data.resolutionSummary).toContain("monitoring confirms");
    } finally {
      await requesterContext.dispose();
      await staffContext.dispose();
      await admin.context.dispose();
    }
  });
});
