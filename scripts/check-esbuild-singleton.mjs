#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const lock = readFileSync(join(root, "pnpm-lock.yaml"), "utf8");
const versions = new Set();
for (const line of lock.split("\n")) {
  if (/^  esbuild@/.test(line)) versions.add(line.trim());
}
if (versions.size > 2) {
  console.error("Too many esbuild versions in lockfile:", [...versions]);
  process.exit(1);
}
console.log(`esbuild lockfile entries: ${versions.size} (max 2 allowed)`);
