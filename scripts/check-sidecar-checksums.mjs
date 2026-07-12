#!/usr/bin/env node
/**
 * Ensure sidecar checksum manifest matches pinned download versions.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  readFileSync(join(root, "scripts/sidecar-checksums.json"), "utf8"),
);

const nodeVersion = process.env.NODE_SIDECAR_VERSION ?? "20.18.1";
const cloudflaredVersion = process.env.CLOUDFLARED_VERSION ?? "2025.2.0";

if (manifest.node.version !== nodeVersion) {
  console.error(
    `sidecar-checksums.json node.version ${manifest.node.version} != NODE_SIDECAR_VERSION ${nodeVersion}`,
  );
  process.exit(1);
}

if (manifest.cloudflared.version !== cloudflaredVersion) {
  console.error(
    `sidecar-checksums.json cloudflared.version ${manifest.cloudflared.version} != CLOUDFLARED_VERSION ${cloudflaredVersion}`,
  );
  process.exit(1);
}

for (const key of ["node", "cloudflared"]) {
  const entry = manifest[key];
  if (!entry.sha256 || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
    console.error(`Invalid sha256 for ${key} in sidecar-checksums.json`);
    process.exit(1);
  }
}

console.log(
  `Sidecar checksum manifest OK (node ${nodeVersion}, cloudflared ${cloudflaredVersion})`,
);
