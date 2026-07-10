import { describe, it, expect } from "vitest";
import {
  generateKeyPair,
  mergeEventLogs,
  sortEvents,
  reduceEvents,
  reduceOneSync,
  runRedistributionCycle,
  signEvent,
  totalPoolPoints,
  applyDecay,
  distributeRedistribution,
  createInitialState,
  admissionProposalId,
  requiredVouchLien,
  countActiveVouches,
  resolveRedistributionTargets,
  isEligibleRecipient,
  DEFAULT_PARAMETERS,
  MS_PER_DAY,
  MS_PER_MINUTE,
  TIMESTAMP_FORWARD_SKEW_MS,
  type PoolState,
  type SignedEvent,
  points,
} from "../src/index.js";

function shuffle<T>(arr: T[], seed = 7): T[] {
  // Deterministic Fisher-Yates with a tiny LCG so the test is reproducible.
  const a = [...arr];
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

async function genesis(
  ns: string,
  kp: Awaited<ReturnType<typeof generateKeyPair>>,
  points = "10000",
) {
  return signEvent(
    {
      namespaceId: ns,
      prevHash: null,
      lamport: 1,
      author: kp.publicKeyHex,
      timestamp: 1,
      payload: {
        type: "genesis",
        cellName: "Sim",
        initialPoints: points,
        parameters: { ...DEFAULT_PARAMETERS },
      },
    },
    kp.privateKey,
  );
}

describe("replay equivalence", () => {
  it("same state regardless of event arrival order", async () => {
    const a = await generateKeyPair();
    const ns = "replay-test";
    const g = await genesis(ns, a);

    const events: SignedEvent[] = [g];
    const orderA = reduceEvents(ns, events);
    const orderB = reduceEvents(ns, [...events].reverse());
    expect(orderA.balances[a.publicKeyHex]).toBe(orderB.balances[a.publicKeyHex]);
  });

  it("merge is commutative", async () => {
    const kp = await generateKeyPair();
    const e = await genesis("m", kp);
    const m1 = mergeEventLogs([e], []);
    const m2 = mergeEventLogs([], [e]);
    expect(sortEvents(m1).map((x) => x.id)).toEqual(sortEvents(m2).map((x) => x.id));
  });
});

describe("integer conservation", () => {
  it("decay + redistribution never creates or destroys points", () => {
    const base = {
      namespaceId: "c",
      cellName: "C",
      initialized: true,
      members: ["x", "y", "z"],
      balances: { x: points("5000"), y: points("3000"), z: points("2000") },
      frozen: [],
      vouchLiens: {},
      inviters: {},
      head: "x",
      parameters: { ...DEFAULT_PARAMETERS, decay_rate: 7 },
      governanceSliders: {},
      redistributionSliders: {
        x: { x: 33, y: 33, z: 34 },
        y: { x: 50, y: 25, z: 25 },
        z: { x: 20, y: 40, z: 40 },
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

    const before = totalPoolPoints(base);
    const { state: decayed, decayedTotal } = applyDecay(base, 700);
    const after = distributeRedistribution(decayed, decayedTotal, {
      x: 33.33,
      y: 33.33,
      z: 33.34,
    });
    expect(totalPoolPoints(after)).toBe(before);
  });
});

describe("fracture detection", () => {
  it("flags double-spend offline sync", async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();
    const ns = "fracture-test";
    const g = await genesis(ns, alice, "500");

    const invite = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: alice.publicKeyHex,
        timestamp: 2,
        payload: {
          type: "invite",
          invitee: bob.publicKeyHex,
          vouchBondAmount: "50",
          parameters: { ...DEFAULT_PARAMETERS },
        },
      },
      alice.privateKey,
    );

    const admitVote = await signEvent(
      {
        namespaceId: ns,
        prevHash: invite.id,
        lamport: 3,
        author: alice.publicKeyHex,
        timestamp: 3,
        payload: {
          type: "proposal_vote",
          proposalId: admissionProposalId(bob.publicKeyHex),
          approve: true,
        },
      },
      alice.privateKey,
    );

    const accept = await signEvent(
      {
        namespaceId: ns,
        prevHash: admitVote.id,
        lamport: 4,
        author: bob.publicKeyHex,
        timestamp: 4,
        payload: { type: "accept_invite", inviter: alice.publicKeyHex },
      },
      bob.privateKey,
    );

    const txA = await signEvent(
      {
        namespaceId: ns,
        prevHash: accept.id,
        lamport: 5,
        author: alice.publicKeyHex,
        timestamp: 4,
        payload: { type: "transaction", to: bob.publicKeyHex, amount: "400" },
      },
      alice.privateKey,
    );
    const txB = await signEvent(
      {
        namespaceId: ns,
        prevHash: accept.id,
        lamport: 6,
        author: alice.publicKeyHex,
        timestamp: 6,
        payload: { type: "transaction", to: bob.publicKeyHex, amount: "400" },
      },
      alice.privateKey,
    );

    const final = reduceEvents(ns, [g, invite, admitVote, accept, txA, txB]);
    expect(final.fractures).toContain(alice.publicKeyHex);
    expect(final.frozen).toContain(alice.publicKeyHex);
  });
});

