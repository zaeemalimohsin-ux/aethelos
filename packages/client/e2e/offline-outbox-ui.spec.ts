import { test, expect } from "@playwright/test";
import {
  onboardGenesis,
  waitForPool,
  waitForSyncConnected,
  PASSWORD,
} from "./helpers.js";

const MAX_OUTBOX = 500;

async function seedFullOutbox(
  page: import("@playwright/test").Page,
  namespaceId: string,
): Promise<void> {
  await page.evaluate(
    async ({ ns, cap }) => {
      const envelopes = Array.from({ length: cap }, (_, i) => ({
        version: 1,
        namespaceId: ns,
        event: { id: `e2e-outbox-filler-${i}` },
      }));
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("aethelos-outbox", 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore("outbox", { keyPath: "namespaceId" });
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("outbox", "readwrite");
          tx.objectStore("outbox").put({ namespaceId: ns, envelopes });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    },
    { ns: namespaceId, cap: MAX_OUTBOX },
  );
}

async function unlockIfNeeded(page: import("@playwright/test").Page): Promise<void> {
  const unlockBtn = page.getByRole("button", { name: "Unlock" });
  if (await unlockBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.getByLabel("Passphrase").fill(PASSWORD);
    await unlockBtn.click();
  }
}

test.describe("offline outbox UI", () => {
  test("pending outbox grows while offline after invite", async ({ page }) => {
    await onboardGenesis(page, "Offline Founder", "Offline Cell");
    await waitForSyncConnected(page);
    await page.evaluate(() => window.__aethelosTest?.disconnectSyncForTests?.());

    await page.getByRole("button", { name: "Community" }).click();
    await page.getByLabel("Join code").fill("b".repeat(64));
    await page.getByRole("button", { name: "Vouch and send invite" }).click();

    const pool = await waitForPool(page, (p) => p.pendingInviteCount >= 1, 30_000);
    expect(pool.pendingInviteCount).toBeGreaterThanOrEqual(1);

    await expect
      .poll(
        async () =>
          page.evaluate(
            () => window.__aethelosTest?.getSyncStatus?.()?.pendingOutbox ?? 0,
          ),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);

    await expect(page.locator(".sync-indicator-btn").getByText(/\d+ queued/)).toBeVisible(
      {
        timeout: 10_000,
      },
    );
  });

  test("sync indicator shows Queue full when outbox is at cap", async ({ page }) => {
    test.setTimeout(90_000);
    await onboardGenesis(page, "Cap Founder", "Cap Cell");
    const namespaceId = await page.evaluate(
      () => window.__aethelosTest?.getNamespaceId?.() ?? null,
    );
    expect(namespaceId).toBeTruthy();

    await seedFullOutbox(page, namespaceId!);
    await page.reload({ waitUntil: "domcontentloaded" });
    await unlockIfNeeded(page);

    await expect(page.getByRole("button", { name: "Community" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator(".sync-indicator-btn").getByText("Queue full")).toBeVisible(
      {
        timeout: 30_000,
      },
    );
  });
});
