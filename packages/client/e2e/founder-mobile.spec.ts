import { test, expect } from "@playwright/test";

/**
 * Phone-first founder path against the Docker stack (port 8080, same-origin /ws).
 * Run with AETHELOS_DOCKER=1 and `docker compose up -d`.
 */
test.skip(
  process.env.AETHELOS_DOCKER !== "1",
  "Requires AETHELOS_DOCKER=1 and docker compose on port 8080",
);
test("phone founder starts a community on docker stack", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Create a new identity" }).click();
  await page.getByLabel("Display name").fill("Mobile Founder");
  await page.getByLabel("Passphrase", { exact: true }).fill("founder-pass-123");
  await page.getByLabel("Confirm passphrase").fill("founder-pass-123");
  await page.getByRole("button", { name: "Create identity" }).click();

  await expect(page.getByText("Save your recovery phrase")).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Continue/ }).click();

  await page.getByRole("button", { name: "Start a new community" }).click();
  await page.getByLabel("Community name").fill("Phone Community");
  await page.getByRole("button", { name: "Create community" }).click();

  await expect(page.getByRole("button", { name: "Community" })).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByText("100.0%", { exact: true })).toBeVisible();

  const sameOriginWs = await page.evaluate(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws`;
  });
  expect(sameOriginWs).toMatch(/\/ws$/);
  const host = new URL(page.url()).host;
  expect(sameOriginWs).toBe(`ws://${host}/ws`);
});
