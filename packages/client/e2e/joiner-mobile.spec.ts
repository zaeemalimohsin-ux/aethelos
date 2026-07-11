import { test, expect, devices } from "@playwright/test";
import {
  buildInviteLink,
  joinViaInviteLink,
  getPublicKey,
  admitJoiner,
  waitForMemberCount,
  mobileFounderGenesis,
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

  await mobileFounderGenesis(founder, {
    displayName: "Docker Founder",
    communityName: "Docker Mobile Cell",
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
