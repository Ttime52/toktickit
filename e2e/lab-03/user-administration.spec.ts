import { expect, test } from "@playwright/test";

import {
  createAdminSession,
  completePasswordChangeThroughUi,
  e2eFinalPassword,
  loginThroughUi,
  seedInitialPassword,
  uniqueEmail,
} from "./test-support.js";

test.describe("Lab 3 administrator user management", () => {
  test("creates a User and enforces the initial-password gate at login", async ({ page, browser }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Administrator workflow runs once on desktop.");

    const admin = await createAdminSession();
    const email = uniqueEmail("admin-created-requester");
    let createdUserPage = null as Awaited<ReturnType<typeof browser.newPage>> | null;

    try {
      await loginThroughUi(page, "admin@example.test", admin.password);
      await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();

      await page.getByRole("button", { name: "Create User", exact: true }).first().click();
      await expect(page.getByRole("dialog", { name: "Create User" })).toBeVisible();
      await page.getByLabel(/^Display Name/iu).fill("Lab 3 Admin-Created Requester");
      await page.getByLabel(/^Email/iu).fill(email);
      await page.locator("#admin-user-role").selectOption("REQUESTER");
      await expect(page.locator("#admin-user-active")).toBeChecked();
      await page.getByLabel(/^Initial Password/iu).fill(seedInitialPassword());
      await page.getByLabel(/^Confirm Initial Password/iu).fill(seedInitialPassword());
      await page.getByRole("dialog", { name: "Create User" }).getByRole("button", { name: "Create User", exact: true }).click();

      await expect(page.getByRole("cell", { name: email, exact: true })).toBeVisible();

      createdUserPage = await browser.newPage();
      await loginThroughUi(createdUserPage, email, seedInitialPassword());
      await expect(createdUserPage.getByRole("heading", { name: "Change your password" })).toBeVisible();
      await expect(createdUserPage.getByRole("link", { name: "User Management", exact: true })).toHaveCount(0);

      await completePasswordChangeThroughUi(createdUserPage, seedInitialPassword(), e2eFinalPassword());
      await expect(createdUserPage.getByRole("heading", { name: "My Tickets" })).toBeVisible();
    } finally {
      await createdUserPage?.close();
      await admin.context.dispose();
    }
  });
});
