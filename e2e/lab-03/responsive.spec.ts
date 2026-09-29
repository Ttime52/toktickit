import { expect, test } from "@playwright/test";

import {
  authenticateUser,
  captureScreen,
  createAdminSession,
  createApiContext,
  createAuthenticatedRequesterTicket,
  createManagedUser,
  completePasswordChangeThroughUi,
  e2eFinalPassword,
  loginThroughUi,
  assertNoHorizontalOverflow,
  seedInitialPassword,
  uniqueEmail,
} from "./test-support.js";

test.describe("Lab 3 responsive and screenshot evidence", () => {
  test("captures every new role screen at the required viewport", async ({ page, browser }, testInfo) => {
    const admin = await createAdminSession();
    const requesterContext = await createApiContext();
    const staffContext = await createApiContext();
    const pages = [] as Array<Awaited<ReturnType<typeof browser.newPage>>>;

    try {
      const changePasswordEmail = uniqueEmail("responsive-change-password");
      const requesterEmail = uniqueEmail("responsive-requester");
      const staffEmail = uniqueEmail("responsive-staff");
      await createManagedUser(admin.context, {
        displayName: "Lab 3 Responsive Change Password",
        email: changePasswordEmail,
        role: "REQUESTER",
        isActive: true,
      });
      await createManagedUser(admin.context, {
        displayName: "Lab 3 Responsive Requester",
        email: requesterEmail,
        role: "REQUESTER",
        isActive: true,
      });
      await createManagedUser(admin.context, {
        displayName: "Lab 3 Responsive Staff",
        email: staffEmail,
        role: "IT_STAFF",
        isActive: true,
      });

      const requester = await authenticateUser(requesterContext, requesterEmail);
      const staff = await authenticateUser(staffContext, staffEmail);
      const ticket = await createAuthenticatedRequesterTicket(requester.context, "responsive");

      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
      await captureScreen(page, testInfo, "authentication/login");

      const changePage = await browser.newPage();
      pages.push(changePage);
      await loginThroughUi(changePage, changePasswordEmail, seedInitialPassword());
      await expect(changePage.getByRole("heading", { name: "Change your password" })).toBeVisible();
      await captureScreen(changePage, testInfo, "authentication/change-password");
      await completePasswordChangeThroughUi(changePage, seedInitialPassword(), e2eFinalPassword());

      const requesterPage = await browser.newPage();
      pages.push(requesterPage);
      await loginThroughUi(requesterPage, requesterEmail, requester.password);
      await requesterPage.goto(`/tickets/${ticket.id}`);
      await expect(requesterPage.getByRole("heading", { name: "Ticket Detail" })).toBeVisible();
      await captureScreen(requesterPage, testInfo, "requester-regression/ticket-detail");

      const staffPage = await browser.newPage();
      pages.push(staffPage);
      await loginThroughUi(staffPage, staffEmail, staff.password);
      await expect(staffPage.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
      await captureScreen(staffPage, testInfo, "staff-queue/ticket-queue");
      if (testInfo.project.name === "tablet") {
        await expect(staffPage.locator(".zen-ticket-table-wrap")).toBeHidden();
        await expect(staffPage.locator(".zen-ticket-card-list")).toBeVisible();
      }
      await staffPage.getByLabel("Search Tickets", { exact: true }).fill(ticket.ticketNumber);
      const openTicketButton = staffPage.locator(`button[aria-label="Open ${ticket.ticketNumber}"]:visible`);
      await expect(openTicketButton).toBeVisible();
      await openTicketButton.click();
      await expect(staffPage.getByRole("heading", { name: "Ticket Detail" })).toBeVisible();
      await captureScreen(staffPage, testInfo, "staff-ticket-detail/ticket-detail");

      const adminPage = await browser.newPage();
      pages.push(adminPage);
      await loginThroughUi(adminPage, "admin@example.test", admin.password);
      await expect(adminPage.getByRole("heading", { name: "User Management" })).toBeVisible();
      await captureScreen(adminPage, testInfo, "user-management/user-management");

      if (testInfo.project.name === "mobile") {
        await page.setViewportSize({ width: 320, height: 844 });
        await page.goto("/");
        await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
        await assertNoHorizontalOverflow(page);
      }
    } finally {
      for (const currentPage of pages) await currentPage.close();
      await requesterContext.dispose();
      await staffContext.dispose();
      await admin.context.dispose();
    }
  });
});
