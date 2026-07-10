#!/usr/bin/env node
/**
 * Bundle relay + core into a single Node sidecar for Tauri release builds.
 */
import { build } from "esbuild";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const relayEntry = join(root, "packages/relay/dist/index.js");
const outDir = join(root, "packages/client-tauri/src-tauri/resources/relay");
const outfile = join(outDir, "server.cjs");

console.log("Building @aethelos/core and @aethelos/relay...");
execSync("pnpm --filter @aethelos/core build", { cwd: root, stdio: "inherit" });
execSync("pnpm --filter @aethelos/relay build", { cwd: root, stdio: "inherit" });

mkdirSync(outDir, { recursive: true });

console.log("Bundling relay sidecar ->", outfile);
await build({
  entryPoints: [relayEntry],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile,
  logLevel: "info",
});

console.log("Relay sidecar bundle OK");
