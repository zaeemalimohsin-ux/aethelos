import { test, expect, devices } from "@playwright/test";
import {
  buildInviteLink,
  joinViaInviteLink,
  getPublicKey,
  admitJoiner,
  waitForMemberCount,
  mobileFounderGenesis,
} from "./helpers.js";

const hostedUrl = process.env.AETHELOS_URL?.trim().replace(/\/$/, "");

test.skip(
  !hostedUrl,
  "Set AETHELOS_URL to the production hosted origin (https://app.aethelos.org)",
);

test("mobile joiner completes admission on hosted stack", async ({ browser }) => {
  test.setTimeout(300_000);

  const mobile = devices["Pixel 5"];
  const baseURL = hostedUrl!;
  const founderCtx = await browser.newContext({
    ...mobile,
    baseURL,
  });
  const joinerCtx = await browser.newContext({
    ...mobile,
    baseURL,
  });
  const founder = await founderCtx.newPage();
  const joiner = await joinerCtx.newPage();

  await mobileFounderGenesis(founder, {
    displayName: "Hosted Founder",
    communityName: "Hosted Mobile Cell",
    communityTimeoutMs: 90_000,
  });

  const inviteLink = await buildInviteLink(founder);
  expect(inviteLink).toMatch(new URL(baseURL).host);
  await joinViaInviteLink(joiner, inviteLink, "Hosted Joiner");
  const joinerKey = await getPublicKey(joiner);
  await admitJoiner(founder, joiner, joinerKey);
  await waitForMemberCount(founder, 2, 90_000);
  await waitForMemberCount(joiner, 2, 90_000);

  await founderCtx.close();
  await joinerCtx.close();
});
