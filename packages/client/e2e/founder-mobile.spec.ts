import { test, expect } from "@playwright/test";
import { mobileFounderGenesis } from "./helpers.js";

/**
 * Phone-first founder path against the Docker stack (port 8080, same-origin /ws).
 * Run with AETHELOS_DOCKER=1 and `docker compose up -d`.
 */
test.skip(
  process.env.AETHELOS_DOCKER !== "1",
  "Requires AETHELOS_DOCKER=1 and docker compose on port 8080",
);
test("phone founder starts a community on docker stack", async ({ page }) => {
  await mobileFounderGenesis(page, {
    displayName: "Mobile Founder",
    communityName: "Phone Community",
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
