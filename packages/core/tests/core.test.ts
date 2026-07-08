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
  resolveVouchHead,
  createInitialState,
  admissionProposalId,
  type PoolState,
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

describe("DAG causal ordering", () => {
  it("orders child after parent", async () => {
    const kp = await generateKeyPair();
    const g = await signEvent(
      {
        namespaceId: "topo-1",
        prevHash: null,
        lamport: 2,
        author: kp.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "genesis",
          cellName: "Dag",
          initialPoints: "100",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      kp.privateKey,
    );
    const child = await signEvent(
      {
        namespaceId: "topo-1",
        prevHash: g.id,
        lamport: 1,
        author: kp.publicKeyHex,
        timestamp: 2,
        payload: { type: "slider_update", parameter: "decay_rate", value: 5 },
      },
      kp.privateKey,
    );
    const { topologicalSort } = await import("../src/dag/index.js");
    expect(topologicalSort([child, g]).map((e) => e.id)).toEqual([g.id, child.id]);
  });

  it("holds orphans aside under partial logs", async () => {
    const { topologicalSort } = await import("../src/dag/index.js");
    const kp = await generateKeyPair();
    const g = await signEvent(
      {
        namespaceId: "topo-orphan",
        prevHash: null,
        lamport: 1,
        author: kp.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "genesis",
          cellName: "Dag",
          initialPoints: "100",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      kp.privateKey,
    );
    const orphan = await signEvent(
      {
        namespaceId: "topo-orphan",
        prevHash: "ab".repeat(32),
        lamport: 5,
        author: kp.publicKeyHex,
        timestamp: 5,
        payload: { type: "slider_update", parameter: "decay_rate", value: 6 },
      },
      kp.privateKey,
    );
    const ordered = topologicalSort([g, orphan]);
    expect(ordered.map((e) => e.id)).toEqual([g.id]);
    expect(ordered.some((e) => e.id === orphan.id)).toBe(false);
  });

  it("partial logs defer until parent merge", async () => {
    const { topologicalSort } = await import("../src/dag/index.js");
    const kp = await generateKeyPair();
    const g = await signEvent(
      {
        namespaceId: "topo-partial",
        prevHash: null,
        lamport: 1,
        author: kp.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "genesis",
          cellName: "Dag",
          initialPoints: "100",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      kp.privateKey,
    );
    const credit = await signEvent(
      {
        namespaceId: "topo-partial",
        prevHash: g.id,
        lamport: 2,
        author: kp.publicKeyHex,
        timestamp: 2,
        payload: { type: "slider_update", parameter: "decay_rate", value: 4 },
      },
      kp.privateKey,
    );
    const spend = await signEvent(
      {
        namespaceId: "topo-partial",
        prevHash: credit.id,
        lamport: 3,
        author: kp.publicKeyHex,
        timestamp: 3,
        payload: { type: "slider_update", parameter: "decay_rate", value: 3 },
      },
      kp.privateKey,
    );
    expect(topologicalSort([g, spend]).map((e) => e.id)).toEqual([g.id]);
    expect(topologicalSort([g, spend, credit]).map((e) => e.id)).toEqual([
      g.id,
      credit.id,
      spend.id,
    ]);
  });

  it("filterCausalClosure drops orphans", async () => {
    const { filterCausalClosure, isCausalClosure } = await import("../src/dag/index.js");
    const kp = await generateKeyPair();
    const g = await signEvent(
      {
        namespaceId: "closure-2",
        prevHash: null,
        lamport: 1,
        author: kp.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "genesis",
          cellName: "Dag",
          initialPoints: "100",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      kp.privateKey,
    );
    const child = await signEvent(
      {
        namespaceId: "closure-2",
        prevHash: g.id,
        lamport: 2,
        author: kp.publicKeyHex,
        timestamp: 2,
        payload: { type: "slider_update", parameter: "decay_rate", value: 7 },
      },
      kp.privateKey,
    );
    const orphan = await signEvent(
      {
        namespaceId: "closure-2",
        prevHash: "cc".repeat(32),
        lamport: 9,
        author: kp.publicKeyHex,
        timestamp: 9,
        payload: { type: "slider_update", parameter: "decay_rate", value: 8 },
      },
      kp.privateKey,
    );
    expect(isCausalClosure([g, child])).toBe(true);
    expect(isCausalClosure([g, orphan])).toBe(false);
    const { accepted, rejected } = filterCausalClosure([g, child, orphan]);
    expect(accepted.map((e) => e.id).sort()).toEqual([g.id, child.id].sort());
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.id).toBe(orphan.id);
  });
});

describe("Head auto-recall (vouch mandate)", () => {
  it("retains a sitting Head that is still an unfrozen member with no challenger", () => {
    const state: PoolState = {
      ...createInitialState("recall-keep"),
      initialized: true,
      members: ["a", "b"],
      balances: { a: points("100"), b: points("100") },
      head: "a",
      totalSupply: points("200"),
    };
    expect(resolveVouchHead(state)).toBe("a");
  });

  it("drops to null when the sitting Head is no longer a member and no challenger crosses threshold", () => {
    const state: PoolState = {
      ...createInitialState("recall-null"),
      initialized: true,
      members: ["b"],
      balances: { b: points("100") },
      head: "a", // 'a' departed/expelled — stale head must not linger
      totalSupply: points("100"),
    };
    expect(resolveVouchHead(state)).toBeNull();
  });

  it("installs a challenger that crosses the vouch threshold", () => {
    const state: PoolState = {
      ...createInitialState("recall-elect"),
      initialized: true,
      members: ["a", "b"],
      // 'a' holds >51% of stake so its single vouch can cross the threshold.
      balances: { a: points("200"), b: points("100") },
      head: "a",
      vouchSliders: { a: { b: 100 } },
      totalSupply: points("300"),
    };
    expect(resolveVouchHead(state)).toBe("b");
  });
});

describe("slider pruning on expulsion", () => {
  it("removes the expelled soul's slider rows and columns", async () => {
    const founder = await generateKeyPair();
    const joiner = await generateKeyPair();
    const ns = "prune-expel";
    const events: SignedEvent[] = [];
    let prev: string | null = null;
    let lamport = 0;
    const push = async (
      author: Awaited<ReturnType<typeof generateKeyPair>>,
      payload: SignedEvent["payload"],
    ) => {
      lamport++;
      const e = await signEvent(
        {
          namespaceId: ns,
          prevHash: prev,
          lamport,
          author: author.publicKeyHex,
          timestamp: lamport,
          payload,
        },
        author.privateKey,
      );
      events.push(e);
      prev = e.id;
    };

    await push(founder, {
      type: "genesis",
      cellName: "Prune",
      initialPoints: "10000",
      parameters: { ...DEFAULT_PARAMETERS },
    });
    await push(founder, {
      type: "invite",
      invitee: joiner.publicKeyHex,
      vouchBondAmount: "100",
      parameters: { ...DEFAULT_PARAMETERS },
    });
    await push(founder, {
      type: "proposal_vote",
      proposalId: admissionProposalId(joiner.publicKeyHex),
      approve: true,
    });
    await push(joiner, { type: "accept_invite", inviter: founder.publicKeyHex });
    // Joiner authors slider rows/columns that must be pruned on expulsion.
    await push(joiner, {
      type: "slider_update",
      parameter: "redistribution",
      target: founder.publicKeyHex,
      value: 60,
    });
    await push(joiner, { type: "vouch_update", target: founder.publicKeyHex, weight: 40 });
    // Expel the joiner (founder holds the stake to cross threshold).
    await push(founder, {
      type: "proposal_create",
      proposalId: "expel-j",
      kind: "expel_member",
      data: { target: joiner.publicKeyHex },
    });
    await push(founder, { type: "proposal_vote", proposalId: "expel-j", approve: true });

    const state = reduceEvents(ns, events);
    expect(state.members).not.toContain(joiner.publicKeyHex);
    expect(state.redistributionSliders[joiner.publicKeyHex]).toBeUndefined();
    expect(state.vouchSliders[joiner.publicKeyHex]).toBeUndefined();
    expect(state.governanceSliders[joiner.publicKeyHex]).toBeUndefined();
    for (const inner of Object.values(state.redistributionSliders)) {
      expect(inner[joiner.publicKeyHex]).toBeUndefined();
    }
    for (const inner of Object.values(state.vouchSliders)) {
      expect(inner[joiner.publicKeyHex]).toBeUndefined();
    }
  });
});
