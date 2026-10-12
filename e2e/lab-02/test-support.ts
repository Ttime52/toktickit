import { expect, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  API_BASE_URL as CURRENT_API_BASE_URL,
  PNG_BYTES,
  assertNoHorizontalOverflow,
  authenticateUser,
  createAdminSession,
  createApiContext,
  createAuthenticatedRequesterTicket,
  createManagedUser,
  loginThroughUi,
  uniqueEmail,
  type AuthenticatedSession,
} from "../lab-03/test-support";

export { PNG_BYTES, assertNoHorizontalOverflow };
export const API_BASE_URL = CURRENT_API_BASE_URL;

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export interface TicketFixture {
  id: number;
  ticketNumber: string;
  requesterId: number;
}

export interface RequesterSession {
  admin: AuthenticatedSession;
  requester: AuthenticatedSession;
  email: string;
}

/**
 * Lab 2 regression now authenticates a real User. The old development
 * requester selector was retired by the Lab 4 session/schema migration.
 */
export async function createRequesterSession(label: string): Promise<RequesterSession> {
  const admin = await createAdminSession();
  const email = uniqueEmail(`lab2-${label}`);
  await createManagedUser(admin.context, {
    displayName: `Lab 2 ${label} Requester`,
    email,
    role: "REQUESTER",
    isActive: true,
  });
  const requesterContext = await createApiContext();
  const requester = await authenticateUser(requesterContext, email);
  return { admin, requester, email };
}

export async function disposeRequesterSession(session: RequesterSession): Promise<void> {
  await session.requester.context.dispose();
  await session.admin.context.dispose();
}

export async function openRequesterWorkspace(
  page: Page,
  session: RequesterSession,
): Promise<void> {
  await loginThroughUi(page, session.email, session.requester.password);
  await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
}

export function screenshotPath(testInfo: TestInfo, screen: string): string {
  const viewportName =
    testInfo.project.name === "desktop" ||
    testInfo.project.name === "tablet" ||
    testInfo.project.name === "mobile"
      ? testInfo.project.name
      : "desktop";
  const directory = resolve(repositoryRoot, "artifacts", "lab-02", "screenshots", screen);
  mkdirSync(directory, { recursive: true });
  return resolve(directory, `${screen}-${viewportName}.png`);
}

export async function captureScreen(
  page: Page,
  testInfo: TestInfo,
  screen: string,
): Promise<void> {
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: screenshotPath(testInfo, screen), fullPage: true });
}

export async function navigateFromShell(page: Page, linkName: string): Promise<void> {
  const menuButton = page.getByRole("button", { name: "Open navigation" });
  if (await menuButton.isVisible()) {
    await menuButton.click();
  }
  await page.getByRole("link", { name: linkName, exact: true }).click();
}

export async function createFixtureTicket(
  requesterContext: RequesterSession["requester"]["context"],
  fixtureKey = "lab2-regression-fixture",
): Promise<TicketFixture> {
  return createAuthenticatedRequesterTicket(requesterContext, `lab2-${fixtureKey}`);
}

export async function waitForTicketInList(
  page: Page,
  ticketNumber: string,
): Promise<void> {
  const openButton = page.locator(`[aria-label="Open ${ticketNumber}"]:visible`);
  if (!(await openButton.isVisible())) {
    await page.getByLabel("Search Tickets").fill(ticketNumber);
  }
  await expect(openButton).toBeVisible();
}
