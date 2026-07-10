#!/usr/bin/env node
/**
 * Fail if the git tag being released does not match root package.json version.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const raw =
  process.argv[2] ??
  process.env.GITHUB_REF_NAME ??
  process.env.GITHUB_REF?.split("/").pop();
if (!raw) {
  console.log("check-tag-version: skip");
  process.exit(0);
}
const tagVersion = raw.replace(/^v/, "");
if (tagVersion !== pkgVersion) {
  console.error(
    `Tag version mismatch: tag ${raw} -> ${tagVersion}, package.json -> ${pkgVersion}`,
  );
  process.exit(1);
}
console.log(`Tag version OK (${tagVersion})`);
