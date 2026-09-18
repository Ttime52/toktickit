import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Lab integration suites share the disposable PostgreSQL database.
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
  },
});
