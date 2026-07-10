import type { Page, BrowserContext } from "@playwright/test";
import { expect } from "@playwright/test";
import { admissionProposalId } from "@aethelos/core";

export const RELAY_URL = "ws://localhost:8787";
export const PASSWORD = "e2e-test-pass-123";

export interface PoolSummary {
  namespaceId: string;
  cellName: string;
  memberCount: number;
  members: string[];
  head: string | null;
  epochNumber: number;
  lastEpochTimestamp: number;
  lastRedistributionTimestamp: number;
  maxEventTimestamp?: number;
  eventsSinceEpoch: number;
  eventCount: number;
  totalPoints: string;
  balances: Record<string, string>;
  commons: string;
  parameters: Record<string, number>;
  childCells: string[];
  parentSuperstructures: string[];
  pendingInviteCount: number;
  proposalCount: number;
  fractures?: string[];
  frozen?: string[];
  proposals?: Array<{
    id: string;
    kind: string;
    closed: boolean;
    executed: boolean;
    votesFor: string;
    votesAgainst: string;
  }>;
}

export interface BootstrappedCommunity {
  founder: Page;
  joiners: Page[];
  keys: string[];
  contexts: BrowserContext[];
}

import { OmniHarness, PeerDevice } from "./harness.js";

export async function freshPeer(browser: any): Promise<PeerDevice> {
  const peer = await OmniHarness.launchPeer(browser as any);
  return peer;
}

/**
 * Backwards-compatible shim for legacy tests that use:
 *   const ctx = await freshContext(browser);
 *   const page = await ctx.newPage();
 *
 * Returns a BrowserContext. The first navigation in each test (via goto or
 * onboardGenesis) will load the app fresh with any hash URL intact.
 * The shim does NOT pre-navigate to the base URL — doing so would cause
 * hash-based invite links to fail because the store's init() reads the
 * URL hash only on initial page load.
 */
export async function freshContext(browser: any): Promise<any> {
  const baseUrl = process.env.BASE_URL || "http://localhost:5173";
  const ctx = await browser.newContext();
  const origNewPage = ctx.newPage.bind(ctx);
  ctx.newPage = async () => {
    const page = await origNewPage();
    page.on("pageerror", (err: Error) => console.log(`[Web Error]`, err));
    page.on("console", (msg: any) =>
      console.log(`[Web Console]`, msg.type(), msg.text()),
    );
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
        lastError = undefined;
        break;
      } catch (err) {
        lastError = err;
        if (attempt < 2) await page.waitForTimeout(1000);
      }
    }
    if (lastError) throw lastError;
    return page;
  };
  return ctx;
}

export async function closeContexts(contexts: any[]): Promise<void> {
  await Promise.all(
    contexts.map(async (c) => {
      if (c.close && typeof c.close === "function") {
        await c.close();
      }
    }),
  );
}

export async function createIdentity(
  page: Page,
  displayName: string,
  opts?: { fromInvite?: boolean },
): Promise<void> {
  if (!opts?.fromInvite) {
    // We don't need to page.goto("/") here because OmniHarness already navigates to the app.
    // If we navigate while it's initializing it might break IndexedDB
    await page.getByRole("button", { name: "Create a new identity" }).click();
  }
  await page.getByLabel("Display name").fill(displayName);
  await page.getByLabel("Passphrase", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm passphrase").fill(PASSWORD);
  await page.getByRole("button", { name: "Create identity" }).click();
  await expect(page.getByText("Save your recovery phrase")).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Continue/ }).click();
}

export async function startCommunity(page: Page, cellName: string): Promise<void> {
  await page.getByRole("button", { name: "Start a new community" }).click();
  await page.getByLabel("Community name").fill(cellName);
  await page.getByRole("button", { name: "Create community" }).click();
  await expect(page.getByRole("button", { name: "Community" })).toBeVisible({
    timeout: 30_000,
  });
}

export async function onboardGenesis(
  page: Page,
  displayName: string,
  cellName: string,
): Promise<void> {
  if (page.url() === "about:blank") {
    await page.goto(process.env.BASE_URL || "http://localhost:5173");
  }
  await createIdentity(page, displayName);
  await startCommunity(page, cellName);
}

export async function getPublicKey(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Identity" }).click();
  const keyRow = page.locator(".list li", { has: page.getByText("Public key") });
  const key = await keyRow.locator(".mono").textContent();
  if (!key || key.trim().length !== 64) throw new Error(`Invalid public key: ${key}`);
  await page.getByRole("button", { name: "Community" }).click();
  return key.trim();
}

