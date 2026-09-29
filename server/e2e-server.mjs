import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const serverRoot = resolve(fileURLToPath(new URL(".", import.meta.url)));
const loadEnvFile = process.loadEnvFile;
try {
  loadEnvFile?.(resolve(serverRoot, ".env"));
} catch {
  // CI can provide the environment directly.
}

const build = spawnSync(
  process.execPath,
  [resolve(serverRoot, "node_modules", "typescript", "bin", "tsc"), "-p", resolve(serverRoot, "tsconfig.json")],
  {
  cwd: serverRoot,
  env: process.env,
  stdio: "inherit",
  },
);

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const { app } = await import(pathToFileURL(resolve(serverRoot, "dist", "src", "app.js")).href);
const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, () => {
  console.log(`TokTickIT E2E API listening on http://localhost:${port}`);
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close((error) => {
    if (error) {
      console.error("Failed to close the E2E API server.", error);
      process.exitCode = 1;
    }
    process.exit();
  });
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