describe("vouch lien gate", () => {
  it("rejects invite when lien would exceed available pledge capacity", async () => {
    const poor = await generateKeyPair();
    const ns = "lien-cap";
    const g = await genesis(ns, poor, "100");
    let state = reduceEvents(ns, [g]);
    state = {
      ...state,
      vouchLiens: {
        existing: { inviter: poor.publicKeyHex, amount: points("96") },
      },
    };

    const invite = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: poor.publicKeyHex,
        timestamp: 2,
        payload: {
          type: "invite",
          invitee: "abc",
          vouchBondAmount: "500",
          parameters: { ...DEFAULT_PARAMETERS },
        },
      },
      poor.privateKey,
    );

    const r = reduceOneSync(state, invite);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("lien_exceeds_self");
    expect(r.state.pendingInvites["abc"]).toBeUndefined();
  });
});

describe("governance", () => {
  it("self-vouch is rejected", async () => {
    const kp = await generateKeyPair();
    const ns = "gov-test";
    const g = await genesis(ns, kp);

    const selfVouch = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: kp.publicKeyHex,
        timestamp: 2,
        payload: { type: "vouch_update", target: kp.publicKeyHex, weight: 100 },
      },
      kp.privateKey,
    );

    const before = reduceEvents(ns, [g]);
    const after = reduceEvents(ns, [g, selfVouch]);
    expect(after.vouchSliders).toEqual(before.vouchSliders);
  });
});

