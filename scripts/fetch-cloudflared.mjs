#!/usr/bin/env node
/**
 * Download cloudflared for Windows.
 * Default: scripts/.bin/ (publisher tunnel scripts)
 * --tauri: packages/client-tauri/.../resources/cloudflared/win-x64/
 */
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const tauri = process.argv.includes("--tauri");
const VERSION = process.env.CLOUDFLARED_VERSION ?? "2025.2.0";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const exePath = tauri
  ? join(
      root,
      "packages/client-tauri/src-tauri/resources/cloudflared/win-x64/cloudflared.exe",
    )
  : join(root, "scripts/.bin/cloudflared.exe");

if (existsSync(exePath)) {
  console.log("cloudflared already present:", exePath);
  process.exit(0);
}

mkdirSync(dirname(exePath), { recursive: true });

const url = `https://github.com/cloudflare/cloudflared/releases/download/${VERSION}/cloudflared-windows-amd64.exe`;
console.log("Downloading", url);

const res = await fetch(url);
if (!res.ok) {
  throw new Error(`Failed to download cloudflared: ${res.status} ${res.statusText}`);
}

await pipeline(Readable.fromWeb(res.body), createWriteStream(exePath));

if (!existsSync(exePath)) {
  throw new Error("cloudflared.exe not found after download");
}

console.log("cloudflared OK:", exePath);
