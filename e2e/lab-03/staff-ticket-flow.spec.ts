import { expect, test } from "@playwright/test";

import {
  authenticateUser,
  createAdminSession,
  createApiContext,
  createAuthenticatedRequesterTicket,
  createManagedUser,
  e2eFinalPassword,
  loginThroughUi,
  uniqueEmail,
} from "./test-support.js";

test.describe("Lab 3 IT Staff ticket flow", () => {
  test("claims a Ticket, updates work controls, and keeps Internal Notes private", async ({ page, browser }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Staff workflow runs once on desktop.");

    const admin = await createAdminSession();
    const requesterContext = await createApiContext();
    const staffContext = await createApiContext();
    let requesterPage = null as Awaited<ReturnType<typeof browser.newPage>> | null;
    let administratorPage = null as Awaited<ReturnType<typeof browser.newPage>> | null;

    try {
      const requesterEmail = uniqueEmail("staff-flow-requester");
      const staffEmail = uniqueEmail("staff-flow-agent");
      await createManagedUser(admin.context, {
        displayName: "Lab 3 Staff Flow Requester",
        email: requesterEmail,
        role: "REQUESTER",
        isActive: true,
      });
      const staff = await createManagedUser(admin.context, {
        displayName: "Lab 3 Staff Flow Agent",
        email: staffEmail,
        role: "IT_STAFF",
        isActive: true,
      });

      const requester = await authenticateUser(requesterContext, requesterEmail);
      const authenticatedStaff = await authenticateUser(staffContext, staffEmail);
      const ticket = await createAuthenticatedRequesterTicket(requester.context, "staff-flow");

      await loginThroughUi(page, staffEmail, authenticatedStaff.password);
      await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
      await page.goto("/my-tickets");
      await expect(page.getByRole("heading", { name: "You cannot view Requester Ticket screens" })).toBeVisible();
      await page.goto("/staff/tickets");
      await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
      await page.getByLabel("Search Tickets", { exact: true }).fill(ticket.ticketNumber);
      const openTicketButton = page.locator(`button[aria-label="Open ${ticket.ticketNumber}"]:visible`);
      await expect(openTicketButton).toBeVisible();
      await openTicketButton.click();
      await expect(page.getByRole("heading", { name: "Ticket Detail" })).toBeVisible();

      await expect(page.getByRole("button", { name: "Claim Ticket", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Claim Ticket", exact: true }).click();
      await expect(page.locator("#staff-detail-owner")).toHaveValue(String(authenticatedStaff.user.id));

      await page.getByLabel("IT Priority", { exact: true }).selectOption("HIGH");
      await page.getByLabel("Current Status", { exact: true }).selectOption("OPEN");
      await page.getByRole("button", { name: "Save Work Changes", exact: true }).click();
      await expect(page.locator(".zen-detail-ticket-number .zen-badge-status")).toHaveText("Open");

      const publicComment = "The IT Staff flow has a public progress update.";
      const internalNote = "The IT Staff flow recorded a private diagnostic note.";
      await page.getByLabel("Add a Public Comment", { exact: true }).fill(publicComment);
      await page.getByRole("button", { name: "Post Public Comment", exact: true }).click();
      await expect(page.getByText(publicComment, { exact: true })).toBeVisible();

      await page.getByLabel("Add an Internal Note", { exact: true }).fill(internalNote);
      await page.getByRole("button", { name: "Post Internal Note", exact: true }).click();
      await expect(page.getByText(internalNote, { exact: true })).toBeVisible();

      const commentsResponse = await requester.context.get(`/api/tickets/${ticket.id}/comments`);
      expect(commentsResponse.status()).toBe(200);
      const commentsBody = (await commentsResponse.json()) as {
        data: Array<{ content: string }>;
      };
      expect(commentsBody.data.some((comment) => comment.content === publicComment)).toBe(true);

      const notesResponse = await requester.context.get(`/api/tickets/${ticket.id}/internal-notes`);
      expect(notesResponse.status()).toBe(403);
      expect(await notesResponse.text()).not.toContain(internalNote);

      requesterPage = await browser.newPage();
      await loginThroughUi(requesterPage, requesterEmail, e2eFinalPassword());
      await requesterPage.goto(`/tickets/${ticket.id}`);
      await expect(requesterPage.getByRole("heading", { name: "Ticket Detail" })).toBeVisible();
      await expect(requesterPage.getByText(publicComment, { exact: true })).toBeVisible();
      await expect(requesterPage.getByText(internalNote, { exact: true })).toHaveCount(0);
      await expect(requesterPage.getByRole("heading", { name: "Internal Notes" })).toHaveCount(0);

      administratorPage = await browser.newPage();
      await loginThroughUi(administratorPage, "admin@example.test", admin.password);
      await administratorPage.goto("/staff/tickets");
      await expect(administratorPage.getByRole("heading", { name: "You cannot view the IT Staff Ticket Queue" })).toBeVisible();
      await administratorPage.goto(`/tickets/${ticket.id}`);
      await expect(administratorPage.getByRole("heading", { name: "Ticket Inspection" })).toBeVisible();
      await expect(administratorPage.getByText(publicComment, { exact: true })).toBeVisible();
      await expect(administratorPage.getByText(internalNote, { exact: true })).toBeVisible();
      await expect(
        administratorPage.getByText(
          "Read-only inspection. Work controls, comment/note composers and Attachment metadata are unavailable to Administrators.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(administratorPage.getByLabel("Add a Public Comment", { exact: true })).toHaveCount(0);
      await expect(administratorPage.getByLabel("Add an Internal Note", { exact: true })).toHaveCount(0);
      await expect(administratorPage.getByRole("combobox")).toHaveCount(0);
    } finally {
      await requesterPage?.close();
      await administratorPage?.close();
      await requesterContext.dispose();
      await staffContext.dispose();
      await admin.context.dispose();
    }
  });
});
