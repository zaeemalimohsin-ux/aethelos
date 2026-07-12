#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const clientDir = join(root, "packages/client");

const viteEnv = { ...process.env };
for (const [key, value] of Object.entries(process.env)) {
  if (key.startsWith("VITE_")) viteEnv[key] = value;
}

const vite = spawn("pnpm", ["exec", "vite"], {
  cwd: clientDir,
  env: viteEnv,
  stdio: "inherit",
  shell: true,
});

const relay = spawn("pnpm", ["--filter", "@aethelos/relay", "dev"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
  shell: true,
});

function shutdown(code = 0) {
  vite.kill("SIGTERM");
  relay.kill("SIGTERM");
  process.exit(code);
}

process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));

async function waitForHealth(url, maxMs = 120_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

try {
  await waitForHealth("http://127.0.0.1:5173/");
  await waitForHealth("http://127.0.0.1:8787/healthz");
  console.log("[start-e2e-stack] Vite and relay ready");
} catch (err) {
  console.error("[start-e2e-stack]", err);
  shutdown(1);
}

await new Promise(() => {});
