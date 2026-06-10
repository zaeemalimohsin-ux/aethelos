import { describe, it, expect } from "vitest";
import {
  generateKeyPair,
  canonicalJson,
  hashEvent,
  signEvent,
  verifyEvent,
  mergeEventLogs,
  sortEvents,
  reduceEvents,
  reduceOne,
  applyDecay,
  distributeRedistribution,
  totalPoolPoints,
  DEFAULT_PARAMETERS,
  type UnsignedEvent,
  type SignedEvent,
  points,
} from "../src/index.js";

async function makeGenesisEvent(
  namespaceId: string,
  author: Awaited<ReturnType<typeof generateKeyPair>>,
  initialPoints = "10000",
): Promise<SignedEvent> {
  const unsigned: UnsignedEvent = {
    namespaceId,
    prevHash: null,
    lamport: 1,
    author: author.publicKeyHex,
    timestamp: 1,
    payload: {
      type: "genesis",
      cellName: "Test Cell",
      initialPoints,
      parameters: { ...DEFAULT_PARAMETERS },
    },
  };
  return signEvent(unsigned, author.privateKey);
}

describe("canonical serialization", () => {
  it("sorts object keys deterministically", () => {
    const a = canonicalJson({ z: 1, a: 2, m: 3 });
    const b = canonicalJson({ a: 2, m: 3, z: 1 });
    expect(a).toBe(b);
  });
});

describe("DAG merge", () => {
  it("produces identical order regardless of input order", async () => {
    const kp = await generateKeyPair();
    const e1 = await makeGenesisEvent("cell-1", kp);
    const logA = mergeEventLogs([e1], []);
    const logB = mergeEventLogs([], [e1]);
    expect(sortEvents(logA).map((e) => e.id)).toEqual(sortEvents(logB).map((e) => e.id));
  });
});

describe("crypto", () => {
  it("signs and verifies events", async () => {
    const kp = await generateKeyPair();
    const event = await makeGenesisEvent("cell-1", kp);
    expect(await verifyEvent(event)).toBe(true);
    expect(event.id).toBe(hashEvent(event));
  });
});

describe("reducer", () => {
  it("initializes from genesis", async () => {
    const kp = await generateKeyPair();
    const event = await makeGenesisEvent("cell-1", kp);
    const state = reduceEvents("cell-1", [event]);
    expect(state.initialized).toBe(true);
    expect(state.members).toContain(kp.publicKeyHex);
    expect(state.balances[kp.publicKeyHex]).toBe(points("10000"));
  });

  it("detects fracture on double-spend", async () => {
    const kp = await generateKeyPair();
    const kp2 = await generateKeyPair();
    const genesis = await makeGenesisEvent("cell-1", kp, "1000");

    let state = reduceEvents("cell-1", [genesis]);

    const invite: UnsignedEvent = {
      namespaceId: "cell-1",
      prevHash: genesis.id,
      lamport: 2,
      author: kp.publicKeyHex,
      timestamp: 2,
      payload: {
        type: "invite",
        invitee: kp2.publicKeyHex,
        vouchBondAmount: "100",
        parameters: { ...DEFAULT_PARAMETERS },
      },
    };
    const inviteSigned = await signEvent(invite, kp.privateKey);
    const r1 = await reduceOne(state, inviteSigned);
    expect(r1.ok).toBe(true);
    state = r1.state;

    const vote: UnsignedEvent = {
      namespaceId: "cell-1",
      prevHash: inviteSigned.id,
      lamport: 3,
      author: kp.publicKeyHex,
      timestamp: 3,
      payload: {
        type: "proposal_vote",
        proposalId: `admit:${kp2.publicKeyHex}`,
        approve: true,
      },
    };
    const voteSigned = await signEvent(vote, kp.privateKey);
    const rVote = await reduceOne(state, voteSigned);
    expect(rVote.ok).toBe(true);
    state = rVote.state;

    const accept: UnsignedEvent = {
      namespaceId: "cell-1",
      prevHash: voteSigned.id,
      lamport: 4,
      author: kp2.publicKeyHex,
      timestamp: 4,
      payload: { type: "accept_invite", inviter: kp.publicKeyHex },
    };
    const acceptSigned = await signEvent(accept, kp2.privateKey);
    const r2 = await reduceOne(state, acceptSigned);
    state = r2.state;

    const tx1: UnsignedEvent = {
      namespaceId: "cell-1",
      prevHash: acceptSigned.id,
      lamport: 4,
      author: kp.publicKeyHex,
      timestamp: 4,
      payload: { type: "transaction", to: kp2.publicKeyHex, amount: "800" },
    };
    const tx2: UnsignedEvent = {
      namespaceId: "cell-1",
      prevHash: acceptSigned.id,
      lamport: 5,
      author: kp.publicKeyHex,
      timestamp: 5,
      payload: { type: "transaction", to: kp2.publicKeyHex, amount: "800" },
    };
    const tx1s = await signEvent(tx1, kp.privateKey);
    const tx2s = await signEvent(tx2, kp.privateKey);

    state = reduceEvents("cell-1", [
      genesis,
      inviteSigned,
      voteSigned,
      acceptSigned,
      tx1s,
      tx2s,
    ]);
    expect(state.frozen).toContain(kp.publicKeyHex);
    expect(state.fractures).toContain(kp.publicKeyHex);
  });
});

