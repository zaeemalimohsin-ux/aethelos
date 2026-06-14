import dns from "node:dns";
import { test, expect, chromium, devices } from "@playwright/test";
import { createIdentity, startCommunity } from "./helpers.js";

const shareUrl = process.env.AETHELOS_SHARE_URL?.trim();

async function resolveTunnelHost(host: string, maxMs = 60_000): Promise<string> {
  const resolver = new dns.promises.Resolver();
  resolver.setServers(["1.1.1.1", "1.0.0.1"]);
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const addrs = await resolver.resolve4(host);
      if (addrs[0]) return addrs[0];
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Could not resolve ${host}`);
}

test.describe("share-url mobile founder", () => {
  test.skip(!shareUrl, "Set AETHELOS_SHARE_URL to the desktop public share link");

  test("phone founder starts a community on public share URL", async () => {
    test.setTimeout(180_000);

    const host = new URL(shareUrl!).hostname;
    const ip = await resolveTunnelHost(host);
    const browser = await chromium.launch({
      args: [`--host-resolver-rules=MAP ${host} ${ip}`],
    });

    try {
      const ctx = await browser.newContext({ ...devices["Pixel 5"] });
      const page = await ctx.newPage();

      await page.goto(shareUrl!, { waitUntil: "domcontentloaded", timeout: 60_000 });

      await page.getByRole("button", { name: "Create a new identity" }).click();
      await createIdentity(page, "Mobile Founder", { fromInvite: true });

      await startCommunity(page, "Share URL Community");

      const origin = await page.evaluate(() => window.location.origin);
      expect(origin).not.toMatch(/localhost|127\.0\.0\.1/);

      const sameOriginWs = await page.evaluate(() => {
        const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
        return `${proto}//${window.location.host}/ws`;
      });
      expect(sameOriginWs).toMatch(/\/ws$/);
      const pageHost = new URL(page.url()).host;
      expect(sameOriginWs).toBe(
        `${new URL(page.url()).protocol === "https:" ? "wss:" : "ws:"}//${pageHost}/ws`,
      );

      await ctx.close();
    } finally {
      await browser.close();
    }
  });
});
