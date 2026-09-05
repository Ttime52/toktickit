import { expect, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const API_BASE_URL = "http://127.0.0.1:3000";
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// A small, valid 1x1 PNG used by the attachment lifecycle E2E test.
export const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0xf0,
  0x1f, 0x00, 0x05, 0x00, 0x01, 0xff, 0x89, 0x99,
  0x3d, 0x1d, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
  0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

interface RequesterFixture {
  id: number;
  displayName: string;
  email: string;
}

export interface TicketFixture {
  id: number;
  ticketNumber: string;
  requesterId: number;
}

function projectViewportName(projectName: string): "desktop" | "tablet" | "mobile" {
  if (projectName === "desktop" || projectName === "tablet" || projectName === "mobile") {
    return projectName;
  }
  return "desktop";
}

export function screenshotPath(testInfo: TestInfo, screen: string): string {
  const viewportName = projectViewportName(testInfo.project.name);
  const directory = resolve(
    repositoryRoot,
    "artifacts",
    "lab-02",
    "screenshots",
    screen,
  );
  mkdirSync(directory, { recursive: true });
  return resolve(directory, `${screen}-${viewportName}.png`);
}

export async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
    overflowingElements: Array.from(document.body.querySelectorAll("*"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: typeof element.className === "string" ? element.className : "",
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      })
      .filter(({ width, right }) => width > 0 && right > window.innerWidth + 1)
      .sort((left, right) => right.right - left.right)
      .slice(0, 8),
  }));

  const message = JSON.stringify(dimensions.overflowingElements);
  expect(dimensions.documentScrollWidth, message).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  expect(dimensions.bodyScrollWidth, message).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
}

export async function captureScreen(
  page: Page,
  testInfo: TestInfo,
  screen: string,
): Promise<void> {
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: screenshotPath(testInfo, screen), fullPage: true });
}

export async function openRequesterSelection(page: Page): Promise<void> {
  await page.goto("/select-requester");
  await expect(
    page.getByRole("heading", { name: "Development Requester Selection" }),
  ).toBeVisible();
}

export async function selectFirstRequester(page: Page): Promise<RequesterFixture> {
  const requesterSelect = page.getByRole("combobox", {
    name: "Development Requester",
  });
  await expect(requesterSelect).toBeEnabled();

  const firstRequesterOption = requesterSelect.locator("option").nth(1);
  const requesterId = await firstRequesterOption.getAttribute("value");
  const optionText = await firstRequesterOption.textContent();
  if (requesterId === null || optionText === null) {
    throw new Error("The active requester selector did not contain an option.");
  }

  await requesterSelect.selectOption(requesterId);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/my-tickets$/u);

  const match = optionText.match(/^(.*?)\s+\(([^)]+)\)$/u);
  return {
    id: Number(requesterId),
    displayName: match?.[1] ?? optionText,
    email: match?.[2] ?? "",
  };
}

export async function navigateFromShell(page: Page, linkName: string): Promise<void> {
  const menuButton = page.getByRole("button", { name: "Open navigation" });
  if (await menuButton.isVisible()) {
    await menuButton.click();
  }
  await page.getByRole("link", { name: linkName, exact: true }).click();
}

export async function createFixtureTicket(
  request: APIRequestContext,
  fixtureKey = "issue7-shared-fixture",
): Promise<TicketFixture> {
  const requestersResponse = await request.get(`${API_BASE_URL}/api/requesters`);
  expect(requestersResponse.ok()).toBeTruthy();
  const requesters = (await requestersResponse.json()) as RequesterFixture[];
  const requester = requesters[0];
  if (requester === undefined) {
    throw new Error("No active requester is available for the E2E fixture.");
  }

  const [categoriesResponse, systemsResponse] = await Promise.all([
    request.get(`${API_BASE_URL}/api/categories`),
    request.get(`${API_BASE_URL}/api/related-systems`),
  ]);
  expect(categoriesResponse.ok()).toBeTruthy();
  expect(systemsResponse.ok()).toBeTruthy();

  const categories = (await categoriesResponse.json()) as Array<{ id: number }>;
  const systems = (await systemsResponse.json()) as Array<{ id: number }>;
  const category = categories[0];
  const system = systems[0];
  if (category === undefined || system === undefined) {
    throw new Error("Reference data is missing for the E2E fixture.");
  }

  const idempotencyKey = `issue7-${fixtureKey}`.slice(0, 64);
  const response = await request.post(`${API_BASE_URL}/api/tickets`, {
    headers: { "Idempotency-Key": idempotencyKey },
    data: {
      requesterId: requester.id,
      categoryId: category.id,
      relatedSystemId: system.id,
      requestedPriority: "MEDIUM",
      summary: `Issue 7 ${fixtureKey} fixture`,
      description:
        "A deterministic fixture ticket keeps the responsive and visual checks populated.",
    },
  });
  expect([200, 201]).toContain(response.status());
  const body = (await response.json()) as {
    data: { id: number; ticketNumber: string; requester: { id: number } };
  };
  const ticket = body.data;
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    requesterId: ticket.requester.id,
  };
}

export async function waitForTicketInList(
  page: Page,
  ticketNumber: string,
): Promise<void> {
  const openButton = page.locator(
    `[aria-label="Open ${ticketNumber}"]:visible`,
  );
  await expect(openButton).toBeVisible();
}
