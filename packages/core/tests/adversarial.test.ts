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
      parameters: { ...DEFAULT_PARAMETERS, epoch_interval: 10 },
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
      parameters: { ...DEFAULT_PARAMETERS, decay_rate: 10, epoch_interval: 5 },
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
