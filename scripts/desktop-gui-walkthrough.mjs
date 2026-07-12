#!/usr/bin/env node
/**
 * Desktop GUI walkthrough against the Tauri webview (CDP).
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "packages", "client", "package.json"));
const { chromium } = require("playwright");
const { execSync } = require("node:child_process");
const dns = require("node:dns");
const CDP = "http://127.0.0.1:9222";
const PASSWORD = "gui-walkthrough-pass-123";
const INVITE_BASE_URL = "http://localhost:5173";

/**
 * Fresh quick-tunnel hostnames can be stuck as NXDOMAIN in the local OS cache
 * (founder machine asked before the record propagated). A remote friend's
 * resolver would not have that negative entry, so resolve via 1.1.1.1 directly.
 */
async function resolveTunnelHost(host, maxMs = 180_000) {
  const resolver = new dns.promises.Resolver();
  resolver.setServers(["1.1.1.1", "1.0.0.1"]);
  const deadline = Date.now() + maxMs;
  let lastErr = "no answer";
  while (Date.now() < deadline) {
    try {
      const addrs = await resolver.resolve4(host);
      if (addrs.length > 0) return addrs[0];
    } catch (err) {
      lastErr = String(err?.code ?? err);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`Tunnel DNS never resolved: ${host} (${lastErr})`);
}

function refreshedPath() {
  if (process.platform !== "win32") return process.env.PATH ?? process.env.Path ?? "";
  try {
    return execSync(
      "[System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')",
      { encoding: "utf8", shell: "powershell.exe" },
    ).trim();
  } catch {
    return process.env.PATH ?? process.env.Path ?? "";
  }
}

async function waitForCdp(maxMs = 360_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${CDP}/json/version`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Timed out waiting for WebView2 CDP on port 9222");
}

function freePorts() {
  if (process.platform !== "win32") return;
  spawn(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      "Get-Process aethelos-desktop,cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue; Get-NetTCPConnection -LocalPort 5173,5174,8787,9222 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }",
    ],
    { stdio: "ignore" },
  );
}

async function createIdentity(page, displayName, fromInvite = false) {
  if (!fromInvite) {
    await page.getByRole("button", { name: "Create a new identity" }).click();
  }
  await page.getByLabel("Display name").fill(displayName);
  await page.getByLabel("Passphrase", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm passphrase").fill(PASSWORD);
  await page.getByRole("button", { name: "Create identity" }).click();
  await page.getByText("Save your recovery phrase").waitFor({ timeout: 60_000 });
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Continue/ }).click();
}

async function getPublicKey(page) {
  await page.getByRole("button", { name: "Identity" }).click();
  const keyRow = page.locator(".list li", { has: page.getByText("Public key") });
  const key = await keyRow.locator(".mono").textContent();
  await page.getByRole("button", { name: "Community" }).click();
  if (!key || key.trim().length !== 64) throw new Error(`Invalid public key: ${key}`);
  return key.trim();
}

async function findAppPage(browser) {
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      if (/localhost:517[34]/.test(p.url())) return p;
    }
  }
  return browser.contexts()[0]?.pages()[0] ?? null;
}

async function resetApp(page) {
  const target = /localhost:517[34]/.test(page.url())
    ? page.url().split("#")[0].replace(/\/?$/, "/")
    : "http://localhost:5173/";

  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page
    .goto(target, { waitUntil: "domcontentloaded", timeout: 60_000 })
    .catch(() => {});

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.evaluate(async () => {
        localStorage.clear();
        sessionStorage.clear();
        if (indexedDB.databases) {
          for (const db of await indexedDB.databases()) {
            if (db.name) indexedDB.deleteDatabase(db.name);
          }
        }
      });
      break;
    } catch (err) {
      if (attempt === 2) throw err;
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(1500);
    }
  }

  await page.reload({ waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: /Create a new identity|Unlock/ })
    .waitFor({ timeout: 60_000 });
}

async function waitForTunnelReady(page, timeoutMs = 180_000) {
  await page.waitForFunction(
    () => window.__aethelosTest?.getConnectionStatus?.().tunnelStatus === "ready",
    null,
    { timeout: timeoutMs },
  );
}

async function ensurePublicMailbox(page) {
  const ready = page.getByText(/Public reach is ready/);
  if (await ready.isVisible().catch(() => false)) return;

  try {
    await waitForTunnelReady(page, 180_000);
    if (await ready.isVisible().catch(() => false)) return;
  } catch {
    /* fall through to one explicit sharing attempt */
  }

  await page.evaluate(async () => {
    const bridge = window.__aethelosTest;
    if (!bridge) throw new Error("E2E test bridge missing (VITE_E2E=1)");
    const conn = bridge.getConnectionStatus();
    if (conn.relaySharing) await bridge.setRelaySharing(false);
    await bridge.setRelaySharing(true);
  });

  await waitForTunnelReady(page, 130_000);
  if (!(await ready.isVisible().catch(() => false))) {
    const debug = await page.evaluate(async () => ({
      conn: window.__aethelosTest?.getConnectionStatus?.() ?? null,
      node: (await window.__aethelosTest?.getLocalNodeStatus?.()) ?? null,
      inTauri: "__TAURI_INTERNALS__" in window,
    }));
    const hint = await page
      .locator("text=/Mailbox reachable|Local mailbox|Not sharing|Tunnel failed/")
      .first()
      .textContent()
      .catch(() => "unknown");
    throw new Error(
      `Connection not ready; saw: ${hint}; debug: ${JSON.stringify(debug)}`,
    );
  }
}

function admissionProposalId(pubkey) {
  return `admit:${pubkey.trim()}`;
}

async function approveAdmissionInUi(page, inviteePubkey) {
  const proposalId = admissionProposalId(inviteePubkey);
  await waitForPool(
    page,
    (p) => p.proposals?.some((pr) => pr.id === proposalId && !pr.executed) ?? false,
    60_000,
    "admission proposal",
  );
  await page.getByRole("button", { name: "Proposals" }).click();
  const row = page.getByTestId(`proposal-${proposalId}`);
  await row.waitFor({ state: "visible", timeout: 15_000 });
  await row.getByRole("button", { name: "Approve" }).click();
}

async function waitForPool(page, predicate, timeoutMs = 60_000, label = "waitForPool") {
  const deadline = Date.now() + timeoutMs;
  let pool = null;
  while (Date.now() < deadline) {
    pool = await page.evaluate(() => window.__aethelosTest?.getPoolSummary?.() ?? null);
    if (pool && predicate(pool)) return pool;
    await page.waitForTimeout(500);
  }
  const summary = pool
    ? `members=${pool.memberCount} events=${pool.eventCount} pendingInvites=${pool.pendingInviteCount}`
    : "no pool";
  throw new Error(`${label} timeout (${summary})`);
}

async function main() {
  let desktop = null;
  freePorts();
  await new Promise((r) => setTimeout(r, 3000));
  console.log("Starting desktop:dev (VITE_E2E=1, CDP 9222)...");
  desktop = spawn("pnpm", ["--filter", "@aethelos/client-tauri", "desktop:dev"], {
    cwd: root,
    shell: true,
    stdio: "ignore",
    env: {
      ...process.env,
      PATH: refreshedPath(),
      Path: refreshedPath(),
      VITE_E2E: "1",
      VITE_INVITE_BASE_URL: INVITE_BASE_URL,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9222",
      PLAYWRIGHT_BROWSERS_PATH:
        process.env.PLAYWRIGHT_BROWSERS_PATH ??
        join(process.env.LOCALAPPDATA ?? "", "ms-playwright"),
    },
  });

  try {
    await waitForCdp();
    const browser = await chromium.connectOverCDP(CDP);
    let page = null;
    for (let i = 0; i < 60 && !page; i++) {
      page = await findAppPage(browser);
      if (!page) await new Promise((r) => setTimeout(r, 2000));
    }
    if (!page) throw new Error("No Tauri webview page found");

    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(2000);
    await resetApp(page);
    const inTauri = await page.evaluate(() => "__TAURI_INTERNALS__" in window);
    if (!inTauri) throw new Error("Webview missing Tauri APIs — not the desktop shell");
    await createIdentity(page, "Founder");
    await page.getByRole("button", { name: "Start a new community" }).click();
    await page.getByLabel("Community name").fill("Walkthrough Cell");
    await page.getByRole("button", { name: "Create community" }).click();
    await page.getByRole("button", { name: "Community" }).waitFor({ timeout: 180_000 });
    await waitForPool(page, (p) => p.cellName === "Walkthrough Cell", 180_000);
    await page.getByText("Connection").waitFor({ timeout: 30_000 });

    await ensurePublicMailbox(page);
    console.log("PASS: Connection shows share link ready");

    await page.getByRole("button", { name: "Invite people" }).click();
    const textarea = page.locator(".modal textarea.textarea");
    await textarea.waitFor({ timeout: 60_000 });
    const inviteLink = await textarea.inputValue();
    await page.keyboard.press("Escape");

    if (!inviteLink.startsWith(INVITE_BASE_URL)) {
      throw new Error(
        `Invite link must use VITE_INVITE_BASE_URL (${INVITE_BASE_URL}); got: ${inviteLink.slice(0, 80)}`,
      );
    }
    console.log(`PASS: Invite link uses configured client shell: ${INVITE_BASE_URL}`);

    // QUICKSTART criterion: the link's mailboxes are public tunnels, not 127.0.0.1.
    const encoded = inviteLink.split("#/join?d=")[1];
    if (!encoded)
      throw new Error(`Invite link missing payload: ${inviteLink.slice(0, 120)}`);
    const pad = encoded.length % 4 === 0 ? "" : "=".repeat(4 - (encoded.length % 4));
    const payload = JSON.parse(
      Buffer.from(encoded.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64").toString(
        "utf8",
      ),
    );
    const relays = payload.relays ?? [];
    if (relays.some((r) => /localhost|127\.0\.0\.1/.test(r))) {
      throw new Error(`Invite relays contain localhost: ${relays.join(", ")}`);
    }
    if (!relays.some((r) => r.includes(".trycloudflare.com"))) {
      throw new Error(
        `Invite relays missing trycloudflare: ${relays.join(", ") || "(empty)"}`,
      );
    }
    console.log(`PASS: Invite relays are public tunnels: ${relays.join(", ")}`);

    const tunnelHost = new URL(relays.find((r) => r.includes(".trycloudflare.com")))
      .hostname;
    const tunnelIp = await resolveTunnelHost(tunnelHost);
    console.log(`PASS: Tunnel DNS resolves publicly: ${tunnelHost} -> ${tunnelIp}`);

    // Pin the resolved IP so the joiner is not poisoned by this machine's
    // stale NXDOMAIN cache (a remote friend's machine would resolve fresh).
    const joinBrowser = await chromium.launch({
      args: [`--host-resolver-rules=MAP ${tunnelHost} ${tunnelIp}`],
    });
    const joinPage = await joinBrowser.newPage();
    joinPage.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") {
        console.log(`[joiner console.${msg.type()}] ${msg.text().slice(0, 200)}`);
      }
    });
    await joinPage.goto(inviteLink);
    await joinPage.getByText("You've been invited").waitFor({ timeout: 30_000 });
    await joinPage.getByRole("button", { name: "Create identity" }).click();
    await createIdentity(joinPage, "Friend", true);
    await joinPage.getByRole("button", { name: "Join this community" }).click();
    await joinPage
      .getByRole("button", { name: "Community" })
      .waitFor({ timeout: 60_000 });
    const syncLogger = setInterval(() => {
      void joinPage
        .evaluate(() => JSON.stringify(window.__aethelosTest?.getSyncStatus?.() ?? null))
        .then((s) => console.log(`[joiner sync] ${s}`))
        .catch(() => {});
    }, 10_000);
    try {
      await waitForPool(
        joinPage,
        (p) => p.memberCount >= 1,
        120_000,
        "joiner tunnel sync",
      );
    } finally {
      clearInterval(syncLogger);
    }
    console.log("PASS: Friend synced community state over the tunnel");

    const joinerKey = await getPublicKey(joinPage);
    await page.getByRole("button", { name: "Community" }).click();
    await page.getByLabel("Join code").fill(joinerKey);
    await page.getByRole("button", { name: "Vouch and send invite" }).click();
    await waitForPool(page, (p) => p.pendingInviteCount >= 1, 60_000, "founder invite");
    await approveAdmissionInUi(page, joinerKey);
    await joinPage.getByRole("button", { name: "Community" }).click();
    await waitForPool(
      joinPage,
      (p) => p.pendingInviteCount >= 1,
      120_000,
      "joiner invite sync",
    );
    await joinPage
      .getByText("Approved — accept your invitation")
      .waitFor({ timeout: 120_000 });
    await joinPage.getByRole("button", { name: "Accept invitation" }).click();

    await waitForPool(page, (p) => p.memberCount === 2, 120_000, "founder member count");
    await waitForPool(
      joinPage,
      (p) => p.memberCount === 2,
      120_000,
      "joiner member count",
    );
    console.log("PASS: Founder and friend both show 2 members");

    console.log("\ndesktop-gui-walkthrough: OK");
    await joinBrowser.close();
    await browser.close();
  } finally {
    if (desktop) desktop.kill("SIGTERM");
    freePorts();
  }
}

main().catch((err) => {
  console.error("desktop-gui-walkthrough: FAIL", err);
  process.exit(1);
});