describe("economy integer conservation", () => {
  it("decimal transfers conserve total points", async () => {
    const kp = await generateKeyPair();
    const kp2 = await generateKeyPair();
    const genesis = await makeGenesisEvent("cell-dec", kp, "100");
    let state = reduceEvents("cell-dec", [genesis]);

    const inviteSigned = await signEvent(
      {
        namespaceId: "cell-dec",
        prevHash: genesis.id,
        lamport: 2,
        author: kp.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "invite",
          invitee: kp2.publicKeyHex,
          vouchBondAmount: "10",
          parameters: { ...DEFAULT_PARAMETERS },
        },
      },
      kp.privateKey,
    );
    const voteSigned = await signEvent(
      {
        namespaceId: "cell-dec",
        prevHash: inviteSigned.id,
        lamport: 3,
        author: kp.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "proposal_vote",
          proposalId: `admit:${kp2.publicKeyHex}`,
          approve: true,
        },
      },
      kp.privateKey,
    );
    const acceptSigned = await signEvent(
      {
        namespaceId: "cell-dec",
        prevHash: voteSigned.id,
        lamport: 4,
        author: kp2.publicKeyHex,
        timestamp: 1,
        payload: { type: "accept_invite", inviter: kp.publicKeyHex },
      },
      kp2.privateKey,
    );
    state = reduceEvents("cell-dec", [genesis, inviteSigned, voteSigned, acceptSigned]);

    const tx1 = await signEvent(
      {
        namespaceId: "cell-dec",
        prevHash: acceptSigned.id,
        lamport: 5,
        author: kp.publicKeyHex,
        timestamp: 1,
        payload: { type: "transaction", to: kp2.publicKeyHex, amount: "0.5" },
      },
      kp.privateKey,
    );
    const tx2 = await signEvent(
      {
        namespaceId: "cell-dec",
        prevHash: tx1.id,
        lamport: 6,
        author: kp.publicKeyHex,
        timestamp: 1,
        payload: { type: "transaction", to: kp2.publicKeyHex, amount: "0.25" },
      },
      kp.privateKey,
    );
    state = reduceEvents("cell-dec", [
      genesis,
      inviteSigned,
      voteSigned,
      acceptSigned,
      tx1,
      tx2,
    ]);
    expect(totalPoolPoints(state)).toBe(points("100"));
    expect(state.balances[kp2.publicKeyHex]).toBe(points("0.75"));
  });

  it("decay + redistribution preserves total points", () => {
    const state = {
      namespaceId: "cell-1",
      cellName: "Test",
      initialized: true,
      members: ["a", "b"],
      balances: { a: points("6000"), b: points("4000") },
      frozen: [],
      vouchLiens: {},
      inviters: {},
      head: "a",
      parameters: { ...DEFAULT_PARAMETERS },
      governanceSliders: {},
      redistributionSliders: {
        a: { a: 50, b: 50 },
        b: { a: 50, b: 50 },
      },
      vouchSliders: {},
      proposals: {},
      superstructureId: null,
      parentSuperstructures: [],
      epochNumber: 0,
      totalSupply: points("10000"),
      fractures: [],
      pendingInvites: {},
    };

    const before = totalPoolPoints(state);
    const { state: afterDecay, decayedTotal } = applyDecay(state, 1000);
    const targets = { a: 50, b: 50 };
    const after = distributeRedistribution(afterDecay, decayedTotal, targets);
    const afterTotal = totalPoolPoints(after);

    expect(afterTotal).toBe(before);
  });
});
