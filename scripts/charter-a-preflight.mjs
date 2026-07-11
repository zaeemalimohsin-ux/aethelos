#!/usr/bin/env node
/**
 * Optional hosted-stack smoke for Charter A operators.
 * Set AETHELOS_URL (https origin, no trailing slash). Skips gracefully if unset.
 */
const base = process.env.AETHELOS_URL?.replace(/\/$/, "");

if (!base) {
  console.log("charter-a-preflight: skip (AETHELOS_URL not set)");
  process.exit(0);
}

const healthUrl = `${base}/healthz`;
const wsUrl = base.replace(/^http/, "ws") + "/ws";

const NETWORK_RETRY_ATTEMPTS = 2;
const NETWORK_RETRY_DELAY_MS = 10_000;

function isRetryableNetworkError(err) {
  if (!(err instanceof Error)) return false;
  if (err.name === "AbortError") return true;
  const msg = err.message.toLowerCase();
  if (msg.includes("timeout")) return true;
  if (msg.includes("still preparing")) return true;
  if (msg.includes("not valid json")) return true;
  if (err instanceof TypeError && msg.includes("fetch")) return true;
  const cause = err.cause;
  if (cause instanceof Error) {
    const causeMsg = cause.message.toLowerCase();
    if (
      cause.code === "ECONNRESET" ||
      cause.code === "ENOTFOUND" ||
      cause.code === "ETIMEDOUT"
    ) {
      return true;
    }
    if (causeMsg.includes("fetch failed")) return true;
  }
  return false;
}

async function withNetworkRetry(label, fn) {
  let lastErr;
  for (let attempt = 0; attempt <= NETWORK_RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryableNetworkError(err)) throw err;
      lastErr = err;
      if (attempt < NETWORK_RETRY_ATTEMPTS) {
        console.warn(
          `charter-a-preflight: ${label} network error (retry ${attempt + 1}/${NETWORK_RETRY_ATTEMPTS} in ${NETWORK_RETRY_DELAY_MS / 1000}s): ${err.message}`,
        );
        await new Promise((r) => setTimeout(r, NETWORK_RETRY_DELAY_MS));
      }
    }
  }
  throw lastErr;
}

async function fetchHealth() {
  const res = await fetch(healthUrl, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`healthz HTTP ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) {
    throw new TypeError("Space still preparing (non-JSON healthz response)");
  }
  const body = await res.json();
  if (body?.status !== "ok")
    throw new Error(`healthz unexpected body: ${JSON.stringify(body)}`);
}

async function fetchAppShell() {
  const res = await fetch(base, {
    signal: AbortSignal.timeout(15_000),
    headers: { Accept: "text/html" },
  });
  if (!res.ok) throw new Error(`app shell HTTP ${res.status}`);
  const html = await res.text();
  if (!html.includes('id="root"') && !/AethelOS/i.test(html)) {
    throw new Error("app shell missing #root or AethelOS marker");
  }
}

async function probeWebSocket() {
  if (typeof WebSocket === "undefined") {
    console.log("charter-a-preflight: WebSocket probe skipped (no global WebSocket)");
    return;
  }
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("WebSocket open timeout"));
    }, 10_000);
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      clearTimeout(timer);
      ws.close();
      resolve(undefined);
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error("WebSocket error"));
    };
  });
}

try {
  await withNetworkRetry("healthz", fetchHealth);
  console.log(`charter-a-preflight: OK ${healthUrl}`);
  await withNetworkRetry("app shell", fetchAppShell);
  console.log(`charter-a-preflight: OK app shell ${base}`);
  try {
    await probeWebSocket();
    console.log(`charter-a-preflight: OK ${wsUrl}`);
  } catch (err) {
    console.error(
      `charter-a-preflight: FAIL WS (${err instanceof Error ? err.message : err})`,
    );
    process.exit(1);
  }
  process.exit(0);
} catch (err) {
  console.error(
    `charter-a-preflight: FAIL ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
}
