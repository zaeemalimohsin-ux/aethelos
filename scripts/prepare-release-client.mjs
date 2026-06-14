#!/usr/bin/env node
/**
 * Build the client and copy dist into Tauri resources/static.
 * Invoked from tauri.conf beforeBuildCommand so static sidecar matches the
 * freshly built client before the installer bundle is packed.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "packages/client/dist");
const outDir = join(root, "packages/client-tauri/src-tauri/resources/static");
const copyOnly = process.argv.includes("--copy-only");
const proofBuild = process.env.AETHELOS_PROOF_BUILD === "1";

const buildEnv = { ...process.env };
delete buildEnv.VITE_E2E;
if (proofBuild) {
  buildEnv.VITE_E2E = "1";
}

if (!copyOnly) {
  console.log(
    proofBuild
      ? "Building client for proof release (VITE_E2E=1)..."
      : "Building client for release...",
  );
  execSync("pnpm --filter @aethelos/client build", {
    cwd: root,
    stdio: "inherit",
    env: buildEnv,
  });
}

if (!existsSync(dist)) {
  console.error("Client dist missing:", dist);
  process.exit(1);
}

if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(dist, outDir, { recursive: true });
console.log("Release static sidecar OK:", outDir);
