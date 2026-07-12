#!/usr/bin/env node
/**
 * Ensure release version strings match across root, client, and desktop packages.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readJsonVersion(relPath) {
  const data = JSON.parse(readFileSync(join(root, relPath), "utf8"));
  if (!data.version) throw new Error(`Missing version in ${relPath}`);
  return data.version;
}

function readCargoVersion(relPath) {
  const text = readFileSync(join(root, relPath), "utf8");
  const match = text.match(/^version\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error(`Missing version in ${relPath}`);
  return match[1];
}

function readTauriVersion(relPath) {
  const data = JSON.parse(readFileSync(join(root, relPath), "utf8"));
  if (!data.version) throw new Error(`Missing version in ${relPath}`);
  return data.version;
}

function readCargoLockPackageVersion(packageName) {
  const text = readFileSync(
    join(root, "packages/client-tauri/src-tauri/Cargo.lock"),
    "utf8",
  );
  const re = new RegExp(`name = "${packageName}"\\s+version = "([^"]+)"`, "m");
  const match = text.match(re);
  if (!match) {
    throw new Error(`Package ${packageName} not found in Cargo.lock`);
  }
  return match[1];
}

const expected = readJsonVersion("package.json");
const checks = [
  ["packages/client/package.json", readJsonVersion("packages/client/package.json")],
  ["packages/core/package.json", readJsonVersion("packages/core/package.json")],
  ["packages/relay/package.json", readJsonVersion("packages/relay/package.json")],
  [
    "packages/client-tauri/package.json",
    readJsonVersion("packages/client-tauri/package.json"),
  ],
  [
    "packages/client-tauri/src-tauri/Cargo.toml",
    readCargoVersion("packages/client-tauri/src-tauri/Cargo.toml"),
  ],
  [
    "packages/client-tauri/src-tauri/tauri.conf.json",
    readTauriVersion("packages/client-tauri/src-tauri/tauri.conf.json"),
  ],
  [
    "packages/client-tauri/src-tauri/Cargo.lock (aethelos-desktop)",
    readCargoLockPackageVersion("aethelos-desktop"),
  ],
];

const mismatches = checks.filter(([, version]) => version !== expected);
if (mismatches.length > 0) {
  console.error(`Expected version ${expected} everywhere. Mismatches:`);
  for (const [label, version] of mismatches) {
    console.error(`  ${label}: ${version}`);
  }
  process.exit(1);
}

console.log(`Version sync OK (${expected})`);
