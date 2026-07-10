import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateKeyPair,
  signEvent,
  reduceWithSnapshot,
  DEFAULT_PARAMETERS,
} from "@aethelos/core";
import { mergeActiveRelays } from "../src/app/active-relays.js";

describe("recoverCommunityFromEventLog relay derivation", () => {
  it("merges ledger communityRelays from imported events", async () => {
    const kp = await generateKeyPair();
    const ns = "import-relays";
    const genesis = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 1,
        author: kp.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "genesis",
          cellName: "Import",
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
        payload: { type: "relay_contribute", url: "wss://import-mailbox.example" },
      },
      kp.privateKey,
    );
    const { state } = reduceWithSnapshot(ns, [genesis, contribute]);
    const relays = mergeActiveRelays([], state.communityRelays, ns);
    expect(relays).toContain("wss://import-mailbox.example");
  });
});
