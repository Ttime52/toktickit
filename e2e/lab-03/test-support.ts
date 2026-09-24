import {
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Playwright runs in a separate Node process from Prisma. Loading the local
// server environment here keeps the E2E command convenient without placing a
// password in source control. Shell variables still take precedence.
const loadEnvFile = (process as typeof process & {
  loadEnvFile?: (path?: string) => void;
}).loadEnvFile;
try {
  loadEnvFile?.(resolve(repositoryRoot, "server", ".env"));
} catch {
  // CI can provide the variables directly instead of using server/.env.
}

export const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3000";
export const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

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

export type UserRole = "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR";

export interface AuthUser {
  id: number;
  displayName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
}

export interface ManagedUser extends AuthUser {
  createdAt: string;
  updatedAt: string;
}

export interface TicketFixture {
  id: number;
  ticketNumber: string;
  requesterId: number;
}

export interface AuthenticatedSession {
  context: APIRequestContext;
  user: AuthUser;
  password: string;
}

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} must be set for Lab 3 E2E tests; do not hardcode credentials.`);
  }
  return value;
}

export function seedInitialPassword(): string {
  return requiredEnv("LAB3_SEED_INITIAL_PASSWORD");
}

export function e2eFinalPassword(): string {
  const value = requiredEnv("LAB3_E2E_PASSWORD");
  if (value === seedInitialPassword()) {
    throw new Error("LAB3_E2E_PASSWORD must differ from LAB3_SEED_INITIAL_PASSWORD.");
  }
  return value;
}

export async function createApiContext(): Promise<APIRequestContext> {
  return playwrightRequest.newContext({
    baseURL: API_BASE_URL,
    extraHTTPHeaders: { Origin: CLIENT_ORIGIN },
    timeout: 15_000,
  });
}

async function loginResponse(
  context: APIRequestContext,
  email: string,
  password: string,
) {
  return context.post("/api/auth/login", { data: { email, password } });
}

function authUserFromBody(body: unknown): AuthUser {
  if (
    typeof body !== "object" ||
    body === null ||
    !("data" in body) ||
    typeof body.data !== "object" ||
    body.data === null ||
    !("user" in body.data)
  ) {
    throw new Error("The authentication response did not contain a user identity.");
  }
  return body.data.user as AuthUser;
}

export async function authenticateUser(
  context: APIRequestContext,
  email: string,
): Promise<AuthenticatedSession> {
  const initialPassword = seedInitialPassword();
  const finalPassword = e2eFinalPassword();
  const candidates = [initialPassword, finalPassword].filter(
    (password, index, values) => values.indexOf(password) === index,
  );

  for (const password of candidates) {
    const response = await loginResponse(context, email, password);
    if (response.status() === 401) continue;
    expect(response.status(), `Unable to authenticate ${email}`).toBe(200);

    let user = authUserFromBody(await response.json());
    if (user.mustChangePassword) {
      const changed = await context.post("/api/auth/change-password", {
        data: { currentPassword: password, newPassword: finalPassword },
      });
      expect(changed.status(), `Unable to complete password change for ${email}`).toBe(200);
      user = authUserFromBody(await changed.json());
      return { context, user, password: finalPassword };
    }
    return { context, user, password };
  }

  throw new Error(`Unable to authenticate ${email} with the configured E2E credentials.`);
}

export async function createAdminSession(): Promise<AuthenticatedSession> {
  const context = await createApiContext();
  return authenticateUser(context, "admin@example.test");
}

export async function createManagedUser(
  adminContext: APIRequestContext,
  options: {
    displayName: string;
    email?: string;
    role: UserRole;
    isActive: boolean;
  },
): Promise<ManagedUser> {
  const response = await adminContext.post("/api/users", {
    data: {
      displayName: options.displayName,
      email: options.email ?? uniqueEmail(options.displayName),
      role: options.role,
      isActive: options.isActive,
      initialPassword: seedInitialPassword(),
    },
  });
  expect(response.status(), "Admin user creation should succeed").toBe(201);
  const body = (await response.json()) as { data: ManagedUser };
  return body.data;
}

export function uniqueEmail(label: string): string {
  const normalized = label.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
  const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  return `lab3-e2e-${normalized || "user"}-${suffix}@example.test`;
}

export function uniqueKey(label: string): string {
  return `lab3-e2e-${label}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`.slice(0, 64);
}

export async function createAuthenticatedRequesterTicket(
  context: APIRequestContext,
  label: string,
): Promise<TicketFixture> {
  const [categoriesResponse, systemsResponse] = await Promise.all([
    context.get("/api/categories?active=true"),
    context.get("/api/related-systems?active=true"),
  ]);
  expect(categoriesResponse.status()).toBe(200);
  expect(systemsResponse.status()).toBe(200);
  const categories = (await categoriesResponse.json()) as Array<{ id: number }>;
  const systems = (await systemsResponse.json()) as Array<{ id: number }>;
  const category = categories[0];
  const system = systems[0];
  if (category === undefined || system === undefined) {
    throw new Error("Reference data is missing for the Lab 3 E2E ticket.");
  }

  const response = await context.post("/api/tickets", {
    headers: { "Idempotency-Key": uniqueKey(label) },
    data: {
      categoryId: category.id,
      relatedSystemId: system.id,
      requestedPriority: "MEDIUM",
      summary: `Lab 3 E2E ${label} ticket`,
      description: "This authenticated E2E ticket exercises the Lab 3 regression workflow.",
    },
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as {
    data: { id: number; ticketNumber: string; requester: { id: number } };
  };
  return {
    id: body.data.id,
    ticketNumber: body.data.ticketNumber,
    requesterId: body.data.requester.id,
  };
}

export async function loginThroughUi(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/");
  await page.getByLabel(/^Email/iu).fill(email);
  await page.getByLabel(/^Password/iu).fill(password);
  const loginResponse = page.waitForResponse((response) => {
    try {
      return new URL(response.url()).pathname === "/api/auth/login";
    } catch {
      return false;
    }
  });
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await loginResponse;
}

export async function completePasswordChangeThroughUi(
  page: Page,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await page.getByLabel(/^Current password/iu).fill(currentPassword);
  await page.getByLabel(/^New password/iu).fill(newPassword);
  await page.getByLabel(/^Confirm new password/iu).fill(newPassword);
  const changeResponse = page.waitForResponse((response) => {
    try {
      return new URL(response.url()).pathname === "/api/auth/change-password";
    } catch {
      return false;
    }
  });
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await changeResponse;
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

function projectViewportName(projectName: string): "desktop" | "tablet" | "mobile" {
  if (projectName === "desktop" || projectName === "tablet" || projectName === "mobile") {
    return projectName;
  }
  return "desktop";
}

export function screenshotPath(testInfo: TestInfo, screen: string): string {
  const directory = resolve(repositoryRoot, "artifacts", "lab-03", "screenshots", screen);
  mkdirSync(directory, { recursive: true });
  const fileName = screen.replace(/[\\/]/gu, "-");
  return resolve(directory, `${fileName}-${projectViewportName(testInfo.project.name)}.png`);
}

export async function captureScreen(
  page: Page,
  testInfo: TestInfo,
  screen: string,
): Promise<void> {
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: screenshotPath(testInfo, screen), fullPage: true });
}
