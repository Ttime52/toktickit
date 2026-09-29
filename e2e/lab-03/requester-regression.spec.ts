import { expect, test } from "@playwright/test";

import {
  authenticateUser,
  createAdminSession,
  createManagedUser,
  createApiContext,
  e2eFinalPassword,
  loginThroughUi,
  PNG_BYTES,
  uniqueEmail,
} from "./test-support.js";

test.describe("Lab 3 requester regression", () => {
  test("creates, lists, opens and attaches a Ticket using authenticated identity", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Requester regression runs once on desktop.");

    const admin = await createAdminSession();
    const requesterEmail = uniqueEmail("requester-regression");
    const requesterContext = await createApiContext();
    let createPayload: Record<string, unknown> | undefined;

    try {
      await createManagedUser(admin.context, {
        displayName: "Lab 3 Requester Regression",
        email: requesterEmail,
        role: "REQUESTER",
        isActive: true,
      });
      const requester = await authenticateUser(requesterContext, requesterEmail);
      const finalPassword = e2eFinalPassword();

      page.on("request", (request) => {
        if (request.method() !== "POST") return;
        try {
          const pathname = new URL(request.url()).pathname;
          if (pathname === "/api/tickets") {
            createPayload = request.postDataJSON() as Record<string, unknown>;
          }
        } catch {
          // Non-JSON requests, such as multipart attachments, are irrelevant here.
        }
      });

      await loginThroughUi(page, requesterEmail, finalPassword);
      await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Create Ticket", exact: true })).toBeVisible();
      await expect(page.getByText(/Development Requester|Change Requester/iu)).toHaveCount(0);

      await page.goto("/select-requester");
      await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
      await expect(page.getByText("Development Requester Selection")).toHaveCount(0);

      await page.getByRole("link", { name: "Create Ticket", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Create Ticket" })).toBeVisible();

      await page.getByLabel(/^Category/iu).selectOption({ index: 1 });
      await page.getByLabel(/^Related System/iu).selectOption({ index: 1 });
      await page.getByLabel(/^Summary/iu).fill("Authenticated identity regression ticket");
      await page.getByLabel(/^Description/iu).fill(
        "This ticket confirms that the requester is derived from the authenticated session.",
      );
      await page.getByLabel("Choose files", { exact: true }).setInputFiles({
        name: "regression-evidence.png",
        mimeType: "image/png",
        buffer: PNG_BYTES,
      });
      await page.getByRole("button", { name: "Create Ticket", exact: true }).click();

      await expect(page.getByRole("heading", { name: "Ticket created" })).toBeVisible();
      await expect(page.getByText("Uploaded / Active", { exact: true })).toBeVisible();
      expect(createPayload).toBeDefined();
      expect(createPayload).not.toHaveProperty("requesterId");

      const ticketNumber = (await page.locator(".zen-success-panel strong").textContent())?.trim();
      expect(ticketNumber).toMatch(/^TT-/u);

      await page.getByRole("button", { name: "View Ticket", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Ticket Detail" })).toBeVisible();
      await expect(page.getByText("regression-evidence.png", { exact: true })).toBeVisible();

      await page.getByRole("link", { name: "My Tickets", exact: true }).click();
      await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
      await page.getByLabel("Search Tickets", { exact: true }).fill(ticketNumber as string);
      const openButton = page.locator(`button[aria-label="Open ${ticketNumber}"]:visible`);
      await expect(openButton).toBeVisible();
      await openButton.click();
      await expect(page.getByRole("heading", { name: "Ticket Detail" })).toBeVisible();
      await expect(page.getByText("regression-evidence.png", { exact: true })).toBeVisible();
      expect(requester.user.id).toBeGreaterThan(0);
    } finally {
      await requesterContext.dispose();
      await admin.context.dispose();
    }
  });
});
