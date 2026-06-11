#!/usr/bin/env node
/**
 * Build a Windows desktop installer and copy to dist/releases/.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundleDir = join(root, "packages/client-tauri/src-tauri/target/release/bundle");
const outDir = join(root, "dist/releases");

console.log("== bundle relay sidecar ==");
execSync("node scripts/bundle-relay-sidecar.mjs", { cwd: root, stdio: "inherit" });

console.log("== fetch node sidecar ==");
execSync("node scripts/fetch-node-sidecar.mjs", { cwd: root, stdio: "inherit" });

console.log("== generate tauri icons ==");
execSync(
  "pnpm --filter @aethelos/client-tauri exec tauri icon ../client/public/favicon.svg",
  {
    cwd: root,
    stdio: "inherit",
  },
);

console.log("== desktop build ==");
execSync("pnpm --filter @aethelos/client-tauri desktop:build:release", {
  cwd: root,
  stdio: "inherit",
});

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
