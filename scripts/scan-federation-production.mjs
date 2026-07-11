#!/usr/bin/env node
/**
 * Fail if a production client bundle lacks federation-on UI copy.
 * Usage: node scripts/scan-federation-production.mjs <dir> [dir...]
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const MARKER = "New people join through linked";
const roots = process.argv.slice(2);
if (roots.length === 0) {
  console.error("Usage: node scripts/scan-federation-production.mjs <directory> [...]");
  process.exit(1);
}

function walkJs(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkJs(p, out);
    else if (name.endsWith(".js")) out.push(p);
  }
  return out;
}

let failed = false;
for (const root of roots) {
  if (!existsSync(root)) {
    console.error(`FAIL: directory not found: ${root}`);
    failed = true;
    continue;
  }
  const hasMarker = walkJs(root).some((file) =>
    readFileSync(file, "utf8").includes(MARKER),
  );
  if (!hasMarker) {
    console.error(`FAIL: federation-on UI missing in ${root}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("OK: federation-on UI present in scanned bundles");
