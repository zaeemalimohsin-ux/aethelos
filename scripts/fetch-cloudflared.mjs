#!/usr/bin/env node
/**
 * Download cloudflared for Windows.
 * Default: scripts/.bin/ (publisher tunnel scripts)
 * --tauri: packages/client-tauri/.../resources/cloudflared/win-x64/
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { verifySha256 } from "./sidecar-verify.mjs";

const tauri = process.argv.includes("--tauri");
const VERSION = process.env.CLOUDFLARED_VERSION ?? "2025.2.0";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checksums = JSON.parse(
  readFileSync(join(root, "scripts/sidecar-checksums.json"), "utf8"),
);
const targets = [];
if (tauri) {
  targets.push({
    path: join(
      root,
      "packages/client-tauri/src-tauri/resources/cloudflared/win-x64/cloudflared.exe",
    ),
    url: `https://github.com/cloudflare/cloudflared/releases/download/${VERSION}/cloudflared-windows-amd64.exe`,
  });
} else {
  targets.push({
    path: join(root, "scripts/.bin/cloudflared.exe"),
    url: `https://github.com/cloudflare/cloudflared/releases/download/${VERSION}/cloudflared-windows-amd64.exe`,
  });
}

for (const target of targets) {
  if (existsSync(target.path)) {
    console.log("cloudflared already present:", target.path);
    continue;
  }

  mkdirSync(dirname(target.path), { recursive: true });
  console.log("Downloading", target.url);

  const res = await fetch(target.url);
  if (!res.ok) {
    throw new Error(`Failed to download cloudflared: ${res.status} ${res.statusText}`);
  }

  await pipeline(Readable.fromWeb(res.body), createWriteStream(target.path));

  if (checksums.cloudflared.version === VERSION) {
    await verifySha256(target.path, checksums.cloudflared.sha256);
    console.log("Verified SHA-256 for cloudflared");
  } else {
    console.warn(
      `No pinned SHA-256 for cloudflared ${VERSION}; update scripts/sidecar-checksums.json`,
    );
  }

  if (!existsSync(target.path)) {
    throw new Error("cloudflared binary not found after download");
  }

  console.log("cloudflared OK:", target.path);
}
