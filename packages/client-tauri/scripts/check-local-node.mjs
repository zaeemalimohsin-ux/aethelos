#!/usr/bin/env node
/**
 * Verify desktop peer-mailbox prerequisites before tauri dev/build.
 */
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const relayScript = join(root, "relay", "dist", "index.js");

let ok = true;

if (!existsSync(relayScript)) {
  console.error("Missing relay build:", relayScript);
  console.error("Run: pnpm --filter @aethelos/relay build");
  ok = false;
} else {
  console.log("Relay sidecar:", relayScript);
}

try {
  execSync("node --version", { stdio: "ignore" });
  console.log("Node.js: available");
} catch {
  console.error("Node.js not found on PATH (required to spawn relay sidecar)");
  ok = false;
}

try {
  execSync("cloudflared --version", { stdio: "ignore" });
  console.log("cloudflared: available (remote friends supported)");
} catch {
  console.warn("cloudflared not found — local mailbox only until installed");
}

process.exit(ok ? 0 : 1);