// R1 - the equal-weight redistribution can no longer be farmed by puppet souls.
describe("R1 Sybil resistance", () => {
  it("required Vouch Lien scales super-linearly with souls sustained", () => {
    const s0: PoolState = {
      ...createInitialState("n"),
      members: ["alice"],
      balances: { alice: points("1000") },
    };
    const r0 = requiredVouchLien(s0, "alice");

    const s1: PoolState = {
      ...s0,
      vouchLiens: { bob: { inviter: "alice", amount: points("50") } },
    };
    const r1 = requiredVouchLien(s1, "alice");

    expect(countActiveVouches(s1, "alice")).toBe(1);
    expect(r0).toBe(points("50")); // 1000 * 5% * 1
    expect(r1).toBe(points("100")); // 1000 * 5% * 2 — each further soul costs more
    expect(r1 > r0).toBe(true);
  });

  it("liens ride inside balances and decay implicitly", () => {
    const s: PoolState = {
      ...createInitialState("n"),
      members: ["alice"],
      balances: { alice: points("1000") },
      vouchLiens: { bob: { inviter: "alice", amount: points("200") } },
    };
    const { state: after, decayedTotal } = applyDecay(s, 1000);
    expect(after.balances["alice"]).toBe(points("900"));
    expect(after.vouchLiens["bob"]!.amount).toBe(points("200"));
    expect(decayedTotal).toBe(points("100"));
  });

  it("non-live puppet is excluded from redistribution", () => {
    const t0 = 1_700_000_000_000;
    const asOf = t0 + 20 * MS_PER_MINUTE;
    const s: PoolState = {
      ...createInitialState("n"),
      members: ["alice", "puppet"],
      balances: { alice: points("1000"), puppet: 0n },
      inviters: { puppet: "alice" },
      vouchLiens: { puppet: { inviter: "alice", amount: points("50") } },
      parameters: { ...DEFAULT_PARAMETERS, epoch_interval: 15 },
      genesisTimestamp: t0,
      lastEpochTimestamp: t0,
      lastAccrualTimestamp: t0,
      lastRedistributionTimestamp: t0,
      maxEventTimestamp: asOf,
      lastActiveTimestamp: { alice: asOf, puppet: t0 },
    };
    expect(isEligibleRecipient(s, "alice", asOf)).toBe(true);
    expect(isEligibleRecipient(s, "puppet", asOf)).toBe(false);
    const targets = resolveRedistributionTargets(s, asOf);
    expect(Object.keys(targets)).toEqual(["alice"]);
  });
});

// R2 - decay is recipient-less circulation, not appropriation by any agent.
describe("R2 decay credits no agent", () => {
  it("redistribution conserves all Points and mints nothing", () => {
    const t0 = 1_700_000_000_000;
    const asOf = t0 + 5 * MS_PER_MINUTE;
    const s: PoolState = {
      ...createInitialState("e"),
      initialized: true,
      members: ["alice", "bob"],
      balances: { alice: points("6000"), bob: points("4000") },
      commons: points("100"),
      inviters: { bob: "alice" },
      vouchLiens: { bob: { inviter: "alice", amount: 0n } },
      head: "alice",
      parameters: { ...DEFAULT_PARAMETERS, decay_rate: 10, epoch_interval: 15 },
      redistributionSliders: {
        alice: { alice: 50, bob: 50 },
        bob: { alice: 50, bob: 50 },
      },
      totalSupply: points("10000"),
      lastEpochTimestamp: t0,
      lastAccrualTimestamp: t0,
      lastRedistributionTimestamp: t0,
      genesisTimestamp: t0,
      maxEventTimestamp: asOf,
      lastActiveTimestamp: { alice: asOf, bob: asOf },
      circulationCarry: 0n,
    };
    const before = totalPoolPoints(s);
    const after = runRedistributionCycle(s, asOf);
    expect(totalPoolPoints(after)).toBe(before);
    expect(after.totalSupply).toBe(s.totalSupply);
    expect(after.epochNumber).toBe(s.epochNumber + 1);
  });
});

