import { expect, test } from "@playwright/test";

import {
  authenticateUser,
  createAdminSession,
  createApiContext,
  createAuthenticatedRequesterTicket,
  createManagedUser,
  loginThroughUi,
  uniqueEmail,
} from "./test-support.js";

test.describe("Lab 3 visual checklist", () => {
  test("shows role navigation, semantic badges, and distinct public/private communication panels", async ({ page, browser }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Visual checklist runs once on desktop.");

    const admin = await createAdminSession();
    const requesterContext = await createApiContext();
    const staffContext = await createApiContext();
    let adminPage = null as Awaited<ReturnType<typeof browser.newPage>> | null;

    try {
      const requesterEmail = uniqueEmail("visual-requester");
      const staffEmail = uniqueEmail("visual-staff");
      await createManagedUser(admin.context, {
        displayName: "Lab 3 Visual Requester",
        email: requesterEmail,
        role: "REQUESTER",
        isActive: true,
      });
      await createManagedUser(admin.context, {
        displayName: "Lab 3 Visual Staff",
        email: staffEmail,
        role: "IT_STAFF",
        isActive: true,
      });
      const requester = await authenticateUser(requesterContext, requesterEmail);
      const staff = await authenticateUser(staffContext, staffEmail);
      const ticket = await createAuthenticatedRequesterTicket(requester.context, "visual-checklist");

      await loginThroughUi(page, staffEmail, staff.password);
      await expect(page.locator(".zen-role-badge")).toHaveText("IT Staff");
      await expect(page.getByRole("link", { name: "Ticket Queue", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "User Management", exact: true })).toHaveCount(0);
      await page.getByLabel("Search Tickets", { exact: true }).fill(ticket.ticketNumber);
      await expect(page.locator(`button[aria-label="Open ${ticket.ticketNumber}"]:visible`)).toBeVisible();
      await expect(page.locator(".zen-staff-ticket-table .zen-badge-priority").first()).toBeVisible();
      await expect(page.locator(".zen-staff-ticket-table .zen-badge-status").first()).toBeVisible();
      await page.locator(`button[aria-label="Open ${ticket.ticketNumber}"]:visible`).click();
      await expect(page.locator(".zen-public-comments")).toBeVisible();
      await expect(page.locator(".zen-internal-notes")).toBeVisible();
      await expect(page.locator(".zen-public-comments")).not.toHaveClass(/zen-internal-notes/iu);
      await expect(page.getByText(/IT Staff\/Administrator only.*never visible to Requesters/iu)).toBeVisible();

      adminPage = await browser.newPage();
      await loginThroughUi(adminPage, "admin@example.test", admin.password);
      await expect(adminPage.locator(".zen-role-badge")).toHaveText("Administrator");
      await expect(adminPage.getByRole("link", { name: "User Management", exact: true })).toBeVisible();
      await expect(adminPage.getByRole("link", { name: "Ticket Queue", exact: true })).toHaveCount(0);
    } finally {
      await adminPage?.close();
      await requesterContext.dispose();
      await staffContext.dispose();
      await admin.context.dispose();
    }
  });
});
