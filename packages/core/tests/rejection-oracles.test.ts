import { describe, it, expect } from "vitest";
import {
  generateKeyPair,
  signEvent,
  reduceEvents,
  reduceOneSync,
  createInitialState,
  DEFAULT_PARAMETERS,
  points,
  type PoolState,
} from "../src/index.js";

async function genesis(ns: string, kp: Awaited<ReturnType<typeof generateKeyPair>>) {
  return signEvent(
    {
      namespaceId: ns,
      prevHash: null,
      lamport: 1,
      author: kp.publicKeyHex,
      timestamp: 1_700_000_000_000,
      payload: {
        type: "genesis",
        cellName: "Oracle",
        initialPoints: "10000",
        parameters: DEFAULT_PARAMETERS,
      },
    },
    kp.privateKey,
  );
}

describe("rejection oracles", () => {
  it("author_frozen blocks subsequent signed events", async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();
    const ns = "frozen-author";
    const g = await genesis(ns, alice);
    const invite = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: alice.publicKeyHex,
        timestamp: 1_700_000_000_001,
        payload: { type: "invite", invitee: bob.publicKeyHex, vouchBondAmount: "500" },
      },
      alice.privateKey,
    );
    let state = reduceEvents(ns, [g, invite]);
    state = {
      ...state,
      frozen: [...state.frozen, alice.publicKeyHex],
      fractures: [...state.fractures, alice.publicKeyHex],
    };
    const tx = await signEvent(
      {
        namespaceId: ns,
        prevHash: invite.id,
        lamport: 3,
        author: alice.publicKeyHex,
        timestamp: 1_700_000_000_002,
        payload: { type: "transaction", to: bob.publicKeyHex, amount: "1" },
      },
      alice.privateKey,
    );
    const result = reduceOneSync(state, tx);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("author_frozen");
  });

  it("frozen voter cannot vote on proposals", async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();
    const ns = "frozen-voter";
    const g = await genesis(ns, alice);
    const state: PoolState = {
      ...reduceEvents(ns, [g]),
      frozen: [bob.publicKeyHex],
      fractures: [bob.publicKeyHex],
      proposals: {
        "prop-1": {
          id: "prop-1",
          kind: "expel_member",
          author: alice.publicKeyHex,
          data: { target: bob.publicKeyHex },
          closed: false,
          executed: false,
          votesFor: 0n,
          votesAgainst: 0n,
          voters: {},
        },
      },
    };
    const vote = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: bob.publicKeyHex,
        timestamp: 1_700_000_000_001,
        payload: { type: "proposal_vote", proposalId: "prop-1", approve: true },
      },
      bob.privateKey,
    );
    const result = reduceOneSync(state, vote);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("author_frozen");
  });
});