// R3 - Epochs are derived from log progress; order of arrival cannot change the result.
describe("R3 deterministic epochs", () => {
  it("identical state for shuffled event arrival, with auto-epochs", async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();
    const ns = "epoch-det";
    const t0 = 1_700_000_000_000;

    const skew = TIMESTAMP_FORWARD_SKEW_MS;

    const g = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 1,
        author: alice.publicKeyHex,
        timestamp: t0,
        payload: {
          type: "genesis",
          cellName: "E",
          initialPoints: "10000",
          parameters: { ...DEFAULT_PARAMETERS, epoch_interval: 15 },
        },
      },
      alice.privateKey,
    );
    const invite = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: alice.publicKeyHex,
        timestamp: t0 + skew,
        payload: {
          type: "invite",
          invitee: bob.publicKeyHex,
          vouchBondAmount: "500",
          parameters: { ...DEFAULT_PARAMETERS, epoch_interval: 15 },
        },
      },
      alice.privateKey,
    );
    const admitVote = await signEvent(
      {
        namespaceId: ns,
        prevHash: invite.id,
        lamport: 3,
        author: alice.publicKeyHex,
        timestamp: t0 + 2 * skew,
        payload: {
          type: "proposal_vote",
          proposalId: admissionProposalId(bob.publicKeyHex),
          approve: true,
        },
      },
      alice.privateKey,
    );
    const accept = await signEvent(
      {
        namespaceId: ns,
        prevHash: admitVote.id,
        lamport: 4,
        author: bob.publicKeyHex,
        timestamp: t0 + 3 * skew,
        payload: { type: "accept_invite", inviter: alice.publicKeyHex },
      },
      bob.privateKey,
    );
    const tx1 = await signEvent(
      {
        namespaceId: ns,
        prevHash: accept.id,
        lamport: 5,
        author: alice.publicKeyHex,
        timestamp: t0 + 4 * skew,
        payload: { type: "transaction", to: bob.publicKeyHex, amount: "100" },
      },
      alice.privateKey,
    );
    const tx2 = await signEvent(
      {
        namespaceId: ns,
        prevHash: tx1.id,
        lamport: 6,
        author: bob.publicKeyHex,
        timestamp: t0 + 5 * skew,
        payload: { type: "transaction", to: alice.publicKeyHex, amount: "50" },
      },
      bob.privateKey,
    );

    const events = [g, invite, admitVote, accept, tx1, tx2];
    const inOrder = reduceEvents(ns, events);
    const shuffled = reduceEvents(ns, shuffle(events));

    expect(inOrder.epochNumber).toBeGreaterThan(0);
    expect(shuffled.epochNumber).toBe(inOrder.epochNumber);
    expect(shuffled.balances).toEqual(inOrder.balances);
    expect(totalPoolPoints(shuffled)).toBe(totalPoolPoints(inOrder));
  });
});

// R7 - honest receive-then-spend cannot manufacture a false Fracture.
describe("R7 no false fracture", () => {
  it("causal ordering applies funding before the dependent spend", async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();
    const ns = "no-false-fracture";

    const params = { ...DEFAULT_PARAMETERS, epoch_interval: 100 };
    const g = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 1,
        author: alice.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "genesis",
          cellName: "F",
          initialPoints: "10000",
          parameters: params,
        },
      },
      alice.privateKey,
    );
    const invite = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: alice.publicKeyHex,
        timestamp: 2,
        payload: {
          type: "invite",
          invitee: bob.publicKeyHex,
          vouchBondAmount: "500",
          parameters: params,
        },
      },
      alice.privateKey,
    );
    const admitVote = await signEvent(
      {
        namespaceId: ns,
        prevHash: invite.id,
        lamport: 3,
        author: alice.publicKeyHex,
        timestamp: 3,
        payload: {
          type: "proposal_vote",
          proposalId: admissionProposalId(bob.publicKeyHex),
          approve: true,
        },
      },
      alice.privateKey,
    );
    const accept = await signEvent(
      {
        namespaceId: ns,
        prevHash: admitVote.id,
        lamport: 4,
        author: bob.publicKeyHex,
        timestamp: 4,
        payload: { type: "accept_invite", inviter: alice.publicKeyHex },
      },
      bob.privateKey,
    );
    // Funding credit to bob.
    const credit = await signEvent(
      {
        namespaceId: ns,
        prevHash: accept.id,
        lamport: 6,
        author: alice.publicKeyHex,
        timestamp: 4,
        payload: { type: "transaction", to: bob.publicKeyHex, amount: "500" },
      },
      alice.privateKey,
    );
    // Bob spends, causally AFTER the credit (prevHash = credit), but with a LOWER Lamport.
    // A naive Lamport-only sort would misorder this and falsely Fracture bob.
    const spend = await signEvent(
      {
        namespaceId: ns,
        prevHash: credit.id,
        lamport: 4,
        author: bob.publicKeyHex,
        timestamp: 4,
        payload: { type: "transaction", to: alice.publicKeyHex, amount: "400" },
      },
      bob.privateKey,
    );

    const state = reduceEvents(ns, [g, invite, admitVote, accept, credit, spend]);
    expect(state.fractures).not.toContain(bob.publicKeyHex);
    expect(state.frozen).not.toContain(bob.publicKeyHex);
    expect(state.balances[bob.publicKeyHex]).toBe(points("100")); // 0 + 500 - 400
  });
});

