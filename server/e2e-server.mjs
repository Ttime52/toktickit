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

await import(pathToFileURL(resolve(serverRoot, "dist", "src", "index.js")).href);
