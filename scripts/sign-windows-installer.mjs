#!/usr/bin/env node
/**
 * Authenticode-sign release installers when WINDOWS_CERT_PFX_BASE64 is set.
 * Skips silently when no certificate is configured (local/unsigned builds).
 */
import { existsSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const releases = join(root, "dist/releases");
const pfxB64 = process.env.WINDOWS_CERT_PFX_BASE64?.trim();
const password = process.env.WINDOWS_CERT_PASSWORD ?? "";

if (!pfxB64) {
  console.log("WINDOWS_CERT_PFX_BASE64 not set — skipping Authenticode signing");
  process.exit(0);
}

if (!existsSync(releases)) {
  console.error("dist/releases missing");
  process.exit(1);
}

const installers = readdirSync(releases).filter((n) => /\.(exe|msi)$/i.test(n));
if (installers.length === 0) {
  console.error("No installers to sign in", releases);
  process.exit(1);
}

const pfxPath = join(releases, "_signing.pfx");
writeFileSync(pfxPath, Buffer.from(pfxB64, "base64"));

function findSigntool() {
  const kits = "C:\\Program Files (x86)\\Windows Kits\\10\\bin";
  if (!existsSync(kits)) return null;
  for (const ver of readdirSync(kits).sort().reverse()) {
    const x64 = join(kits, ver, "x64", "signtool.exe");
    if (existsSync(x64)) return x64;
  }
  return null;
}

const signtool = findSigntool();
if (!signtool) {
  console.error("signtool.exe not found — install Windows SDK on the runner");
  unlinkSync(pfxPath);
  process.exit(1);
}

for (const name of installers) {
  const file = join(releases, name);
  console.log("Signing", name);
  execSync(
    `"${signtool}" sign /f "${pfxPath}" /p "${password}" /fd sha256 /tr http://timestamp.digicert.com /td sha256 /a "${file}"`,
    { stdio: "inherit" },
  );
}

unlinkSync(pfxPath);
console.log("Authenticode signing complete");
