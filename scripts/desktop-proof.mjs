#!/usr/bin/env node
/**
 * Automated desktop remote-path proof (same backend as Tauri desktop:dev).
 * Verifies: Rust local_node tunnel, invite URL filtering, two-person E2E sync.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(label, cmd, args, opts = {}) {
  console.log(`\n== ${label} ==`);
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts,
  });
  if (r.status !== 0) {
    console.error(`desktop-proof: ${label} failed (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

run("tunnel-smoke", "node", ["scripts/tunnel-smoke.mjs"]);
run(
  "tauri local_node",
  "cargo",
  ["test", "local_node::tests", "--", "--nocapture"],
  { cwd: join(root, "packages", "client-tauri", "src-tauri") },
);
run("two-person E2E", "pnpm", [
  "--filter",
  "@aethelos/client",
  "test:e2e",
  "--",
  "community.spec.ts",
  "-g",
  "founder and joiner converge",
], {
  env: {
    ...process.env,
    CI: "1",
    PLAYWRIGHT_BROWSERS_PATH:
      process.env.PLAYWRIGHT_BROWSERS_PATH ??
      join(process.env.LOCALAPPDATA ?? "", "ms-playwright"),
  },
});

console.log("\ndesktop-proof: OK (Tauri local_node + tunnel invite + two-person sync)");
