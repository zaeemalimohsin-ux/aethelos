#!/usr/bin/env node
/**
 * Fail if scripts/*.mjs or scripts/*.sh contain UTF-16 null bytes (Windows Write tool regression).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const scriptsDir = join(root, "scripts");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith(".mjs") || name.endsWith(".sh")) out.push(p);
  }
  return out;
}

let failed = false;
for (const file of walk(scriptsDir)) {
  const buf = readFileSync(file);
  if (buf.includes(0)) {
    console.error(`FAIL: ${file} looks UTF-16 or contains null bytes`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("OK: scripts are UTF-8 safe");
