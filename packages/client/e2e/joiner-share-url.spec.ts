import dns from "node:dns";
import { test, expect, chromium, devices } from "@playwright/test";
import {
  createIdentity,
  startCommunity,
  buildInviteLink,
  decodeInviteFromLink,
  joinViaInviteLink,
  getPublicKey,
  waitForPool,
  waitForConvergence,
  waitForSyncConnected,
  admitJoiner,
} from "./helpers.js";

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
  throw new Error(`Phase DNS: could not resolve ${host}`);
}

test.describe("share-url founder and joiner", () => {
  test.skip(!shareUrl, "Set AETHELOS_SHARE_URL to the desktop public share link");

  test("joiner syncs and converges to two members over public share URL", async () => {
    test.setTimeout(360_000);

    const host = new URL(shareUrl!).hostname;
    const ip = await resolveTunnelHost(host);
    const browser = await chromium.launch({
      args: [`--host-resolver-rules=MAP ${host} ${ip}`],
    });

    try {
      const ctxFounder = await browser.newContext({ ...devices["Pixel 5"] });
      const ctxJoiner = await browser.newContext({ ...devices["Pixel 5"] });
      const founder = await ctxFounder.newPage();
      const joiner = await ctxJoiner.newPage();

      await founder.goto(shareUrl!, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await founder.getByRole("button", { name: "Create a new identity" }).click();
      await createIdentity(founder, "Share Founder", { fromInvite: true });
      await startCommunity(founder, "Share URL Cell");
      await waitForPool(founder, (p) => p.memberCount === 1, 60_000);

      const inviteLink = await buildInviteLink(founder);
      expect(inviteLink).not.toMatch(/localhost|127\.0\.0\.1/);

      const payload = decodeInviteFromLink(inviteLink);
      const relays = payload.relays ?? [];
      expect(relays.some((r) => r.includes(".trycloudflare.com"))).toBe(true);
      expect(relays.some((r) => /localhost|127\.0\.0\.1/.test(r))).toBe(false);

      await joinViaInviteLink(joiner, inviteLink, "Share Joiner");
      await waitForSyncConnected(joiner, 60_000);
      await waitForPool(joiner, (p) => p.memberCount >= 1, 90_000);

      const joinerKey = await getPublicKey(joiner);
      await admitJoiner(founder, joiner, joinerKey, 2);
      await waitForConvergence(
        founder,
        joiner,
        (a, b) => a.memberCount === 2 && b.memberCount === 2,
        90_000,
      );

      await ctxFounder.close();
      await ctxJoiner.close();
    } finally {
      await browser.close();
    }
  });
});
