#!/usr/bin/env node
/**
 * Headless smoke: spawn relay + cloudflared tunnel, assert invite URL filtering.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const relayScript = join(root, "packages", "relay", "dist", "index.js");
const { filterRemoteRelayUrls } = await import(
  pathToFileURL(join(root, "packages", "core", "dist", "relay", "url-utils.js")).href
);
const PORT = 8787;
const TIMEOUT_MS = 120_000;

function killAll(children) {
  for (const child of children) {
    if (child && !child.killed) child.kill("SIGTERM");
  }
}

const relay = spawn(process.execPath, [relayScript, String(PORT)], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, PORT: String(PORT) },
});

const cloudflared = spawn(
  "cloudflared",
  ["tunnel", "--url", `http://127.0.0.1:${PORT}`, "--no-autoupdate"],
  { stdio: ["ignore", "pipe", "pipe"] },
);

const children = [relay, cloudflared];
let publicUrl = null;
const deadline = Date.now() + TIMEOUT_MS;

const onLine = (line) => {
  const match = line.match(/https:\/\/[^\s|]+\.trycloudflare\.com/i);
  if (match) publicUrl = match[0].replace(/\|$/, "");
};

for (const stream of [cloudflared.stdout, cloudflared.stderr]) {
  const rl = createInterface({ input: stream });
  rl.on("line", onLine);
}

async function main() {
  while (!publicUrl && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
  }

  killAll(children);

  if (!publicUrl) {
    console.error("tunnel-smoke: timed out waiting for cloudflared public URL (120s)");
    process.exit(1);
  }

  const wssUrl = publicUrl.replace(/^https:/, "wss:") + "/ws";
  const localUrl = `ws://127.0.0.1:${PORT}/ws`;
  const inviteRelays = filterRemoteRelayUrls([localUrl, wssUrl]);

  if (inviteRelays.includes(localUrl)) {
    console.error("tunnel-smoke: localhost relay was not filtered from invite list");
    process.exit(1);
  }
  if (!inviteRelays.includes(wssUrl)) {
    console.error("tunnel-smoke: public tunnel URL missing from invite list");
    process.exit(1);
  }

  console.log("tunnel-smoke: OK");
  console.log("  public tunnel:", publicUrl);
  console.log("  invite relays:", inviteRelays.join(", "));
}

main().catch((err) => {
  killAll(children);
  console.error(err);
  process.exit(1);
});

process.on("exit", () => killAll(children));
