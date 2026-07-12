import type { Page } from "@playwright/test";

const PUBLIC_SHARE_RE = /trycloudflare\.com/;

export async function waitForDesktopPublicShare(
  page: Page,
  timeoutMs = 180_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const status = await page.evaluate(async () => {
      const bridge = window.__aethelosTest;
      if (!bridge) return { error: "no_bridge" as const };
      const conn = bridge.getConnectionStatus();
      const shareUrl = bridge.getShareUrl?.() ?? conn.shareUrl ?? null;
      if (shareUrl && /trycloudflare\.com/.test(shareUrl)) {
        return { ready: true as const, shareUrl };
      }
      if (conn.tunnelStatus === "failed") {
        return { error: "tunnel_failed" as const };
      }
      if (!conn.relaySharing) {
        await bridge.setRelaySharing(true);
      }
      return { ready: false as const, tunnelStatus: conn.tunnelStatus };
    });

    if ("error" in status && status.error) {
      throw new Error(`Desktop public share failed: ${status.error}`);
    }
    if (status.ready && status.shareUrl) {
      return status.shareUrl;
    }
    await page.waitForTimeout(2000);
  }

  throw new Error(`Timed out waiting for desktop public share URL (${timeoutMs}ms)`);
}

export function isPublicShareUrl(url: string): boolean {
  return PUBLIC_SHARE_RE.test(url) && !/localhost|127\.0\.0\.1/.test(url);
}