// Charter A: Double-Spend Fracture and Unfreeze Recovery
describe("Charter A (P1.3): Fracture and Recovery", () => {
  it("freezes a double-spender and allows community to unfreeze via proposal", async () => {
    const alice = await generateKeyPair(); // Head
    const bob = await generateKeyPair(); // Double spender
    const ns = "charter-a";

    // Setup
    const g = await genesis(ns, alice, "1000");
    const invite = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: alice.publicKeyHex,
        timestamp: 2,
        payload: {
          type: "invite",
          invitee: bob.publicKeyHex,
          vouchBondAmount: "100",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      alice.privateKey,
    );
    const admitVote = await signEvent(
      {
        namespaceId: ns,
        prevHash: invite.id,
        lamport: 3,
        author: alice.publicKeyHex,
        timestamp: 3,
        payload: {
          type: "proposal_vote",
          proposalId: admissionProposalId(bob.publicKeyHex),
          approve: true,
        },
      },
      alice.privateKey,
    );
    const accept = await signEvent(
      {
        namespaceId: ns,
        prevHash: admitVote.id,
        lamport: 4,
        author: bob.publicKeyHex,
        timestamp: 4,
        payload: { type: "accept_invite", inviter: alice.publicKeyHex },
      },
      bob.privateKey,
    );
    const fund = await signEvent(
      {
        namespaceId: ns,
        prevHash: accept.id,
        lamport: 5,
        author: alice.publicKeyHex,
        timestamp: 5,
        payload: { type: "transaction", to: bob.publicKeyHex, amount: "500" },
      },
      alice.privateKey,
    );

    // Double spend
    const tx1 = await signEvent(
      {
        namespaceId: ns,
        prevHash: fund.id,
        lamport: 6,
        author: bob.publicKeyHex,
        timestamp: 6,
        payload: { type: "transaction", to: alice.publicKeyHex, amount: "500" },
      },
      bob.privateKey,
    );
    const tx2 = await signEvent(
      {
        namespaceId: ns,
        prevHash: fund.id,
        lamport: 7,
        author: bob.publicKeyHex,
        timestamp: 7,
        payload: { type: "transaction", to: alice.publicKeyHex, amount: "500" },
      },
      bob.privateKey,
    );

    let state = reduceEvents(ns, [g, invite, admitVote, accept, fund, tx1, tx2]);
    expect(state.fractures).toContain(bob.publicKeyHex);
    expect(state.frozen).toContain(bob.publicKeyHex);

    // Unfreeze recovery
    const propId = "unfreeze-bob-1";
    const createProp = await signEvent(
      {
        namespaceId: ns,
        prevHash: tx2.id,
        lamport: 8,
        author: alice.publicKeyHex,
        timestamp: 8,
        payload: {
          type: "proposal_create",
          proposalId: propId,
          kind: "resolve_fracture",
          data: { target: bob.publicKeyHex, action: "unfreeze" },
        },
      },
      alice.privateKey,
    );
    const voteProp = await signEvent(
      {
        namespaceId: ns,
        prevHash: createProp.id,
        lamport: 9,
        author: alice.publicKeyHex,
        timestamp: 9,
        payload: { type: "proposal_vote", proposalId: propId, approve: true },
      },
      alice.privateKey,
    );

    state = reduceEvents(ns, [
      g,
      invite,
      admitVote,
      accept,
      fund,
      tx1,
      tx2,
      createProp,
      voteProp,
    ]);
    expect(state.frozen).not.toContain(bob.publicKeyHex); // Successfully recovered
  });
});

