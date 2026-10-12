import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import {
  API_BASE_URL,
  assertNoHorizontalOverflow,
  createFixtureTicket,
  createRequesterSession,
  disposeRequesterSession,
  navigateFromShell,
  openRequesterWorkspace,
  PNG_BYTES,
  waitForTicketInList,
} from "./test-support";

const TICKETS_ROUTE = /\/api\/tickets(?:\?|$)/u;

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

function emptyListResponse() {
  return {
    data: [],
    meta: {
      page: 1,
      pageSize: 10,
      totalItems: 0,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };
}

test.describe("Lab 2 state, overflow, and recovery regression", () => {
  test("checks authenticated Create Ticket validation, file rejection, and loading state", async ({
    page,
  }, testInfo) => {
    const session = await createRequesterSession(`state-create-${testInfo.project.name}`);
    try {
      await openRequesterWorkspace(page, session);
      await navigateFromShell(page, "Create Ticket");
      await expect(page.getByRole("heading", { name: "Create Ticket" })).toBeVisible();
      await expect(page.getByLabel(/Category/u)).toBeEnabled();

      await page.getByRole("button", { name: "Create Ticket", exact: true }).click();
      await expect(
        page.getByText("Summary must be 5 to 120 characters after trimming.", {
          exact: true,
        }),
      ).toBeVisible();
      await assertNoHorizontalOverflow(page);

      await page.locator('input[type="file"]').setInputFiles({
        name: "invalid-state.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("not an allowed attachment"),
      });
      await expect(
        page.getByText(/Allowed formats are JPG, JPEG, PNG, WEBP, and PDF/iu),
      ).toBeVisible();
      await assertNoHorizontalOverflow(page);

      await page.getByLabel(/Category/u).selectOption({ index: 1 });
      await page.getByLabel(/Related System/u).selectOption({ index: 1 });
      await page.getByLabel(/Summary/u).fill("State evidence submitting Ticket");
      await page.getByLabel(/Description/u).fill(
        "This Ticket captures the submitting and success state for visual evidence.",
      );

      let releaseCreate!: () => void;
      const createGate = new Promise<void>((resolve) => {
        releaseCreate = resolve;
      });
      await page.route(TICKETS_ROUTE, async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (request.method() === "POST" && url.pathname === "/api/tickets") {
          await createGate;
        }
        await route.continue();
      });

      await page.getByRole("button", { name: "Create Ticket", exact: true }).click();
      const createButton = page.getByRole("button", { name: /Creating/iu });
      await expect(createButton).toBeVisible();
      await expect(createButton).toBeDisabled();
      await assertNoHorizontalOverflow(page);
      releaseCreate();
      await expect(page.getByRole("heading", { name: "Ticket created" })).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await page.unroute(TICKETS_ROUTE);
    } finally {
      await disposeRequesterSession(session);
    }
  });

  test("checks My Tickets loading, empty, no-results, and recoverable error states", async ({
    page,
  }, testInfo) => {
    const session = await createRequesterSession(`state-list-${testInfo.project.name}`);
    let listReleased = false;
    let releaseList!: () => void;
    const listGate = new Promise<void>((resolve) => {
      releaseList = resolve;
    });
    try {
      await page.route(TICKETS_ROUTE, async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (request.method() !== "GET" || url.pathname !== "/api/tickets") {
          await route.continue();
          return;
        }
        if (!listReleased) await listGate;
        await route.fulfill(jsonResponse(emptyListResponse()));
      });

      await openRequesterWorkspace(page, session);
      await expect(page.getByText(/Loading My Tickets/iu)).toBeVisible();
      await assertNoHorizontalOverflow(page);
      listReleased = true;
      releaseList();

      await expect(page.getByRole("heading", { name: "No Tickets yet" })).toBeVisible();
      await assertNoHorizontalOverflow(page);

      await page.getByLabel("Search Tickets").fill("state-no-results");
      await expect(
        page.getByRole("heading", { name: "No Tickets match your search" }),
      ).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await page.unroute(TICKETS_ROUTE);

      await page.route(TICKETS_ROUTE, async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (request.method() === "GET" && url.pathname === "/api/tickets") {
          await route.fulfill(
            jsonResponse(
              { error: { message: "Unable to load My Tickets. Please try again." } },
              500,
            ),
          );
          return;
        }
        await route.continue();
      });
      await page.getByLabel("Search Tickets").fill("state-error");
      await expect(page.getByRole("alert")).toContainText("Unable to load My Tickets");
      await assertNoHorizontalOverflow(page);
      await page.unroute(TICKETS_ROUTE);
    } finally {
      await disposeRequesterSession(session);
    }
  });

  test("checks long content, remove dialog focus, removed, and unavailable attachment states", async ({
    page,
  }, testInfo) => {
    const session = await createRequesterSession(`state-detail-${testInfo.project.name}`);
    try {
      const fixture = await createFixtureTicket(
        session.requester.context,
        `state-detail-${testInfo.project.name}-${randomUUID().slice(0, 8)}`,
      );

      await openRequesterWorkspace(page, session);
      await waitForTicketInList(page, fixture.ticketNumber);
      await page.locator(`[aria-label="Open ${fixture.ticketNumber}"]:visible`).first().click();
      await page.waitForURL(new RegExp(`/tickets/${fixture.id}$`, "u"));
      await expect(page.getByRole("heading", { name: "Ticket Detail" })).toBeVisible();

      const attachmentInput = page.getByLabel("Add Attachment");
      const uploadedFilename = `state-${randomUUID().slice(0, 8)}.png`;
      await attachmentInput.setInputFiles({
        name: uploadedFilename,
        mimeType: "image/png",
        buffer: PNG_BYTES,
      });
      await expect(
        page.locator(".zen-detail-attachment-row").filter({ hasText: uploadedFilename }),
      ).toContainText("Active");

      const detailResponse = await session.requester.context.get(
        `${API_BASE_URL}/api/tickets/${fixture.id}`,
      );
      expect(detailResponse.ok()).toBeTruthy();
      const detailBody = (await detailResponse.json()) as {
        data: {
          summary: string;
          description: string;
          attachments: Array<Record<string, unknown>>;
          [key: string]: unknown;
        };
      };
      const attachment = detailBody.data.attachments[0];
      if (attachment === undefined) {
        throw new Error("The detail fixture did not contain an uploaded attachment.");
      }

      const longFilename = `evidence-${"very-long-name-".repeat(16)}proof.png`;
      const longDetailBody = {
        data: {
          ...detailBody.data,
          summary: `Long summary ${"with wrapping ".repeat(8)}`,
          description: `Long description ${"that must remain readable without overflow. ".repeat(24)}`,
          attachments: [{ ...attachment, originalFilename: longFilename }],
        },
      };
      const detailRoute = new RegExp(`/api/tickets/${fixture.id}(?:\\?|$)`, "u");
      await page.route(detailRoute, async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (request.method() === "GET" && url.pathname === `/api/tickets/${fixture.id}`) {
          await route.fulfill(jsonResponse(longDetailBody));
          return;
        }
        await route.continue();
      });

      await page.getByRole("button", { name: "Back to My Tickets" }).click();
      await page.waitForURL(/\/my-tickets$/u);
      await waitForTicketInList(page, fixture.ticketNumber);
      await page.locator(`[aria-label="Open ${fixture.ticketNumber}"]:visible`).first().click();
      await page.waitForURL(new RegExp(`/tickets/${fixture.id}$`, "u"));
      await expect(page.getByText(longDetailBody.data.summary, { exact: true })).toBeVisible();
      await assertNoHorizontalOverflow(page);

      const attachmentRow = page
        .locator(".zen-detail-attachment-row")
        .filter({ hasText: longFilename });
      await attachmentRow.getByRole("button", { name: "Remove", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Remove Attachment?" });
      await expect(dialog).toBeVisible();
      await assertNoHorizontalOverflow(page);

      const reason = dialog.getByLabel(/Removal reason/iu);
      await expect(reason).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(dialog.getByRole("button", { name: "Remove Attachment" })).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(reason).toBeFocused();

      await reason.fill("Removed during visual state evidence review");
      await dialog.getByRole("button", { name: "Remove Attachment" }).click();
      const removedRow = page
        .locator(".zen-detail-attachment-row")
        .filter({ hasText: uploadedFilename });
      await expect(removedRow.getByText("Removed", { exact: true })).toBeVisible();
      await expect(removedRow).toContainText("Download unavailable");
      await expect(removedRow).toBeFocused();
      await assertNoHorizontalOverflow(page);

      await page.unroute(detailRoute);
      const removedResponse = await session.requester.context.get(
        `${API_BASE_URL}/api/tickets/${fixture.id}`,
      );
      const removedBody = (await removedResponse.json()) as {
        data: {
          attachments: Array<Record<string, unknown>>;
          [key: string]: unknown;
        };
      };
      const removedAttachment = removedBody.data.attachments[0];
      if (removedAttachment === undefined) {
        throw new Error("The detail fixture lost its attachment metadata after removal.");
      }
      const unavailableDetailBody = {
        data: {
          ...removedBody.data,
          attachments: [
            {
              ...removedAttachment,
              state: "unavailable",
              unavailableAt: "2026-09-06T00:00:00.000Z",
              unavailableReason: "Stored bytes are unavailable for this evidence state.",
              previewable: false,
              downloadUrl: null,
            },
          ],
        },
      };
      await page.route(detailRoute, async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (request.method() === "GET" && url.pathname === `/api/tickets/${fixture.id}`) {
          await route.fulfill(jsonResponse(unavailableDetailBody));
          return;
        }
        await route.continue();
      });
      await page.getByRole("button", { name: "Back to My Tickets" }).click();
      await page.waitForURL(/\/my-tickets$/u);
      await waitForTicketInList(page, fixture.ticketNumber);
      await page.locator(`[aria-label="Open ${fixture.ticketNumber}"]:visible`).first().click();
      await page.waitForURL(new RegExp(`/tickets/${fixture.id}$`, "u"));
      await expect(page.getByText("Unavailable", { exact: true })).toBeVisible();
      await expect(page.getByText("Download unavailable", { exact: true })).toBeVisible();
      await assertNoHorizontalOverflow(page);
    } finally {
      await disposeRequesterSession(session);
    }
  });
});
