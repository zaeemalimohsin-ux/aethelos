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
const androidOutDir = join(root, "packages/client/android/app/src/main/assets/nodejs-project");
const androidOutfile = join(androidOutDir, "main.js");

console.log("Building @aethelos/core and @aethelos/relay...");
execSync("pnpm --filter @aethelos/core build", { cwd: root, stdio: "inherit" });
execSync("pnpm --filter @aethelos/relay build", { cwd: root, stdio: "inherit" });

mkdirSync(outDir, { recursive: true });
mkdirSync(androidOutDir, { recursive: true });

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

console.log("Bundling relay sidecar for Android ->", androidOutfile);
await build({
  entryPoints: [relayEntry],
  bundle: true,
  platform: "node",
  target: "node18", // Capacitor Node.js usually ships Node 18 or 16
  format: "cjs",
  outfile: androidOutfile,
  logLevel: "info",
});

console.log("Relay sidecar bundle OK");