// Charter B: Head-only Superstructure Proposals
describe("Charter B (P4.5): Head-only Proposal Closures", () => {
  it("rejects proposal_close from non-head members", async () => {
    const head = await generateKeyPair();
    const pleb = await generateKeyPair();
    const ns = "charter-b";

    const g = await genesis(ns, head, "1000");
    const invite = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: head.publicKeyHex,
        timestamp: 2,
        payload: {
          type: "invite",
          invitee: pleb.publicKeyHex,
          vouchBondAmount: "100",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      head.privateKey,
    );
    const admitVote = await signEvent(
      {
        namespaceId: ns,
        prevHash: invite.id,
        lamport: 3,
        author: head.publicKeyHex,
        timestamp: 3,
        payload: {
          type: "proposal_vote",
          proposalId: admissionProposalId(pleb.publicKeyHex),
          approve: true,
        },
      },
      head.privateKey,
    );
    const accept = await signEvent(
      {
        namespaceId: ns,
        prevHash: admitVote.id,
        lamport: 4,
        author: pleb.publicKeyHex,
        timestamp: 4,
        payload: { type: "accept_invite", inviter: head.publicKeyHex },
      },
      pleb.privateKey,
    );
    const propId = "test-prop";
    const createProp = await signEvent(
      {
        namespaceId: ns,
        prevHash: accept.id,
        lamport: 5,
        author: head.publicKeyHex,
        timestamp: 5,
        payload: {
          type: "proposal_create",
          proposalId: propId,
          kind: "join_superstructure",
          data: { target: "remote" },
        },
      },
      head.privateKey,
    );

    // Pleb tries to close
    const plebClose = await signEvent(
      {
        namespaceId: ns,
        prevHash: createProp.id,
        lamport: 6,
        author: pleb.publicKeyHex,
        timestamp: 6,
        payload: { type: "proposal_close", proposalId: propId },
      },
      pleb.privateKey,
    );

    const statePleb = reduceOneSync(
      reduceEvents(ns, [g, invite, admitVote, accept, createProp]),
      plebClose,
    );
    expect(statePleb.ok).toBe(false);
    expect(statePleb.reason).toBe("head_only");

    // Head tries to close
    const headClose = await signEvent(
      {
        namespaceId: ns,
        prevHash: createProp.id,
        lamport: 7,
        author: head.publicKeyHex,
        timestamp: 7,
        payload: { type: "proposal_close", proposalId: propId },
      },
      head.privateKey,
    );

    const stateHead = reduceOneSync(
      reduceEvents(ns, [g, invite, admitVote, accept, createProp]),
      headClose,
    );
    expect(stateHead.ok).toBe(true);
    expect(stateHead.state.proposals[propId]?.closed).toBe(true);
  });
});

