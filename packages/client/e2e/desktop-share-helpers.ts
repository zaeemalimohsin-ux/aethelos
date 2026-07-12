import type { Page } from "@playwright/test";

const PUBLIC_SHARE_RE = /trycloudflare\.com/;

async function readShareStatus(page: Page) {
  return page.evaluate(async () => {
    const bridge = window.__aethelosTest;
    if (!bridge) return { error: "no_bridge" as const };
    await bridge.ensureDesktopShare();
    const conn = bridge.getConnectionStatus();
    const node = (await bridge.getLocalNodeStatus()) ?? null;
    const shareUrl = bridge.getShareUrl() ?? conn.shareUrl ?? node?.publicUrl ?? null;
    if (shareUrl && /trycloudflare\.com/.test(shareUrl)) {
      return { ready: true as const, shareUrl };
    }
    if (conn.tunnelStatus === "failed" || node?.cloudflaredAvailable === false) {
      return { error: "tunnel_failed" as const, conn, node };
    }
    return { ready: false as const, conn, node };
  });
}

async function bootstrapTunnel(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const bridge = window.__aethelosTest;
    if (!bridge) throw new Error("E2E test bridge missing");
    const conn = bridge.getConnectionStatus();
    if (conn.relaySharing) await bridge.setRelaySharing(false);
    await bridge.setRelaySharing(true);
  });
}

export async function waitForDesktopPublicShare(
  page: Page,
  timeoutMs = 240_000,
): Promise<string> {
  await bootstrapTunnel(page);
  const deadline = Date.now() + timeoutMs;
  let rebootstrapAt = Date.now() + 60_000;

  while (Date.now() < deadline) {
    const status = await readShareStatus(page);
    if ("error" in status && status.error) {
      throw new Error(
        `Desktop public share failed: ${status.error} ${JSON.stringify(status)}`,
      );
    }
    if (status.ready && status.shareUrl) return status.shareUrl;
    if (Date.now() >= rebootstrapAt) {
      await bootstrapTunnel(page).catch(() => {});
      rebootstrapAt = Date.now() + 60_000;
    }
    await page.waitForTimeout(2000);
  }

  const last = await readShareStatus(page).catch(() => null);
  throw new Error(
    `Timed out waiting for desktop public share URL (${timeoutMs}ms) last=${JSON.stringify(last)}`,
  );
}

export function isPublicShareUrl(url: string): boolean {
  return PUBLIC_SHARE_RE.test(url) && !/localhost|127\.0\.0\.1/.test(url);
}
