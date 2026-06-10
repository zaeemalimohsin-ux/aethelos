import { test, expect } from "@playwright/test";
import { encodeInvite } from "../src/app/invite.js";

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