// Charter C: Head Capture (Anti-Dictator Theorem)
describe("Charter C (P5.2): Dictator Rejection", () => {
  it("prevents the Head from executing fiat appropriations or bypassing proposals", async () => {
    const head = await generateKeyPair();
    const pleb = await generateKeyPair();
    const ns = "charter-c";

    const g = await genesis(ns, head, "1000");
    const invite = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: head.publicKeyHex,
        timestamp: 2,
        payload: {
          type: "invite",
          invitee: pleb.publicKeyHex,
          vouchBondAmount: "100",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      head.privateKey,
    );
    const admitVote = await signEvent(
      {
        namespaceId: ns,
        prevHash: invite.id,
        lamport: 3,
        author: head.publicKeyHex,
        timestamp: 3,
        payload: {
          type: "proposal_vote",
          proposalId: admissionProposalId(pleb.publicKeyHex),
          approve: true,
        },
      },
      head.privateKey,
    );
    const accept = await signEvent(
      {
        namespaceId: ns,
        prevHash: admitVote.id,
        lamport: 4,
        author: pleb.publicKeyHex,
        timestamp: 4,
        payload: { type: "accept_invite", inviter: head.publicKeyHex },
      },
      pleb.privateKey,
    );
    const fund = await signEvent(
      {
        namespaceId: ns,
        prevHash: accept.id,
        lamport: 5,
        author: head.publicKeyHex,
        timestamp: 5,
        payload: { type: "transaction", to: pleb.publicKeyHex, amount: "500" },
      },
      head.privateKey,
    );

    const baseState = reduceEvents(ns, [g, invite, admitVote, accept, fund]);

    // Dictator attempts to expel pleb directly without a proposal
    const fiatExpel = await signEvent(
      {
        namespaceId: ns,
        prevHash: fund.id,
        lamport: 6,
        author: head.publicKeyHex,
        timestamp: 6,
        payload: { type: "expel", target: pleb.publicKeyHex },
      },
      head.privateKey,
    );
    const expelResult = reduceOneSync(baseState, fiatExpel);
    expect(expelResult.ok).toBe(false);
    expect(expelResult.reason).toBe("use_proposal");

    // Dictator attempts to unfreeze someone directly
    const fiatUnfreeze = await signEvent(
      {
        namespaceId: ns,
        prevHash: fund.id,
        lamport: 7,
        author: head.publicKeyHex,
        timestamp: 7,
        payload: {
          type: "freeze_resolve",
          target: pleb.publicKeyHex,
          action: "unfreeze",
        },
      },
      head.privateKey,
    );
    const unfreezeResult = reduceOneSync(baseState, fiatUnfreeze);
    expect(unfreezeResult.ok).toBe(false);
    expect(unfreezeResult.reason).toBe("use_proposal");
  });
});

