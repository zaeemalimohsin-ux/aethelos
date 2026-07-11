#!/usr/bin/env node
/**
 * Fail if user-facing docs contain infrastructure jargon.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const userDocPaths = [
  join(root, "docs/GET_STARTED.md"),
  join(root, "docs/USER_GUIDE.md"),
  join(root, "docs/PRODUCT.md"),
  join(root, "docs/BETA_README.md"),
  join(root, "Start-AethelOS.bat"),
  join(root, "README.md"),
];

const banned = [
  /\bdocker\b/i,
  /\bcloudflared\b/i,
  /\bcloudflare\b/i,
  /\bcompose\b/i,
  /\bnginx\b/i,
  /\bpnpm\b/i,
  /\bbootstrap\b/i,
];

/** README developer section starts here — infra terms allowed below. */
const readmeDevMarker = "## Quick start";

function checkFile(path) {
  let text = readFileSync(path, "utf8");
  if (text.startsWith("---")) {
    const end = text.indexOf("---", 3);
    if (end > 0) {
      text = text.slice(end + 3);
    }
  }
  const scope =
    path.endsWith("README.md") && text.includes(readmeDevMarker)
      ? text.slice(0, text.indexOf(readmeDevMarker))
      : text;
  const hits = [];
  for (const pattern of banned) {
    if (pattern.test(scope)) {
      hits.push(pattern.source);
    }
  }
  return hits;
}

let failed = false;
for (const path of userDocPaths) {
  try {
    const hits = checkFile(path);
    if (hits.length) {
      failed = true;
      console.error(`${path}: banned terms matched: ${hits.join(", ")}`);
    }
  } catch (err) {
    console.error(`Could not read ${path}:`, err);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log("User doc jargon check OK");
