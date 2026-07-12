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

function cargoVersionForRelease(npmVersion) {
  const parts = npmVersion.split(".");
  if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
    return `${parts[0]}.${parts[1]}.${parts[2]}`;
  }
  return npmVersion;
}

const expected = readJsonVersion("package.json");
const cargoExpected = cargoVersionForRelease(expected);
const checks = [
  [
    "packages/client/package.json",
    readJsonVersion("packages/client/package.json"),
    expected,
  ],
  ["packages/core/package.json", readJsonVersion("packages/core/package.json"), expected],
  [
    "packages/relay/package.json",
    readJsonVersion("packages/relay/package.json"),
    expected,
  ],
  [
    "packages/client-tauri/package.json",
    readJsonVersion("packages/client-tauri/package.json"),
    expected,
  ],
  [
    "packages/client-tauri/src-tauri/tauri.conf.json",
    readTauriVersion("packages/client-tauri/src-tauri/tauri.conf.json"),
    cargoExpected,
  ],
  [
    "packages/client-tauri/src-tauri/Cargo.toml",
    readCargoVersion("packages/client-tauri/src-tauri/Cargo.toml"),
    cargoExpected,
  ],
  [
    "packages/client-tauri/src-tauri/Cargo.lock (aethelos-desktop)",
    readCargoLockPackageVersion("aethelos-desktop"),
    cargoExpected,
  ],
];

const mismatches = checks.filter(([, version, want]) => version !== want);
if (mismatches.length > 0) {
  console.error(`Expected npm version ${expected} (Cargo ${cargoExpected}). Mismatches:`);
  for (const [label, version] of mismatches) {
    console.error(`  ${label}: ${version}`);
  }
  process.exit(1);
}

console.log(`Version sync OK (npm ${expected}, cargo ${cargoExpected})`);