export async function waitForSyncConnected(
  page: Page,
  timeoutMs = 45_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const sync = await page.evaluate(
      () => window.__aethelosTest?.getSyncStatus?.() ?? null,
    );
    if (sync?.overall === "online" || sync?.relays?.some((r) => r.status === "online")) {
      return;
    }
    await page.waitForTimeout(500);
  }
  const last = await page.evaluate(
    () => window.__aethelosTest?.getSyncStatus?.() ?? null,
  );
  throw new Error(`waitForSyncConnected timeout; last=${JSON.stringify(last)}`);
}

export async function getPoolSummary(page: Page): Promise<PoolSummary | null> {
  const res = await page.evaluate(() => {
    if (!window.__aethelosTest) {
      return {
        error: "no test bridge",
        href: window.location.href,
        hasRoot: !!document.getElementById("root")?.innerHTML,
      };
    }
    return window.__aethelosTest.getPoolSummary();
  });
  if (res && (res as any).error) {
    console.log("getPoolSummary error:", res);
    return null;
  }
  return res as PoolSummary | null;
}

export async function waitForPool(
  page: Page,
  predicate: (p: PoolSummary) => boolean,
  timeoutMs = 45_000,
): Promise<PoolSummary> {
  const deadline = Date.now() + timeoutMs;
  let lastPool: PoolSummary | null = null;
  while (Date.now() < deadline) {
    const pool = await getPoolSummary(page);
    lastPool = pool;
    if (pool && predicate(pool)) return pool;
    await page.waitForTimeout(500);
  }
  console.log("waitForPool timed out. lastPool:", lastPool);
  throw new Error(`waitForPool timeout; last=${JSON.stringify(lastPool)}`);
}

export async function waitForMemberCount(
  page: Page,
  count: number,
  timeoutMs = 45_000,
): Promise<PoolSummary> {
  return waitForPool(page, (p) => p.memberCount === count, timeoutMs);
}

export async function waitForConvergence(
  pageA: Page,
  pageB: Page,
  predicate: (a: PoolSummary, b: PoolSummary) => boolean,
  timeoutMs = 45_000,
): Promise<[PoolSummary, PoolSummary]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [a, b] = await Promise.all([getPoolSummary(pageA), getPoolSummary(pageB)]);
    if (a && b && predicate(a, b)) return [a, b];
    await pageA.waitForTimeout(500);
  }
  const a = await getPoolSummary(pageA);
  const b = await getPoolSummary(pageB);
  throw new Error(`convergence timeout; A=${JSON.stringify(a)} B=${JSON.stringify(b)}`);
}

export async function waitForAllConvergence(
  pages: Page[],
  predicate: (summaries: PoolSummary[]) => boolean,
  timeoutMs = 45_000,
): Promise<PoolSummary[]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const summaries = await Promise.all(pages.map((p) => getPoolSummary(p)));
    if (summaries.every(Boolean) && predicate(summaries as PoolSummary[])) {
      return summaries as PoolSummary[];
    }
    await pages[0]!.waitForTimeout(500);
  }
  throw new Error("waitForAllConvergence timeout");
}

export async function buildInviteLink(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Invite people" }).click();
  const textarea = page.locator(".modal textarea.textarea");
  await expect(textarea).toBeVisible({ timeout: 60_000 });
  const link = await textarea.inputValue();
  if (!link.includes("#/join?d=")) {
    throw new Error(`Invalid invite link: ${link.slice(0, 80)}`);
  }
  await page.keyboard.press("Escape");
  return link;
}

export interface DecodedInvitePayload {
  ns: string;
  relays?: string[];
  [key: string]: unknown;
}

export function decodeInviteFromLink(link: string): DecodedInvitePayload {
  const encoded = link.split("#/join?d=")[1];
  if (!encoded) throw new Error(`Invite link missing payload: ${link.slice(0, 120)}`);
  const pad = encoded.length % 4 === 0 ? "" : "=".repeat(4 - (encoded.length % 4));
  return JSON.parse(
    Buffer.from(encoded.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64").toString(
      "utf8",
    ),
  ) as DecodedInvitePayload;
}

export async function joinViaInviteLink(
  page: Page,
  inviteLink: string,
  displayName = "Joiner",
): Promise<void> {
  await page.goto(inviteLink);
  await page.reload(); // Force full reload so app parses hash URL during init
  await expect(page.getByText("You've been invited")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Create identity" }).click();
  await createIdentity(page, displayName, { fromInvite: true });
  await page.getByRole("button", { name: "Join this community" }).click();
  await expect(page.getByRole("button", { name: "Community" })).toBeVisible({
    timeout: 30_000,
  });
}

export async function sendOnChainInvite(
  page: Page,
  inviteePubkey: string,
): Promise<void> {
  await page.getByRole("button", { name: "Community" }).click();
  await page.getByLabel("Join code").fill(inviteePubkey);
  await page.getByRole("button", { name: "Vouch and send invite" }).click();
  await expect(page.getByRole("button", { name: "Proposals" })).toHaveAttribute(
    "aria-current",
    "page",
  );
}

/** Vote Approve on the admit_member proposal in the Proposals UI (no test bridge). */
export async function approveAdmissionInUi(
  founderPage: Page,
  inviteePubkey: string,
): Promise<void> {
  const proposalId = admissionProposalId(inviteePubkey.trim());
  await waitForPool(
    founderPage,
    (p) => p.proposals?.some((pr) => pr.id === proposalId && !pr.executed) ?? false,
    30_000,
  );
  await founderPage.getByRole("button", { name: "Proposals" }).click();
  const row = founderPage.getByTestId(`proposal-${proposalId}`);
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: "Approve" }).click();
}

