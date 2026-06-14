#!/usr/bin/env node
/**
 * Internal release gate before tagging.
 */
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd) {
  console.log("\n>>", cmd);
  execSync(cmd, { cwd: root, stdio: "inherit" });
}

run("pnpm typecheck");
run("pnpm test");
run("node scripts/check-user-docs.mjs");
run("pnpm test:e2e");

if (process.platform === "win32") {
  run(
    "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/proof-product.ps1 -SkipRelease -SkipPreflight -SkipStaticGates",
  );
} else {
  console.log("\n>> proof-product.ps1 skipped (Windows-only desktop/Android proof)");
}

console.log("\nRelease verification passed.");
