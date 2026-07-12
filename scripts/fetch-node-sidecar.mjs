#!/usr/bin/env node
/**
 * Download portable Node.js for Windows x64 into Tauri resources (release builds).
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { verifySha256 } from "./sidecar-verify.mjs";

const NODE_VERSION = process.env.NODE_SIDECAR_VERSION ?? "20.18.1";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checksums = JSON.parse(
  readFileSync(join(root, "scripts/sidecar-checksums.json"), "utf8"),
);
const outDir = join(root, "packages/client-tauri/src-tauri/resources/node/win-x64");
const nodeExe = join(outDir, "node.exe");

if (existsSync(nodeExe)) {
  console.log("Node sidecar already present:", nodeExe);
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });

const url = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`;
console.log("Downloading", url);

const res = await fetch(url);
if (!res.ok) {
  throw new Error(`Failed to download Node.js: ${res.status} ${res.statusText}`);
}

const tmpZip = join(outDir, "node.zip");
await pipeline(Readable.fromWeb(res.body), createWriteStream(tmpZip));

if (checksums.node.version === NODE_VERSION) {
  await verifySha256(tmpZip, checksums.node.sha256);
  console.log("Verified SHA-256 for node sidecar zip");
} else {
  console.warn(
    `No pinned SHA-256 for node ${NODE_VERSION}; update scripts/sidecar-checksums.json`,
  );
}

console.log("Extracting node.exe...");

if (process.platform === "win32") {
  const tmpExtract = join(outDir, "_extract");
  if (existsSync(tmpExtract)) rmSync(tmpExtract, { recursive: true, force: true });
  mkdirSync(tmpExtract, { recursive: true });
  execSync(
    `powershell -NoProfile -Command "Expand-Archive -Path '${tmpZip.replace(/'/g, "''")}' -DestinationPath '${tmpExtract.replace(/'/g, "''")}' -Force"`,
    { stdio: "inherit" },
  );
  const extracted = join(tmpExtract, `node-v${NODE_VERSION}-win-x64`, "node.exe");
  execSync(`copy /Y "${extracted}" "${nodeExe}"`, { stdio: "inherit", shell: true });
  rmSync(tmpZip, { force: true });
  rmSync(tmpExtract, { recursive: true, force: true });
} else {
  execSync(
    `unzip -jo "${tmpZip}" "node-v${NODE_VERSION}-win-x64/node.exe" -d "${outDir}"`,
    {
      stdio: "inherit",
    },
  );
  rmSync(tmpZip, { force: true });
}

if (!existsSync(nodeExe)) {
  throw new Error("node.exe not found after extract");
}

console.log("Node sidecar OK:", nodeExe);
