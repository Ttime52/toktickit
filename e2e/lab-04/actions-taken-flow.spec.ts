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

test.describe("Lab 4 Actions Taken regression", () => {
  test("records one operational action on a double click and exposes it read-only to the Requester", async ({ page, browser }, testInfo) => {
    const admin = await createAdminSession();
    const requesterContext = await createApiContext();
    const staffContext = await createApiContext();
    let requesterPage = null as Awaited<ReturnType<typeof browser.newPage>> | null;

    try {
      const requesterEmail = uniqueEmail("issue28-actions-requester");
      const staffEmail = uniqueEmail("issue28-actions-staff");
      await createManagedUser(admin.context, {
        displayName: "Issue 28 Actions Requester",
        email: requesterEmail,
        role: "REQUESTER",
        isActive: true,
      });
      await createManagedUser(admin.context, {
        displayName: "Issue 28 Actions Staff",
        email: staffEmail,
        role: "IT_STAFF",
        isActive: true,
      });

      const requester = await authenticateUser(requesterContext, requesterEmail);
      const staff = await authenticateUser(staffContext, staffEmail);
      const ticket = await createAuthenticatedRequesterTicket(requester.context, "actions-taken");

      await loginThroughUi(page, staffEmail, staff.password);
      await page.goto(`/staff/tickets/${ticket.id}`);
      await expect(page.getByRole("heading", { name: "Ticket Detail" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Actions Taken" })).toBeVisible();
      await expect(page.getByText("No Actions Taken have been recorded for this Ticket yet.", { exact: true })).toBeVisible();

      await page.getByRole("button", { name: "Add Action Taken", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Add Action Taken" })).toBeVisible();
      await page.getByLabel(/^Action Date\/Time/iu).fill(new Date(Date.now() - 60_000).toISOString().slice(0, 16));
      await page.getByLabel(/^Action Description/iu).fill("Reviewed service logs and restarted the affected process.");
      await page.getByLabel(/^Result/iu).fill("The service returned to a healthy state.");

      let createRequests = 0;
      page.on("request", (request) => {
        try {
          const pathname = new URL(request.url()).pathname;
          if (request.method() === "POST" && pathname === `/api/tickets/${ticket.id}/actions`) {
            createRequests += 1;
          }
        } catch {
          // Ignore non-HTTP requests.
        }
      });

      await page.getByRole("button", { name: "Save Action Taken", exact: true }).dblclick();
      await expect(page.getByText("Action Taken added.", { exact: true })).toBeVisible();
      await expect(page.getByText("Reviewed service logs and restarted the affected process.", { exact: true })).toBeVisible();
      expect(createRequests).toBe(1);
      await expect(page.locator(".zen-actions-summary")).toContainText("1 Action Taken");
      await captureLab4Screen(page, testInfo, "actions-taken");

      requesterPage = await browser.newPage();
      await loginThroughUi(requesterPage, requesterEmail, requester.password);
      await requesterPage.goto(`/tickets/${ticket.id}`);
      await expect(requesterPage.getByRole("heading", { name: "Ticket Detail" })).toBeVisible();
      await expect(requesterPage.getByRole("heading", { name: "Actions Taken" })).toBeVisible();
      await expect(requesterPage.getByText("Reviewed service logs and restarted the affected process.", { exact: true })).toBeVisible();
      await expect(requesterPage.getByRole("button", { name: "Add Action Taken", exact: true })).toHaveCount(0);

      const actionsResponse = await requester.context.get(`/api/tickets/${ticket.id}/actions?page=1&pageSize=100`);
      expect(actionsResponse.status()).toBe(200);
      const actionsBody = (await actionsResponse.json()) as { data: Array<{ actionDescription: string }> };
      expect(actionsBody.data).toHaveLength(1);
      expect(actionsBody.data[0]?.actionDescription).toContain("Reviewed service logs");
    } finally {
      await requesterPage?.close();
      await requesterContext.dispose();
      await staffContext.dispose();
      await admin.context.dispose();
    }
  });
});
