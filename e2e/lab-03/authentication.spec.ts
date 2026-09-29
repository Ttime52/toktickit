import { expect, test } from "@playwright/test";

import {
  createAdminSession,
  createManagedUser,
  completePasswordChangeThroughUi,
  e2eFinalPassword,
  loginThroughUi,
  seedInitialPassword,
  uniqueEmail,
} from "./test-support.js";

test.describe("Lab 3 authentication", () => {
  test("rejects wrong and inactive credentials with a safe message", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Authentication workflow runs once on desktop.");

    const admin = await createAdminSession();
    try {
      const inactiveEmail = uniqueEmail("inactive-requester");
      await createManagedUser(admin.context, {
        displayName: "Lab 3 Inactive Requester",
        email: inactiveEmail,
        role: "REQUESTER",
        isActive: false,
      });

      await loginThroughUi(page, "admin@example.test", `${seedInitialPassword()}-wrong`);
      const wrongCredentialError = page.getByRole("alert");
      await expect(wrongCredentialError).toContainText("Unable to sign in with those details");

      await loginThroughUi(page, inactiveEmail, seedInitialPassword());
      await expect(page.getByRole("alert")).toContainText("Unable to sign in with those details");
      await expect(page.getByRole("alert")).not.toContainText(inactiveEmail);
    } finally {
      await admin.context.dispose();
    }
  });

  test("forces the first-login password change and revokes access after logout", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Authentication workflow runs once on desktop.");

    const admin = await createAdminSession();
    const email = uniqueEmail("first-login-requester");
    try {
      await createManagedUser(admin.context, {
        displayName: "Lab 3 First Login Requester",
        email,
        role: "REQUESTER",
        isActive: true,
      });

      await loginThroughUi(page, email, seedInitialPassword());
      await expect(page.getByRole("heading", { name: "Change your password" })).toBeVisible();
      await expect(page.getByRole("link", { name: "My Tickets", exact: true })).toHaveCount(0);

      const finalPassword = e2eFinalPassword();
      await completePasswordChangeThroughUi(page, seedInitialPassword(), finalPassword);
      await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Create Ticket", exact: true })).toBeVisible();

      await page.getByRole("button", { name: "Logout", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

      await page.goto("/my-tickets");
      await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    } finally {
      await admin.context.dispose();
    }
  });
});
