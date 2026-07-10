import { describe, it, expect } from "vitest";
import {
  generateKeyPair,
  signEvent,
  reduceWithSnapshot,
  DEFAULT_PARAMETERS,
} from "@aethelos/core";
import { mergeActiveRelays } from "../src/app/active-relays.js";
import { selectRelaysForCommunity } from "../src/app/bootstrap-relays.js";

describe("recovery relay selection", () => {
  it("prefers communityRelays from imported log over bootstrap defaults", async () => {
    const kp = await generateKeyPair();
    const ns = "recovery-relays-ns";
    const genesis = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 1,
        author: kp.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "genesis",
          cellName: "Recovery",
          initialPoints: "1000",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      kp.privateKey,
    );
    const contribute = await signEvent(
      {
        namespaceId: ns,
        prevHash: genesis.id,
        lamport: 2,
        author: kp.publicKeyHex,
        timestamp: 2,
        payload: { type: "relay_contribute", url: "wss://ledger-mailbox.example" },
      },
      kp.privateKey,
    );
    const { state } = reduceWithSnapshot(ns, [genesis, contribute]);
    const relays = mergeActiveRelays([], state.communityRelays, ns);
    expect(relays).toContain("wss://ledger-mailbox.example");
    expect(relays).not.toEqual(selectRelaysForCommunity(ns));
  });
});
