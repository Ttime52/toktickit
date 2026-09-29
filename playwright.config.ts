import { defineConfig, devices } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(fileURLToPath(import.meta.url));
const useExternalServers = process.env.PLAYWRIGHT_EXTERNAL_SERVERS === "1";

const loadEnvFile = (process as typeof process & {
  loadEnvFile?: (path?: string) => void;
}).loadEnvFile;
try {
  loadEnvFile?.(resolve(repositoryRoot, "server", ".env"));
} catch {
  // CI supplies the server environment directly.
}

export default defineConfig({
  rootDir: ".",
  testDir: "./e2e/lab-03",
  outputDir: "./artifacts/lab-03/test-results",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [
    ["list"],
    ["html", { outputFolder: "artifacts/lab-03/playwright-report", open: "never" }],
  ],
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: useExternalServers ? undefined : [
    {
      command: "node e2e-server.mjs",
      cwd: resolve(repositoryRoot, "server"),
      url: "http://localhost:3000/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "node node_modules/vite/bin/vite.js --host 127.0.0.1",
      cwd: resolve(repositoryRoot, "client"),
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "tablet",
      testMatch: /responsive\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        // ui-spec.md defines the required tablet evidence as 1024x768.
        viewport: { width: 1024, height: 768 },
      },
    },
    {
      name: "mobile",
      testMatch: /responsive\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
