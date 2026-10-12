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

test.describe("Lab 4 Dashboard regression and responsive evidence", () => {
  test("renders all role dashboards with keyboard-accessible controls", async ({ page, browser }, testInfo) => {
    const admin = await createAdminSession();
    const requesterContext = await createApiContext();
    const staffContext = await createApiContext();
    let staffPage = null as Awaited<ReturnType<typeof browser.newPage>> | null;
    let administratorPage = null as Awaited<ReturnType<typeof browser.newPage>> | null;

    try {
      const requesterEmail = uniqueEmail("issue28-dashboard-requester");
      const staffEmail = uniqueEmail("issue28-dashboard-staff");
      await createManagedUser(admin.context, {
        displayName: "Issue 28 Dashboard Requester",
        email: requesterEmail,
        role: "REQUESTER",
        isActive: true,
      });
      await createManagedUser(admin.context, {
        displayName: "Issue 28 Dashboard Staff",
        email: staffEmail,
        role: "IT_STAFF",
        isActive: true,
      });

      const requester = await authenticateUser(requesterContext, requesterEmail);
      const staff = await authenticateUser(staffContext, staffEmail);
      await createAuthenticatedRequesterTicket(requester.context, "dashboard");

      await loginThroughUi(page, requesterEmail, requester.password);
      await page.goto("/dashboard");
      await expect(page.getByRole("heading", { name: "My Dashboard" })).toBeVisible();
      await expect(page.getByRole("region", { name: "My Ticket metrics" })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Quick Actions" }).getByRole("link", { name: "Create Ticket", exact: true })).toBeVisible();
      await page.keyboard.press("Tab");
      await expect(page.locator(":focus")).toBeVisible();
      await captureLab4Screen(page, testInfo, "requester-dashboard");

      staffPage = await browser.newPage();
      await loginThroughUi(staffPage, staffEmail, staff.password);
      await staffPage.goto("/dashboard");
      await expect(staffPage.getByRole("heading", { name: "IT Staff Dashboard" })).toBeVisible();
      await expect(staffPage.getByRole("region", { name: "Dashboard metrics" })).toBeVisible();
      await expect(staffPage.getByRole("link", { name: "My Queue", exact: true })).toBeVisible();
      await staffPage.keyboard.press("Tab");
      await expect(staffPage.locator(":focus")).toBeVisible();
      await captureLab4Screen(staffPage, testInfo, "staff-dashboard");

      administratorPage = await browser.newPage();
      await loginThroughUi(administratorPage, "admin@example.test", admin.password);
      await administratorPage.goto("/dashboard");
      await expect(administratorPage.getByRole("heading", { name: "Administrator Dashboard" })).toBeVisible();
      await expect(administratorPage.getByRole("region", { name: "Dashboard metrics" })).toBeVisible();
      await expect(administratorPage.getByRole("navigation", { name: "Quick Actions" }).getByRole("link", { name: "User Management", exact: true })).toBeVisible();
      await administratorPage.keyboard.press("Tab");
      await expect(administratorPage.locator(":focus")).toBeVisible();
      await captureLab4Screen(administratorPage, testInfo, "administrator-dashboard");
    } finally {
      await staffPage?.close();
      await administratorPage?.close();
      await requesterContext.dispose();
      await staffContext.dispose();
      await admin.context.dispose();
    }
  });
});
