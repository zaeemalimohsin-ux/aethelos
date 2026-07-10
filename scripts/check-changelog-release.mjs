#!/usr/bin/env node
/**
 * Fail if CHANGELOG.md has no section for the release version being tagged.
 * Usage: node scripts/check-changelog-release.mjs [version]
 * Version defaults to root package.json (without v prefix).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version =
  process.argv[2] ?? JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
const heading = `## [${version}]`;
if (!changelog.includes(heading)) {
  console.error(
    `CHANGELOG.md missing section "${heading}" — add release notes before tagging v${version}.`,
  );
  process.exit(1);
}

console.log(`CHANGELOG OK for ${version}`);
