#!/usr/bin/env node
/**
 * Backward-compatible wrapper — delegates to prepare-release-client.mjs.
 */
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
execSync(`node scripts/prepare-release-client.mjs ${args.join(" ")}`, {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
