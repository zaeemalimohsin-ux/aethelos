import { describe, it, expect } from "vitest";
import {
  generateKeyPair,
  reduceEvents,
  reduceOneSync,
  signEvent,
  DEFAULT_PARAMETERS,
} from "../src/index.js";

async function genesis(ns: string, kp: Awaited<ReturnType<typeof generateKeyPair>>) {
  return signEvent(
    {
      namespaceId: ns,
      prevHash: null,
      lamport: 1,
      author: kp.publicKeyHex,
      timestamp: 1,
      payload: {
        type: "genesis",
        cellName: "Relay Test",
        initialPoints: "10000",
        parameters: { ...DEFAULT_PARAMETERS },
      },
    },
    kp.privateKey,
  );
}

describe("relay_contribute", () => {
  it("appends a valid ws/wss URL for members", async () => {
    const kp = await generateKeyPair();
    const ns = "relay-contrib";
    const g = await genesis(ns, kp);
    const contribute = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 2,
        author: kp.publicKeyHex,
        timestamp: 2,
        payload: { type: "relay_contribute", url: "wss://mailbox.example.org" },
      },
      kp.privateKey,
    );

    const state = reduceEvents(ns, [g, contribute]);
    expect(state.communityRelays).toEqual(["wss://mailbox.example.org"]);
    expect(state.communityRelayAuthors?.["wss://mailbox.example.org"]).toBe(
      kp.publicKeyHex,
    );
  });

  it("replaces a member's prior URL on re-contribute", async () => {
    const kp = await generateKeyPair();
    const ns = "relay-replace";
    const g = await genesis(ns, kp);
    const first = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 2,
        author: kp.publicKeyHex,
        timestamp: 2,
        payload: { type: "relay_contribute", url: "wss://old.example.org" },
      },
      kp.privateKey,
    );
    const second = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 3,
        author: kp.publicKeyHex,
        timestamp: 3,
        payload: { type: "relay_contribute", url: "wss://new.example.org" },
      },
      kp.privateKey,
    );

    const state = reduceEvents(ns, [g, first, second]);
    expect(state.communityRelays).toEqual(["wss://new.example.org"]);
    expect(state.communityRelayAuthors?.["wss://old.example.org"]).toBeUndefined();
  });

  it("dedupes identical URLs idempotently", async () => {
    const kp = await generateKeyPair();
    const ns = "relay-dedupe";
    const g = await genesis(ns, kp);
    const first = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 2,
        author: kp.publicKeyHex,
        timestamp: 2,
        payload: { type: "relay_contribute", url: "ws://127.0.0.1:8787" },
      },
      kp.privateKey,
    );
    const second = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 3,
        author: kp.publicKeyHex,
        timestamp: 3,
        payload: { type: "relay_contribute", url: "ws://127.0.0.1:8787" },
      },
      kp.privateKey,
    );

    const state = reduceEvents(ns, [g, first, second]);
    expect(state.communityRelays).toEqual(["ws://127.0.0.1:8787"]);
  });

  it("rejects non-members and invalid URLs", async () => {
    const founder = await generateKeyPair();
    const outsider = await generateKeyPair();
    const ns = "relay-guard";
    const g = await genesis(ns, founder);

    const outsiderContrib = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 2,
        author: outsider.publicKeyHex,
        timestamp: 2,
        payload: { type: "relay_contribute", url: "wss://evil.example.org" },
      },
      outsider.privateKey,
    );
    const badUrl = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 3,
        author: founder.publicKeyHex,
        timestamp: 3,
        payload: { type: "relay_contribute", url: "https://not-a-relay.example.org" },
      },
      founder.privateKey,
    );

    const afterGenesis = reduceEvents(ns, [g]);
    const afterOutsider = reduceOneSync(afterGenesis, outsiderContrib);
    expect(afterOutsider.ok).toBe(false);
    expect(afterOutsider.reason).toBe("not_member");

    const afterBad = reduceOneSync(afterGenesis, badUrl);
    expect(afterBad.ok).toBe(false);
    expect(afterBad.reason).toBe("invalid_relay_url");
  });

  it("caps community relays at eight", async () => {
    const kp = await generateKeyPair();
    const ns = "relay-cap";
    const g = await genesis(ns, kp);
    let state = reduceEvents(ns, [g]);
    const authors = await Promise.all(Array.from({ length: 8 }, () => generateKeyPair()));
    for (let i = 0; i < 8; i++) {
      const url = `wss://relay-${i}.example.org`;
      state = {
        ...state,
        members: [...state.members, authors[i]!.publicKeyHex],
        communityRelays: [...(state.communityRelays ?? []), url],
        communityRelayAuthors: {
          ...(state.communityRelayAuthors ?? {}),
          [url]: authors[i]!.publicKeyHex,
        },
      };
    }
    const ninth = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 99,
        author: kp.publicKeyHex,
        timestamp: 99,
        payload: { type: "relay_contribute", url: "wss://relay-8.example.org" },
      },
      kp.privateKey,
    );
    const after = reduceOneSync(state, ninth);
    expect(after.ok).toBe(false);
    expect(after.reason).toBe("relay_cap_reached");
  });
});

describe("relay_revoke", () => {
  it("lets the author remove their published URL", async () => {
    const kp = await generateKeyPair();
    const ns = "relay-revoke";
    const g = await genesis(ns, kp);
    const contribute = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 2,
        author: kp.publicKeyHex,
        timestamp: 2,
        payload: { type: "relay_contribute", url: "wss://mine.example.org" },
      },
      kp.privateKey,
    );
    const revoke = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 3,
        author: kp.publicKeyHex,
        timestamp: 3,
        payload: { type: "relay_revoke", url: "wss://mine.example.org" },
      },
      kp.privateKey,
    );

    const state = reduceEvents(ns, [g, contribute, revoke]);
    expect(state.communityRelays).toEqual([]);
    expect(state.communityRelayAuthors?.["wss://mine.example.org"]).toBeUndefined();
  });

  it("rejects revoke from non-author", async () => {
    const founder = await generateKeyPair();
    const other = await generateKeyPair();
    const ns = "relay-revoke-guard";
    const g = await genesis(ns, founder);
    const contribute = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 2,
        author: founder.publicKeyHex,
        timestamp: 2,
        payload: { type: "relay_contribute", url: "wss://founder.example.org" },
      },
      founder.privateKey,
    );
    let state = reduceEvents(ns, [g, contribute]);
    state = { ...state, members: [...state.members, other.publicKeyHex] };
    const revoke = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 3,
        author: other.publicKeyHex,
        timestamp: 3,
        payload: { type: "relay_revoke", url: "wss://founder.example.org" },
      },
      other.privateKey,
    );
    const after = reduceOneSync(state, revoke);
    expect(after.ok).toBe(false);
    expect(after.reason).toBe("not_author");
  });
});
