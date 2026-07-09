import { test, expect } from "@playwright/test";
import { generateKeyPair } from "@aethelos/core";
import { encodeInvite, signInvitePayload } from "../src/app/invite.js";

test("join a community after identity, not on welcome screen", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Create a new identity" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Join a community" })).toHaveCount(0);

  await page.getByRole("button", { name: "Create a new identity" }).click();
  await page.getByLabel("Display name").fill("Join Tester");
  await page.getByLabel("Passphrase", { exact: true }).fill("supersecret123");
  await page.getByLabel("Confirm passphrase").fill("supersecret123");
  await page.getByRole("button", { name: "Create identity" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Continue/ }).click();

  await expect(page.getByRole("button", { name: "Join a community" })).toBeVisible();
  await page.getByRole("button", { name: "Join a community" }).click();

  const payload = {
    v: 1 as const,
    ns: "test-ns-join-ui",
    inviter: "a".repeat(64),
    cell: "Paste Test Cell",
    relays: ["ws://localhost:8787"],
  };
  const link = `http://localhost:5173/#/join?d=${encodeInvite(payload)}`;
  await page.getByLabel("Invite link").fill(link);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("You've been invited")).toBeVisible();
  await expect(page.getByText("Paste Test Cell", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Join this community" })).toBeVisible();
});

test("rejects join when all invite relays are unreachable", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Create a new identity" }).click();
  await page.getByLabel("Display name").fill("Probe Tester");
  await page.getByLabel("Passphrase", { exact: true }).fill("supersecret123");
  await page.getByLabel("Confirm passphrase").fill("supersecret123");
  await page.getByRole("button", { name: "Create identity" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Continue/ }).click();

  await page.getByRole("button", { name: "Join a community" }).click();

  const kp = await generateKeyPair();
  const payload = await signInvitePayload(
    {
      v: 1,
      ns: "probe-dead-relay-ns",
      inviter: kp.publicKeyHex,
      cell: "Unreachable Mailbox Cell",
      relays: ["ws://127.0.0.1:9/ws"],
    },
    kp,
  );
  const base = process.env.BASE_URL || "http://localhost:5173";
  const link = `${base}/#/join?d=${encodeInvite(payload)}`;
  await page.getByLabel("Invite link").fill(link);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("You've been invited")).toBeVisible();
  await page.evaluate(() => window.__aethelosTest?.setForceJoinProbe(true));
  await page.getByRole("button", { name: "Join this community" }).click();

  await expect(
    page.getByRole("alert").filter({
      hasText: "Can't reach the community mailbox",
    }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.evaluate(() => window.__aethelosTest?.getPoolSummary() ?? null),
  ).resolves.toBeNull();
  await expect(page.getByRole("button", { name: "Join this community" })).toBeVisible();
  await page.evaluate(() => window.__aethelosTest?.setForceJoinProbe(false));
});
