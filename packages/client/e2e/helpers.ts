import type { Page, BrowserContext } from "@playwright/test";
import { expect } from "@playwright/test";

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

export async function freshContext(browser: {
  newContext: (opts?: object) => Promise<BrowserContext>;
}): Promise<BrowserContext> {
  return browser.newContext();
}

export async function createIdentity(
  page: Page,
  displayName: string,
  opts?: { fromInvite?: boolean },
): Promise<void> {
  if (!opts?.fromInvite) {
    await page.goto("/");
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

export async function getPoolSummary(page: Page): Promise<PoolSummary | null> {
  return page.evaluate(() => window.__aethelosTest?.getPoolSummary() ?? null);
}

export async function waitForPool(
  page: Page,
  predicate: (p: PoolSummary) => boolean,
  timeoutMs = 45_000,
): Promise<PoolSummary> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pool = await getPoolSummary(page);
    if (pool && predicate(pool)) return pool;
    await page.waitForTimeout(500);
  }
  const last = await getPoolSummary(page);
  throw new Error(`waitForPool timeout; last=${JSON.stringify(last)}`);
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
  await page.getByRole("button", { name: "Share invite link" }).click();
  const textarea = page.locator(".modal textarea.textarea");
  await expect(textarea).toBeVisible({ timeout: 60_000 });
  const link = await textarea.inputValue();
  if (!link.includes("#/join?d=")) {
    throw new Error(`Invalid invite link: ${link.slice(0, 80)}`);
  }
  await page.keyboard.press("Escape");
  return link;
}

export async function joinViaInviteLink(
  page: Page,
  inviteLink: string,
  displayName = "Joiner",
): Promise<void> {
  await page.goto(inviteLink);
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
  const panel = page.locator("details").filter({
    has: page.getByText("They opened your link — vouch for them"),
  });
  if ((await panel.getAttribute("open")) === null) {
    await panel.locator("summary").click();
  }
  await panel.getByLabel("Join code").fill(inviteePubkey);
  await panel.getByRole("button", { name: "Vouch and send invite" }).click();
}

export async function bridgeApproveAdmission(page: Page, invitee: string): Promise<void> {
  await page.evaluate(
    (invitee) => window.__aethelosTest?.approveAdmission(invitee),
    invitee,
  );
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
  await bridgeApproveAdmission(founderPage, joinerPubkey);
  await joinerPage.getByRole("button", { name: "Community" }).click();
  await expect(joinerPage.getByText("The community approved your admission")).toBeVisible(
    { timeout: 60_000 },
  );
  await joinerPage.getByRole("button", { name: "Accept invite" }).click();
  await waitForConvergence(
    founderPage,
    joinerPage,
    (a, b) => a.memberCount === expectedMembers && b.memberCount === expectedMembers,
    60_000,
  );
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

/** Star topology: one founder vouches for N joiners via the real invite UX + bridge accept. */
export async function bootstrapStarCommunity(
  browser: { newContext: (opts?: object) => Promise<BrowserContext> },
  cellName: string,
  joinerLabels: string[],
): Promise<BootstrappedCommunity> {
  const contexts: BrowserContext[] = [];
  const founderCtx = await freshContext(browser);
  contexts.push(founderCtx);
  const founder = await founderCtx.newPage();
  await onboardGenesis(founder, "Founder", cellName);
  const link = await buildInviteLink(founder);

  const joiners: Page[] = [];
  const keys: string[] = [];
  const expectedCount = 1 + joinerLabels.length;

  for (let i = 0; i < joinerLabels.length; i++) {
    const ctx = await freshContext(browser);
    contexts.push(ctx);
    const page = await ctx.newPage();
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

export async function closeContexts(contexts: BrowserContext[]): Promise<void> {
  await Promise.all(contexts.map((c) => c.close()));
}
