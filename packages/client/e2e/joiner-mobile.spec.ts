import { test, expect, devices } from "@playwright/test";
import {
  buildInviteLink,
  joinViaInviteLink,
  getPublicKey,
  admitJoiner,
  waitForMemberCount,
  submitCreateIdentityForm,
} from "./helpers.js";

test.skip(
  process.env.AETHELOS_DOCKER !== "1",
  "Requires AETHELOS_DOCKER=1 and docker compose on port 8080",
);

test("mobile joiner completes admission on docker stack", async ({ browser }) => {
  test.setTimeout(180_000);
  const mobile = devices["Pixel 5"];
  const founderCtx = await browser.newContext({
    ...mobile,
    baseURL: "http://localhost:8080",
  });
  const joinerCtx = await browser.newContext({
    ...mobile,
    baseURL: "http://localhost:8080",
  });
  const founder = await founderCtx.newPage();
  const joiner = await joinerCtx.newPage();

  await founder.goto("/");
  await founder.getByRole("button", { name: "Create a new identity" }).click();
  await founder.getByLabel("Display name").fill("Docker Founder");
  await founder.getByLabel("Passphrase", { exact: true }).fill("founder-pass-123");
  await founder.getByLabel("Confirm passphrase").fill("founder-pass-123");
  await submitCreateIdentityForm(founder);
  await expect(founder.getByText("Save your recovery phrase")).toBeVisible({
    timeout: 15_000,
  });
  await founder.getByRole("checkbox").check();
  await founder.getByRole("button", { name: /Continue/ }).click();
  await founder.getByRole("button", { name: "Start a new community" }).click();
  await founder.getByLabel("Community name").fill("Docker Mobile Cell");
  await founder.getByRole("button", { name: "Create community" }).click();
  await expect(founder.getByRole("button", { name: "Community" })).toBeVisible({
    timeout: 45_000,
  });

  const inviteLink = await buildInviteLink(founder);
  await joinViaInviteLink(joiner, inviteLink, "Mobile Joiner");
  const joinerKey = await getPublicKey(joiner);
  await admitJoiner(founder, joiner, joinerKey);
  await waitForMemberCount(founder, 2);
  await waitForMemberCount(joiner, 2);

  await founderCtx.close();
  await joinerCtx.close();
});
