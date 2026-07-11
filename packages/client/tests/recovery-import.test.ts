import { describe, it, expect, beforeEach } from "vitest";
import {
  generateKeyPair,
  signEvent,
  reduceWithSnapshot,
  DEFAULT_PARAMETERS,
} from "@aethelos/core";
import { mergeActiveRelays } from "../src/app/active-relays.js";
import { useStore } from "../src/app/store.js";
import { createIdentity as ksCreate } from "../src/storage/keystore.js";

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

describe("recoverCommunityFromEventLog store wrapper", () => {
  beforeEach(() => {
    useStore.setState({
      myKey: "",
      displayName: "",
      session: null,
      phase: "onboarding",
    });
  });

  it("returns no_identity when no key is loaded", async () => {
    const r = await useStore.getState().recoverCommunityFromEventLog("[]");
    expect(r).toEqual({ ok: false, imported: 0, error: "no_identity" });
  });

  it("returns invalid_json for malformed JSON", async () => {
    const id = await ksCreate("pass", "Tester");
    useStore.setState({ myKey: id.keyPair.publicKeyHex, displayName: "Tester" });
    const r = await useStore.getState().recoverCommunityFromEventLog("{not-json");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("invalid_json");
  });

  it("returns no_valid_entries for an empty array", async () => {
    const id = await ksCreate("pass", "Tester");
    useStore.setState({ myKey: id.keyPair.publicKeyHex, displayName: "Tester" });
    const r = await useStore.getState().recoverCommunityFromEventLog("[]");
    expect(r).toEqual({ ok: false, imported: 0, error: "no_valid_entries" });
  });

  it("returns causal_orphan_log when history cannot connect", async () => {
    const kp = await generateKeyPair();
    const id = await ksCreate("pass", "Tester");
    useStore.setState({ myKey: id.keyPair.publicKeyHex, displayName: "Tester" });
    const ns = "orphan-import";
    const genesis = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 1,
        author: kp.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "genesis",
          cellName: "Orphan",
          initialPoints: "100",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      kp.privateKey,
    );
    const child = await signEvent(
      {
        namespaceId: ns,
        prevHash: genesis.id,
        lamport: 2,
        author: kp.publicKeyHex,
        timestamp: 2,
        payload: {
          type: "transaction",
          to: kp.publicKeyHex,
          amount: "1",
        },
      },
      kp.privateKey,
    );
    const r = await useStore
      .getState()
      .recoverCommunityFromEventLog(JSON.stringify([child]));
    expect(r).toEqual({ ok: false, imported: 0, error: "causal_orphan_log" });
  });

  it("imports a valid genesis log and writes session relay URLs", async () => {
    const kp = await generateKeyPair();
    const id = await ksCreate("pass", "Tester");
    useStore.setState({ myKey: id.keyPair.publicKeyHex, displayName: "Tester" });
    const ns = "store-import-ok";
    const genesis = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 1,
        author: kp.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "genesis",
          cellName: "OK",
          initialPoints: "500",
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
        payload: { type: "relay_contribute", url: "wss://ok.example" },
      },
      kp.privateKey,
    );
    const r = await useStore
      .getState()
      .recoverCommunityFromEventLog(JSON.stringify([genesis, contribute]));
    expect(r.ok).toBe(true);
    expect(r.namespaceId).toBe(ns);
    expect(useStore.getState().session?.namespaceId).toBe(ns);
    expect(useStore.getState().session?.relayUrls).toContain("wss://ok.example");
  });
});
