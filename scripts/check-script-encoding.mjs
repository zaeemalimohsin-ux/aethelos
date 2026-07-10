#!/usr/bin/env node
/**
 * Fail if tracked source files contain UTF-16 null bytes (Windows Write tool regression).
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir, predicate, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, predicate, out);
    else if (predicate(name, p)) out.push(p);
  }
  return out;
}

const files = [
  ...walk(join(root, "scripts"), (name) => name.endsWith(".mjs") || name.endsWith(".sh")),
  ...walk(join(root, "packages/client/e2e"), (name) => name.endsWith(".spec.ts")),
  ...walk(join(root, "packages/client"), (name, p) =>
    /playwright.*\.config\.ts$/.test(name),
  ),
  join(root, "packages/client/src/app/pilot-features.ts"),
].filter((p) => existsSync(p));

let failed = false;
for (const file of files) {
  const buf = readFileSync(file);
  if (buf.includes(0)) {
    console.error(`FAIL: ${file} looks UTF-16 or contains null bytes`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log(`OK: ${files.length} files are UTF-8 safe`);
