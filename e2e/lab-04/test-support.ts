export * from "../lab-03/test-support.js";

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertNoHorizontalOverflow,
} from "../lab-03/test-support.js";
import type { Page, TestInfo } from "@playwright/test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function viewportName(projectName: string): "desktop" | "tablet" | "mobile" {
  if (projectName === "desktop" || projectName === "tablet" || projectName === "mobile") {
    return projectName;
  }
  return "desktop";
}

export function lab4ScreenshotPath(testInfo: TestInfo, screen: string): string {
  const directory = resolve(repositoryRoot, "artifacts", "lab-04", "screenshots", screen);
  mkdirSync(directory, { recursive: true });
  const safeScreen = screen.replace(/[\\/]/gu, "-");
  return resolve(directory, `${safeScreen}-${viewportName(testInfo.project.name)}.png`);
}

export async function captureLab4Screen(
  page: Page,
  testInfo: TestInfo,
  screen: string,
): Promise<void> {
  await assertNoHorizontalOverflow(page);
  await page.screenshot({
    path: lab4ScreenshotPath(testInfo, screen),
    fullPage: true,
  });
}
