import { test, expect } from "@playwright/test";
import { generateKeyPair } from "@aethelos/core";
import { encodeInvite, signInvitePayload } from "../src/app/invite.js";
import { createIdentity, RELAY_URL } from "./helpers.js";

const BASE = process.env.BASE_URL || "http://localhost:5173";

test.describe("invite link security", () => {
  test("tampered inviter pubkey is rejected at join", async ({ page }) => {
    const kp = await generateKeyPair();
    const signed = await signInvitePayload(
      {
        v: 1,
        ns: "inviter-tamper-ns",
        inviter: kp.publicKeyHex,
        cell: "Inviter Tamper Cell",
        relays: [RELAY_URL],
      },
      kp,
    );
    const tampered = { ...signed, inviter: "b".repeat(64) };
    const link = `${BASE}#/join?d=${encodeInvite(tampered)}`;
    await page.goto(link);
    await page.reload();
    await expect(page.getByText("You've been invited")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Create identity" }).click();
    await createIdentity(page, "Tamper Joiner", { fromInvite: true });
    await page.getByRole("button", { name: "Join this community" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: /signature is invalid/i }),
    ).toBeVisible({ timeout: 10_000 });
    const pool = await page.evaluate(
      () => window.__aethelosTest?.getPoolSummary() ?? null,
    );
    expect(pool).toBeNull();
  });

  test("tampered namespace is rejected at join", async ({ page }) => {
    const kp = await generateKeyPair();
    const signed = await signInvitePayload(
      {
        v: 1,
        ns: "namespace-tamper-ns",
        inviter: kp.publicKeyHex,
        cell: "Namespace Tamper Cell",
        relays: [RELAY_URL],
      },
      kp,
    );
    const tampered = { ...signed, ns: "evil-namespace" };
    const link = `${BASE}#/join?d=${encodeInvite(tampered)}`;
    await page.goto(link);
    await page.reload();
    await expect(page.getByText("You've been invited")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Create identity" }).click();
    await createIdentity(page, "Ns Tamper Joiner", { fromInvite: true });
    await page.getByRole("button", { name: "Join this community" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: /signature is invalid/i }),
    ).toBeVisible({ timeout: 10_000 });
    const pool = await page.evaluate(
      () => window.__aethelosTest?.getPoolSummary() ?? null,
    );
    expect(pool).toBeNull();
  });
});
