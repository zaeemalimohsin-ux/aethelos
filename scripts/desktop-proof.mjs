#!/usr/bin/env node
/**
 * Automated desktop remote-path proof (same backend as Tauri desktop:dev).
 * Verifies: invite URL filtering, two-person E2E sync, Rust local_node tunnel.
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

function freeRelayPort() {
  if (process.platform !== "win32") return;
  spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      "Get-NetTCPConnection -LocalPort 8787 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue",
    ],
    { stdio: "ignore" },
  );
}

run("tunnel-smoke", "node", ["scripts/tunnel-smoke.mjs"]);
freeRelayPort();
await new Promise((r) => setTimeout(r, 3000));

const e2eEnv = {
  ...process.env,
  CI: "1",
  PLAYWRIGHT_BROWSERS_PATH:
    process.env.PLAYWRIGHT_BROWSERS_PATH ??
    join(process.env.LOCALAPPDATA ?? "", "ms-playwright"),
};
console.log("\n== two-person E2E ==");
const e2eCmd =
  'pnpm --filter @aethelos/client test:e2e -- community.spec.ts -g "founder and joiner converge"';
const e2e = spawnSync(e2eCmd, {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: e2eEnv,
});
if (e2e.status !== 0) {
  console.error(`desktop-proof: two-person E2E failed (exit ${e2e.status})`);
  process.exit(e2e.status ?? 1);
}

freeRelayPort();
await new Promise((r) => setTimeout(r, 3000));

run(
  "tauri local_node",
  "cargo",
  ["test", "local_node::tests", "--", "--nocapture"],
  { cwd: join(root, "packages", "client-tauri", "src-tauri"), shell: false },
);

console.log("\ndesktop-proof: OK (tunnel invite + two-person sync + Tauri local_node)");
