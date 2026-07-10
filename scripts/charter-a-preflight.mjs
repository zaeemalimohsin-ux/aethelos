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

async function fetchHealth() {
  const res = await fetch(healthUrl, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`healthz HTTP ${res.status}`);
  const body = await res.json();
  if (body?.status !== "ok")
    throw new Error(`healthz unexpected body: ${JSON.stringify(body)}`);
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
  await fetchHealth();
  console.log(`charter-a-preflight: OK ${healthUrl}`);
  try {
    await probeWebSocket();
    console.log(`charter-a-preflight: OK ${wsUrl}`);
  } catch (err) {
    console.warn(
      `charter-a-preflight: WS probe failed (${err instanceof Error ? err.message : err})`,
    );
  }
  process.exit(0);
} catch (err) {
  console.error(
    `charter-a-preflight: FAIL ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
}
