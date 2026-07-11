#!/usr/bin/env node
/**
 * Build a Windows desktop installer and copy to dist/releases/.
 */
import {
  readFileSync,
  readdirSync,
  cpSync,
  existsSync,
  mkdirSync,
  statSync,
  utimesSync,
} from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundleDir = join(root, "packages/client-tauri/src-tauri/target/release/bundle");
const outDir = join(root, "dist/releases");
const resourceSrc = join(root, "packages/client-tauri/src-tauri/resources");
const proofBuild = process.env.AETHELOS_PROOF_BUILD === "1";

function staticAssetsHasTestBridge() {
  const staticAssets = join(resourceSrc, "static", "assets");
  if (!existsSync(staticAssets)) return false;
  return readdirSync(staticAssets)
    .filter((name) => name.endsWith(".js"))
    .some((name) =>
      readFileSync(join(staticAssets, name), "utf8").includes("__aethelosTest"),
    );
}

function verifyStaticSidecarGate() {
  const staticAssets = join(resourceSrc, "static", "assets");
  if (!existsSync(staticAssets)) {
    console.error("Static sidecar assets missing:", staticAssets);
    process.exit(1);
  }
  const hasBridge = staticAssetsHasTestBridge();
  if (proofBuild) {
    if (!hasBridge) {
      console.error("Proof build missing __aethelosTest in static sidecar bundle");
      process.exit(1);
    }
    console.log("Proof static sidecar includes E2E test bridge");
    return;
  }
  if (hasBridge) {
    console.error(
      "Normal release must not ship __aethelosTest — rebuild client without AETHELOS_PROOF_BUILD",
    );
    process.exit(1);
  }
  console.log("Release static sidecar verified (no E2E test bridge)");
}

const FEDERATION_ON_MARKER = "New people join through linked";

function verifyFederationEnabledInSidecar() {
  if (proofBuild) return;
  const staticAssets = join(resourceSrc, "static", "assets");
  if (!existsSync(staticAssets)) {
    console.error("Static sidecar assets missing:", staticAssets);
    process.exit(1);
  }
  const hasFederationUi = readdirSync(staticAssets)
    .filter((name) => name.endsWith(".js"))
    .some((name) =>
      readFileSync(join(staticAssets, name), "utf8").includes(FEDERATION_ON_MARKER),
    );
  if (!hasFederationUi) {
    console.error(
      "Release bundle missing federation-on UI copy — rebuild with VITE_ENABLE_FEDERATION=1 in .env.production",
    );
    process.exit(1);
  }
  console.log("Release static sidecar includes federation-on UI");
}

console.log("== bundle relay sidecar ==");
execSync("node scripts/bundle-relay-sidecar.mjs", { cwd: root, stdio: "inherit" });

console.log("== fetch node sidecar ==");
execSync("node scripts/fetch-node-sidecar.mjs", { cwd: root, stdio: "inherit" });

console.log("== fetch cloudflared sidecar ==");
execSync("node scripts/fetch-cloudflared.mjs --tauri", { cwd: root, stdio: "inherit" });

console.log("== generate tauri icons ==");
execSync(
  "pnpm --filter @aethelos/client-tauri exec tauri icon ../client/public/favicon.svg",
  {
    cwd: root,
    stdio: "inherit",
  },
);

console.log("== desktop build ==");
const tauriTarget = join(root, "packages/client-tauri/src-tauri/target");
const buildEnv = { ...process.env };
delete buildEnv.VITE_E2E;
if (proofBuild) {
  buildEnv.VITE_E2E = "1";
}
buildEnv.CARGO_TARGET_DIR = tauriTarget;
if (buildEnv.CI === "1") buildEnv.CI = "true";
else if (buildEnv.CI === "0") buildEnv.CI = "false";

// Cargo may skip re-linking when only JS sidecars change; bump main.rs mtime so
// the release binary is rebuilt after prepare-release-client refreshes resources/static.
const mainRs = join(root, "packages/client-tauri/src-tauri/src/main.rs");
utimesSync(mainRs, new Date(), new Date());

execSync("pnpm --filter @aethelos/client-tauri desktop:build:release", {
  cwd: root,
  stdio: "inherit",
  env: buildEnv,
});

console.log("== verify static sidecar ==");
verifyStaticSidecarGate();
verifyFederationEnabledInSidecar();

console.log("== stage release resources beside runtime exe ==");
const releaseDir = join(root, "packages/client-tauri/src-tauri/target/release");
for (const name of ["relay", "node", "app-server", "static", "cloudflared"]) {
  const src = join(resourceSrc, name);
  const dest = join(releaseDir, name);
  if (existsSync(src)) {
    cpSync(src, dest, { recursive: true });
  }
}

mkdirSync(outDir, { recursive: true });

function findInstallers(dir) {
  const found = [];
  if (!existsSync(dir)) return found;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) found.push(...findInstallers(p));
    else if (/\.(exe|msi)$/i.test(name)) found.push(p);
  }
  return found;
}

const installers = findInstallers(bundleDir);
if (installers.length === 0) {
  console.error("No installer found under", bundleDir);
  process.exit(1);
}

for (const src of installers) {
  const dest = join(outDir, src.split(/[/\\]/).pop());
  cpSync(src, dest);
  const mb = (statSync(dest).size / (1024 * 1024)).toFixed(1);
  console.log("");
  console.log("Release ready:", dest, `(${mb} MB)`);
  console.log("Send this file to a founder — friends join via invite link in a browser.");
}
