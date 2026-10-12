import { expect, test } from "@playwright/test";

import {
  authenticateUser,
  createAdminSession,
  createApiContext,
  createAuthenticatedRequesterTicket,
  createManagedUser,
  e2eFinalPassword,
  loginThroughUi,
  PNG_BYTES,
  seedInitialPassword,
  uniqueEmail,
} from "./test-support.js";

test.describe("Lab 2/3 current-schema regression", () => {
  test("preserves authenticated ownership, Attachments, Public Comments, and Internal Notes", async ({ page }) => {
    const admin = await createAdminSession();
    const requesterContext = await createApiContext();
    const otherRequesterContext = await createApiContext();
    const staffContext = await createApiContext();

    try {
      const requesterEmail = uniqueEmail("lab23-regression-requester");
      const otherRequesterEmail = uniqueEmail("lab23-regression-other");
      const staffEmail = uniqueEmail("lab23-regression-staff");
      await createManagedUser(admin.context, {
        displayName: "Lab 2/3 Regression Requester",
        email: requesterEmail,
        role: "REQUESTER",
        isActive: true,
      });
      await createManagedUser(admin.context, {
        displayName: "Lab 2/3 Regression Other Requester",
        email: otherRequesterEmail,
        role: "REQUESTER",
        isActive: true,
      });
      await createManagedUser(admin.context, {
        displayName: "Lab 2/3 Regression Staff",
        email: staffEmail,
        role: "IT_STAFF",
        isActive: true,
      });

      const requester = await authenticateUser(requesterContext, requesterEmail);
      const otherRequester = await authenticateUser(otherRequesterContext, otherRequesterEmail);
      const staff = await authenticateUser(staffContext, staffEmail);
      const ticket = await createAuthenticatedRequesterTicket(requester.context, "lab23-regression");

      const foreignTicket = await otherRequester.context.get(`/api/tickets/${ticket.id}`);
      expect(foreignTicket.status()).toBe(404);

      const upload = await requester.context.post(`/api/tickets/${ticket.id}/attachments`, {
        multipart: {
          file: {
            name: "lab23-regression.png",
            mimeType: "image/png",
            buffer: PNG_BYTES,
          },
        },
      });
      expect(upload.status()).toBe(201);
      expect((await upload.json()).data.originalFilename).toBe("lab23-regression.png");

      const publicComment = "Lab 2/3 regression public update.";
      const internalNote = "Lab 2/3 regression private note.";
      expect(
        (await staff.context.post(`/api/tickets/${ticket.id}/comments`, {
          data: { content: publicComment },
        })).status(),
      ).toBe(201);
      expect(
        (await staff.context.post(`/api/tickets/${ticket.id}/internal-notes`, {
          data: { content: internalNote },
        })).status(),
      ).toBe(201);

      const requesterNotes = await requester.context.get(`/api/tickets/${ticket.id}/internal-notes`);
      expect(requesterNotes.status()).toBe(403);
      expect(await requesterNotes.text()).not.toContain(internalNote);

      await loginThroughUi(page, requesterEmail, requester.password);
      await page.goto(`/tickets/${ticket.id}`);
      await expect(page.getByRole("heading", { name: "Ticket Detail" })).toBeVisible();
      await expect(page.getByText("lab23-regression.png", { exact: true })).toBeVisible();
      await expect(page.getByText(publicComment, { exact: true })).toBeVisible();
      await expect(page.getByText(internalNote, { exact: true })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Internal Notes" })).toHaveCount(0);
    } finally {
      await requesterContext.dispose();
      await otherRequesterContext.dispose();
      await staffContext.dispose();
      await admin.context.dispose();
    }
  });

  test("preserves Administrator User Management and role authorization", async ({ page }) => {
    const admin = await createAdminSession();
    const requesterContext = await createApiContext();

    try {
      const requesterEmail = uniqueEmail("lab23-user-management-requester");
      await createManagedUser(admin.context, {
        displayName: "Lab 2/3 User Management Requester",
        email: requesterEmail,
        role: "REQUESTER",
        isActive: true,
      });
      const requester = await authenticateUser(requesterContext, requesterEmail);
      expect((await requester.context.get("/api/users")).status()).toBe(403);

      const createdEmail = uniqueEmail("lab23-admin-created");
      await loginThroughUi(page, "admin@example.test", admin.password);
      await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
      await page.getByRole("button", { name: "Create User", exact: true }).first().click();
      await expect(page.getByRole("dialog", { name: "Create User" })).toBeVisible();
      await page.getByLabel(/^Display Name/iu).fill("Lab 2/3 Admin-Created User");
      await page.getByLabel(/^Email/iu).fill(createdEmail);
      await page.locator("#admin-user-role").selectOption("REQUESTER");
      await page.getByLabel(/^Initial Password/iu).fill(seedInitialPassword());
      await page.getByLabel(/^Confirm Initial Password/iu).fill(seedInitialPassword());
      await page
        .getByRole("dialog", { name: "Create User" })
        .getByRole("button", { name: "Create User", exact: true })
        .click();

      await expect(
        page.locator("td:visible, dd:visible").filter({ hasText: createdEmail }),
      ).toBeVisible();
      expect(e2eFinalPassword()).not.toBe(seedInitialPassword());
    } finally {
      await requesterContext.dispose();
      await admin.context.dispose();
    }
  });
});