/** Vouch, approve admission on founder page, then accept on joiner page. */
export async function admitJoiner(
  founderPage: Page,
  joinerPage: Page,
  joinerPubkey: string,
  expectedMembers = 2,
): Promise<void> {
  await sendOnChainInvite(founderPage, joinerPubkey);
  await waitForPool(founderPage, (p) => p.pendingInviteCount >= 1, 30_000);
  await approveAdmissionInUi(founderPage, joinerPubkey);
  await joinerPage.getByRole("button", { name: "Community" }).click();
  await expect(
    joinerPage.getByText(/Approved — accept your invitation|Accept invitation/),
  ).toBeVisible({
    timeout: 60_000,
  });
  await joinerPage.getByRole("button", { name: "Accept invitation" }).click();
  await waitForConvergence(
    founderPage,
    joinerPage,
    (a, b) => a.memberCount === expectedMembers && b.memberCount === expectedMembers,
    60_000,
  );
  await founderPage.getByRole("button", { name: "Community" }).click();
}

export async function bridgeTransfer(
  page: Page,
  to: string,
  amount: string,
): Promise<void> {
  await page.evaluate(
    async ({ to, amount }) => {
      await window.__aethelosTest?.transfer(to, amount);
    },
    { to, amount },
  );
}

export async function bridgeUpdateSlider(
  page: Page,
  param: string,
  value: number,
): Promise<void> {
  await page.evaluate(
    async ({ param, value }) => {
      await window.__aethelosTest?.updateSlider(param, value);
    },
    { param, value },
  );
}

/** Publish stepped transfers until a redistribution cycle closes (E2E only). */
export async function bridgeAdvanceCirculation(page: Page, to: string): Promise<void> {
  await page.evaluate(
    async ({ to }) => {
      if (!window.__aethelosTest?.advanceCirculation) {
        throw new Error("advanceCirculation missing from test bridge");
      }
      await window.__aethelosTest.advanceCirculation(to);
    },
    { to },
  );
}

export async function bridgeCreateProposal(
  page: Page,
  kind: string,
  target: string,
): Promise<void> {
  await page.evaluate(
    async ({ kind, target }) => {
      await window.__aethelosTest?.createProposal(kind, target);
    },
    { kind, target },
  );
}

export async function bridgeVoteProposal(
  page: Page,
  id: string,
  approve: boolean,
): Promise<void> {
  await page.evaluate(
    async ({ id, approve }) => {
      await window.__aethelosTest?.voteProposal(id, approve);
    },
    { id, approve },
  );
}

export async function bridgeVouch(
  page: Page,
  target: string,
  weight: number,
): Promise<void> {
  await page.evaluate(
    async ({ target, weight }) => {
      await window.__aethelosTest?.updateVouch(target, weight);
    },
    { target, weight },
  );
}

/** Star topology: one founder vouches for N joiners via the real invite UX + UI admission vote. */
export async function bootstrapStarCommunity(
  browser: any,
  cellName: string,
  joinerLabels: string[],
): Promise<BootstrappedCommunity> {
  const contexts: PeerDevice[] = [];
  const founderPeer = await freshPeer(browser);
  contexts.push(founderPeer);
  const founder = founderPeer.page;
  await onboardGenesis(founder, "Founder", cellName);
  const link = await buildInviteLink(founder);

  const joiners: Page[] = [];
  const keys: string[] = [];
  const expectedCount = 1 + joinerLabels.length;

  for (let i = 0; i < joinerLabels.length; i++) {
    const peer = await freshPeer(browser);
    contexts.push(peer);
    const page = peer.page;
    await joinViaInviteLink(page, link, joinerLabels[i]!);
    const key = await getPublicKey(page);
    keys.push(key);
    joiners.push(page);
    await admitJoiner(founder, page, key, expectedCount - joinerLabels.length + i + 1);
    await waitForMemberCount(
      founder,
      expectedCount - joinerLabels.length + i + 1,
      90_000,
    );
  }

  return { founder, joiners, keys, contexts };
}