describe("Malicious Payload Exploits", () => {
  it("rejects NaN and Infinity in governance slider updates", async () => {
    const head = await generateKeyPair();
    const ns = "malicious-sliders";
    const g = await genesis(ns, head, "1000");

    // Attack 1: NaN Slider
    const attackNan = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: head.publicKeyHex,
        timestamp: 2,
        payload: { type: "slider_update", parameter: "approval_threshold", value: NaN },
      },
      head.privateKey,
    );

    const resNan = reduceOneSync(reduceEvents(ns, [g]), attackNan);
    // It should either reject it or sanitize it to a valid number.
    // Right now, NaN gets clamped to NaN because Math.max(0, Math.min(100, NaN)) -> NaN
    // We expect the state after NaN to not have NaN.
    // Let's verify our clamp function gets patched to fix this!
    expect(
      resNan.state.governanceSliders[head.publicKeyHex]!["approval_threshold"],
    ).not.toBeNaN();

    // Attack 2: Infinity Slider
    const attackInf = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 3,
        author: head.publicKeyHex,
        timestamp: 3,
        payload: {
          type: "slider_update",
          parameter: "approval_threshold",
          value: Infinity,
        },
      },
      head.privateKey,
    );

    const resInf = reduceOneSync(reduceEvents(ns, [g]), attackInf);
    // Should be clamped to 100
    expect(resInf.state.governanceSliders[head.publicKeyHex]!["approval_threshold"]).toBe(
      100,
    );
  });

  it("handles negative transaction amounts gracefully", async () => {
    const head = await generateKeyPair();
    const pleb = await generateKeyPair();
    const ns = "negative-amount";
    const g = await genesis(ns, head, "1000");
    const invite = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: head.publicKeyHex,
        timestamp: 2,
        payload: {
          type: "invite",
          invitee: pleb.publicKeyHex,
          vouchBondAmount: "100",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      head.privateKey,
    );
    const admitVote = await signEvent(
      {
        namespaceId: ns,
        prevHash: invite.id,
        lamport: 3,
        author: head.publicKeyHex,
        timestamp: 3,
        payload: {
          type: "proposal_vote",
          proposalId: admissionProposalId(pleb.publicKeyHex),
          approve: true,
        },
      },
      head.privateKey,
    );
    const accept = await signEvent(
      {
        namespaceId: ns,
        prevHash: admitVote.id,
        lamport: 4,
        author: pleb.publicKeyHex,
        timestamp: 4,
        payload: { type: "accept_invite", inviter: head.publicKeyHex },
      },
      pleb.privateKey,
    );

    // Attack 3: Send negative amount (to steal points)
    const attackNeg = await signEvent(
      {
        namespaceId: ns,
        prevHash: accept.id,
        lamport: 5,
        author: pleb.publicKeyHex,
        timestamp: 5,
        payload: { type: "transaction", to: head.publicKeyHex, amount: "-500" },
      },
      pleb.privateKey,
    );

    const resNeg = reduceOneSync(
      reduceEvents(ns, [g, invite, admitVote, accept]),
      attackNeg,
    );
    expect(resNeg.ok).toBe(false);
    expect(resNeg.reason).toBe("invalid_amount");
  });
  it("rejects signature spoofing and forging", async () => {
    const head = await generateKeyPair();
    const hacker = await generateKeyPair();
    const ns = "signature-spoofing";
    const g = await genesis(ns, head, "1000");

    // The hacker tries to forge an event acting as the Head!
    const forge = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: head.publicKeyHex,
        timestamp: 2,
        payload: { type: "transaction", to: hacker.publicKeyHex, amount: "500" },
      },
      hacker.privateKey,
    ); // Signed with hacker's key instead of head's!

    const resForge = reduceOneSync(reduceEvents(ns, [g]), forge);
    expect(resForge.ok).toBe(false);
    expect(resForge.reason).toBe("invalid_signature");
  });

  it("rejects time-travel vector clock poisoning", async () => {
    const head = await generateKeyPair();
    const ns = "time-travel";
    const g = await genesis(ns, head, "1000");

    // 1. Timestamp in the past (before genesis)
    const attackPast = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: head.publicKeyHex,
        timestamp: 0,
        payload: { type: "transaction", to: head.publicKeyHex, amount: "0" },
      },
      head.privateKey,
    );

    const resPast = reduceOneSync(reduceEvents(ns, [g]), attackPast);
    expect(resPast.ok).toBe(false);
    expect(resPast.reason).toBe("timestamp_before_genesis");

    // 2. Timestamp too far in the future
    const attackFuture = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: head.publicKeyHex,
        timestamp: 9999999999999,
        payload: { type: "transaction", to: head.publicKeyHex, amount: "0" },
      },
      head.privateKey,
    );

    const resFuture = reduceOneSync(reduceEvents(ns, [g]), attackFuture);
    expect(resFuture.ok).toBe(false);
    expect(resFuture.reason).toBe("timestamp_too_far_future");
  });
});

describe("namespace guards", () => {
  it("rejects cross-namespace event with namespace_mismatch", async () => {
    const kp = await generateKeyPair();
    const nsA = "ns-guard-a";
    const gA = await genesis(nsA, kp);
    const stateA = reduceEvents(nsA, [gA]);

    const gB = await genesis("ns-guard-b", kp);
    const result = reduceOneSync(stateA, gB);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("namespace_mismatch");
    expect(result.state).toEqual(stateA);
  });

  it("rejects second genesis with already_initialized", async () => {
    const kp = await generateKeyPair();
    const ns = "ns-double-genesis";
    const g1 = await genesis(ns, kp);
    const state = reduceEvents(ns, [g1]);
    const g2 = await signEvent(
      {
        namespaceId: ns,
        prevHash: g1.id,
        lamport: 2,
        author: kp.publicKeyHex,
        timestamp: 2,
        payload: {
          type: "genesis",
          cellName: "Again",
          initialPoints: "1",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      kp.privateKey,
    );
    const result = reduceOneSync(state, g2);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("already_initialized");
  });
});
