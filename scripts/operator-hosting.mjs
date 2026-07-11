#!/usr/bin/env node
/** Operator hosting: headed browser Fly auth, secrets, deploy, tunnel, preflight. */
import { spawn, spawnSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, createWriteStream } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { flyAuthViaBrowser } from "./operator-browser.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const flyDir = join(process.env.LOCALAPPDATA || "", "flyctl");
const flyExe = join(flyDir, "flyctl.exe");
const FLY_VERSION = "v0.3.135";
const FLY_APP = "aethelos";
const FLY_URL = "https://aethelos.fly.dev";

function log(...a) {
  console.log("[operator-hosting]", ...a);
}
function warn(...a) {
  console.warn("[operator-hosting]", ...a);
}
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", shell: false, ...opts });
  return { status: r.status ?? 1, stdout: r.stdout || "", stderr: r.stderr || "" };
}

async function downloadFlyctl() {
  if (existsSync(flyExe)) return flyExe;
  mkdirSync(flyDir, { recursive: true });
  const zip = join(flyDir, "flyctl.zip");
  const url = `https://github.com/superfly/flyctl/releases/download/${FLY_VERSION}/flyctl_0.3.135_Windows_x86_64.zip`;
  log("Downloading flyctl...");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`flyctl download failed: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(zip));
  execSync(
    `powershell -NoProfile -Command "Expand-Archive -Path '${zip}' -DestinationPath '${flyDir}' -Force"`,
    { stdio: "inherit" },
  );
  if (!existsSync(flyExe)) throw new Error("flyctl.exe missing after extract");
  return flyExe;
}

function fly(args, opts = {}) {
  return run(flyExe, args, opts);
}
function flyAuthed() {
  return fly(["auth", "whoami"]).status === 0;
}
function openEdge(url) {
  spawn("cmd", ["/c", "start", "msedge", url], {
    detached: true,
    stdio: "ignore",
  }).unref();
}

function captureFlyAuthUrl() {
  return new Promise((resolve, reject) => {
    const child = spawn(flyExe, ["auth", "login"], { shell: false });
    let buf = "";
    let settled = false;
    const finish = (fn) => {
      if (settled) return;
      settled = true;
      fn();
    };
    const onData = (d) => {
      buf += d.toString();
      const m = buf.match(/https:\/\/fly\.io\/app\/auth\/cli\/\S+/);
      if (m) finish(() => resolve({ child, url: m[0] }));
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", (e) => finish(() => reject(e)));
    child.on("exit", (code) => {
      if (!buf.includes("fly.io/app/auth/cli"))
        finish(() => reject(new Error(`fly auth login exited ${code}`)));
    });
    setTimeout(
      () => finish(() => reject(new Error("Timed out waiting for Fly auth URL (60s)"))),
      60_000,
    );
  });
}

function openAuthInEdge() {
  return captureFlyAuthUrl().then(({ child, url }) => {
    log("Opening Fly auth in Edge:", url);
    openEdge(url);
    return { child, url };
  });
}

async function waitForFlyAuth(maxMs = 1_200_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (flyAuthed()) {
      log("Fly authenticated:", fly(["auth", "whoami"]).stdout.trim());
      return true;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  return false;
}

function createDeployToken() {
  let r = fly(["tokens", "create", "deploy", "-a", FLY_APP]);
  let line = (r.stdout + r.stderr).split(/\r?\n/).find((l) => l.includes("FlyV1"));
  if (!line) {
    r = fly(["tokens", "create", "deploy"]);
    line = (r.stdout + r.stderr).split(/\r?\n/).find((l) => l.includes("FlyV1"));
  }
  if (!line)
    throw new Error("Could not create Fly deploy token: " + (r.stderr || r.stdout));
  return line.trim();
}

function ghSecretSet(name, value) {
  const r = spawnSync("gh", ["secret", "set", name], { input: value, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`gh secret set ${name} failed: ${r.stderr}`);
}

function ghWorkflowRun(workflow) {
  const r = run("gh", ["workflow", "run", workflow]);
  if (r.status !== 0) throw new Error(`gh workflow run failed: ${r.stderr}`);
  log(r.stdout.trim() || `Dispatched ${workflow}`);
}

async function cmdFly() {
  await downloadFlyctl();
  if (!flyAuthed()) {
    log(
      "Fly auth: real Edge tab (saved logins) + headed Playwright (scripts/.operator-screenshots/)...",
    );
    const { child, url } = await captureFlyAuthUrl();
    openEdge(url);
    try {
      await flyAuthViaBrowser(url, { timeoutMs: 1_200_000 });
    } catch (e) {
      warn("Playwright flow:", e.message);
      log("Complete Fly login in Edge if a tab is still open...");
    }
    if (!(await waitForFlyAuth())) {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      throw new Error("Fly auth not completed within 20 minutes");
    }
    try {
      child.kill();
    } catch {
      /* ignore */
    }
  }
  ghSecretSet("FLY_API_TOKEN", createDeployToken());
  ghWorkflowRun("deploy-fly.yml");
  log("Fly deploy dispatched.");
}

async function cmdFlyEdge() {
  await downloadFlyctl();
  if (!flyAuthed()) {
    log("Fly auth via external Edge tab (legacy)...");
    try {
      await openAuthInEdge();
    } catch (e) {
      warn(e.message);
    }
    if (!(await waitForFlyAuth()))
      throw new Error("Fly auth not completed within 20 minutes");
  }
  ghSecretSet("FLY_API_TOKEN", createDeployToken());
  ghWorkflowRun("deploy-fly.yml");
  log("Fly deploy dispatched.");
}

async function cmdFlyWait() {
  await downloadFlyctl();
  if (!(await waitForFlyAuth(120_000))) process.exit(1);
  ghSecretSet("FLY_API_TOKEN", createDeployToken());
  ghWorkflowRun("deploy-fly.yml");
}

async function cmdTunnel() {
  execSync(
    "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/share-public.ps1 -Refresh",
    { cwd: root, stdio: "inherit" },
  );
  const urlFile = join(root, ".share-url");
  if (existsSync(urlFile)) {
    process.env.AETHELOS_URL = readFileSync(urlFile, "utf8").trim();
    execSync("node scripts/charter-a-preflight.mjs", {
      cwd: root,
      stdio: "inherit",
      env: process.env,
    });
  }
}

function cmdPreflight(url) {
  execSync("node scripts/charter-a-preflight.mjs", {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, AETHELOS_URL: url || process.env.AETHELOS_URL || FLY_URL },
  });
}

function cmdOpenTabs() {
  for (const u of [
    "https://fly.io/app/sign-up",
    "https://dashboard.render.com/blueprint/new?repo=https://github.com/zaeemalimohsin-ux/aethelos",
    "https://www.namecheap.com/myaccount/domain-list/",
    "https://huggingface.co/spaces/TheGritz/aethelos",
  ])
    openEdge(u);
  log("Opened operator tabs in Edge");
}

const cmd = process.argv[2] || "fly";
const handlers = {
  fly: cmdFly,
  "fly-edge": cmdFlyEdge,
  "fly-wait": cmdFlyWait,
  tunnel: cmdTunnel,
  preflight: () => cmdPreflight(process.argv[3]),
  "open-tabs": cmdOpenTabs,
};

const fn = handlers[cmd];
if (!fn) {
  console.error("Unknown command:", cmd);
  process.exit(1);
}

fn().catch((e) => {
  console.error("[operator-hosting] FAIL:", e.message);
  process.exit(1);
});
