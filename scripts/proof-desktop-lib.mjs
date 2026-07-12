/**
 * Shared helpers for desktop product proof (CDP, DNS, ports, tunnel readiness).
 */
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import dns from "node:dns";
import { isValidPublicShareUrl } from "./public-share-url.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_CDP_URL = "http://127.0.0.1:9222";

export function refreshedPath() {
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

export function freePorts(extraPorts = []) {
  if (process.platform !== "win32") return;
  const ports = [5173, 5174, 5175, 8080, 8787, 9222, ...extraPorts];
  spawn(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Get-Process aethelos-desktop,cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue; Get-NetTCPConnection -LocalPort ${ports.join(",")} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`,
    ],
    { stdio: "ignore" },
  );
}

export async function waitForCdp(cdpUrl = DEFAULT_CDP_URL, maxMs = 360_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${cdpUrl}/json/version`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timed out waiting for WebView2 CDP on ${cdpUrl}`);
}

export async function resolveTunnelHost(host, maxMs = 180_000) {
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

export async function waitForTunnelReady(page, timeoutMs = 180_000) {
  await page.waitForFunction(
    () => window.__aethelosTest?.getConnectionStatus?.().tunnelStatus === "ready",
    null,
    { timeout: timeoutMs },
  );
}

export async function ensurePublicMailbox(page) {
  const ready = page.getByText(/Public reach is ready/);
  if (await ready.isVisible().catch(() => false)) return;

  try {
    await waitForTunnelReady(page, 180_000);
    if (await ready.isVisible().catch(() => false)) return;
  } catch {
    /* fall through */
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

export async function waitForLocalStack(mode = "dev", maxMs = 360_000) {
  const isRelease = mode === "release";
  const appPort = isRelease ? 8080 : 5173;
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const [app, relay] = await Promise.all([
        fetch(`http://127.0.0.1:${appPort}/`, { signal: AbortSignal.timeout(3000) }),
        fetch("http://127.0.0.1:8787/healthz", { signal: AbortSignal.timeout(3000) }),
      ]);
      if (app.ok && relay.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Local app (${appPort}) or relay (8787) not ready`);
}

export async function verifyReachable(url, fallbackPort = 5173) {
  if (!isValidPublicShareUrl(url)) {
    throw new Error(`Invalid public share URL: ${url}`);
  }
  void fallbackPort;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (res.ok) return;
    } catch {
      /* tunnel may still be warming */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Share URL not reachable: ${url}`);
}

export { isValidPublicShareUrl } from "./public-share-url.mjs";

export { root as proofRoot };
