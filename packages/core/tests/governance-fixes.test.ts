import { describe, it, expect } from "vitest";
import {
  generateKeyPair,
  signEvent,
  reduceEvents,
  reduceOneSync,
  totalPoolPoints,
  admissionProposalId,
  DEFAULT_PARAMETERS,
  type SignedEvent,
  points,
} from "../src/index.js";

async function signAdmissionVote(
  ns: string,
  voter: Awaited<ReturnType<typeof generateKeyPair>>,
  invitee: string,
  prevHash: string,
  lamport: number,
) {
  return signEvent(
    {
      namespaceId: ns,
      prevHash,
      lamport,
      author: voter.publicKeyHex,
      timestamp: lamport,
      payload: {
        type: "proposal_vote",
        proposalId: admissionProposalId(invitee),
        approve: true,
      },
    },
    voter.privateKey,
  );
}

async function genesis(
  ns: string,
  author: Awaited<ReturnType<typeof generateKeyPair>>,
  points = "10000",
) {
  return signEvent(
    {
      namespaceId: ns,
      prevHash: null,
      lamport: 1,
      author: author.publicKeyHex,
      timestamp: 1,
      payload: {
        type: "genesis",
        cellName: "T",
        initialPoints: points,
        parameters: { ...DEFAULT_PARAMETERS },
      },
    },
    author.privateKey,
  );
}

describe("governance fixes", () => {
  it("rejects stacked proposal votes from the same member", async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();
    const ns = "vote-stack";
    const g = await genesis(ns, alice, "1000");

    const invite = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: alice.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "invite",
          invitee: bob.publicKeyHex,
          vouchBondAmount: "100",
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
        timestamp: 1,
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
        timestamp: 1,
        payload: { type: "accept_invite", inviter: alice.publicKeyHex },
      },
      bob.privateKey,
    );

    const create = await signEvent(
      {
        namespaceId: ns,
        prevHash: accept.id,
        lamport: 5,
        author: bob.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "proposal_create",
          proposalId: "p1",
          kind: "resolve_fracture",
          data: { target: alice.publicKeyHex },
        },
      },
      bob.privateKey,
    );

    const vote1 = await signEvent(
      {
        namespaceId: ns,
        prevHash: create.id,
        lamport: 6,
        author: alice.publicKeyHex,
        timestamp: 1,
        payload: { type: "proposal_vote", proposalId: "p1", approve: true },
      },
      alice.privateKey,
    );
    const vote2 = await signEvent(
      {
        namespaceId: ns,
        prevHash: vote1.id,
        lamport: 7,
        author: alice.publicKeyHex,
        timestamp: 1,
        payload: { type: "proposal_vote", proposalId: "p1", approve: true },
      },
      alice.privateKey,
    );

    const s = reduceEvents(ns, [g, invite, admitVote, accept, create, vote1, vote2]);
    const p = s.proposals["p1"]!;
    expect(p.votesFor).toBe(s.balances[alice.publicKeyHex]);
    expect(Object.keys(p.voters ?? {})).toHaveLength(1);
  });

  it("conserves points when the same invitee is re-invited by the same inviter", async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();
    const ns = "re-invite";
    const g = await genesis(ns, alice);
    let state = reduceEvents(ns, [g]);
    const req1 = points("500");

    const inv1 = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: alice.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "invite",
          invitee: bob.publicKeyHex,
          vouchBondAmount: "500",
          parameters: { ...DEFAULT_PARAMETERS },
        },
      },
      alice.privateKey,
    );
    state = reduceEvents(ns, [g, inv1]);
    const req2 = points("500");
    const inv2 = await signEvent(
      {
        namespaceId: ns,
        prevHash: inv1.id,
        lamport: 3,
        author: alice.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "invite",
          invitee: bob.publicKeyHex,
          vouchBondAmount: "500",
          parameters: { ...DEFAULT_PARAMETERS },
        },
      },
      alice.privateKey,
    );
    const final = reduceEvents(ns, [g, inv1, inv2]);
    expect(totalPoolPoints(final)).toBe(points("10000"));
    expect(final.balances[alice.publicKeyHex]).toBe(points("10000"));
    expect(final.vouchLiens[bob.publicKeyHex]?.amount).toBe(req2);
  });

  it("rejects accept_invite before admission proposal passes", async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();
    const ns = "admission-gate";
    const g = await genesis(ns, alice);
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
          parameters: { ...DEFAULT_PARAMETERS },
        },
      },
      alice.privateKey,
    );
    const accept = await signEvent(
      {
        namespaceId: ns,
        prevHash: invite.id,
        lamport: 3,
        author: bob.publicKeyHex,
        timestamp: 3,
        payload: { type: "accept_invite", inviter: alice.publicKeyHex },
      },
      bob.privateKey,
    );
    const r = reduceOneSync(reduceEvents(ns, [g, invite]), accept);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("admission_not_approved");
  });

  it("liens stay in the inviter wallet (pool stays 100% among humans)", async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();
    const ns = "lien-wallet";
    const g = await genesis(ns, alice);
    const invite = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: alice.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "invite",
          invitee: bob.publicKeyHex,
          vouchBondAmount: "500",
          parameters: { ...DEFAULT_PARAMETERS },
        },
      },
      alice.privateKey,
    );
    const s = reduceEvents(ns, [g, invite]);
    expect(s.balances[alice.publicKeyHex]).toBe(points("10000"));
    expect(s.vouchLiens[bob.publicKeyHex]?.amount).toBe(points("500"));
    expect(totalPoolPoints(s)).toBe(points("10000"));
  });

  it("rejects direct expel and freeze_resolve events", async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();
    const ns = "direct-expel";
    const g = await genesis(ns, alice);
    let state = reduceEvents(ns, [g]);

    const expel = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: alice.publicKeyHex,
        timestamp: 2,
        payload: { type: "expel", target: bob.publicKeyHex },
      },
      alice.privateKey,
    );
    const r1 = reduceOneSync(state, expel);
    expect(r1.ok).toBe(false);
    expect(r1.reason).toBe("use_proposal");

    state = {
      ...state,
      frozen: [bob.publicKeyHex],
      fractures: [bob.publicKeyHex],
      members: [...state.members, bob.publicKeyHex],
    };
    const unfreeze = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 3,
        author: alice.publicKeyHex,
        timestamp: 3,
        payload: { type: "freeze_resolve", target: bob.publicKeyHex, action: "unfreeze" },
      },
      alice.privateKey,
    );
    const r2 = reduceOneSync(state, unfreeze);
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe("use_proposal");
  });

  it("executes join_superstructure via passed proposal", async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();
    const ns = "join-proposal";
    const superId = "abc123superstructure";
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
          parameters: { ...DEFAULT_PARAMETERS },
        },
      },
      alice.privateKey,
    );
    const admitVote = await signAdmissionVote(ns, alice, bob.publicKeyHex, invite.id, 3);
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

    const events: SignedEvent[] = [g, invite, admitVote, accept];
    let lamport = 5;
    let prev = accept.id;

    const push = async (
      author: Awaited<ReturnType<typeof generateKeyPair>>,
      payload: SignedEvent["payload"],
    ) => {
      const e = await signEvent(
        {
          namespaceId: ns,
          prevHash: prev,
          lamport: lamport++,
          author: author.publicKeyHex,
          timestamp: lamport,
          payload,
        },
        author.privateKey,
      );
      events.push(e);
      prev = e.id;
    };

    await push(alice, {
      type: "proposal_create",
      proposalId: "join1",
      kind: "join_superstructure",
      data: { target: superId },
    });
    await push(alice, {
      type: "proposal_vote",
      proposalId: "join1",
      approve: true,
    });
    await push(bob, { type: "proposal_vote", proposalId: "join1", approve: true });

    const s = reduceEvents(ns, events);
    expect(s.parentSuperstructures).toContain(superId);
    expect(s.proposals["join1"]?.executed).toBe(true);
  });

  it("allows non-head member to create join_superstructure proposal", async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();
    const ns = "join-nonhead";
    const superId = "parent-ns-nonhead";
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
          parameters: { ...DEFAULT_PARAMETERS },
        },
      },
      alice.privateKey,
    );
    const admitVote = await signAdmissionVote(ns, alice, bob.publicKeyHex, invite.id, 3);
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
    const create = await signEvent(
      {
        namespaceId: ns,
        prevHash: accept.id,
        lamport: 5,
        author: bob.publicKeyHex,
        timestamp: 5,
        payload: {
          type: "proposal_create",
          proposalId: "join-by-bob",
          kind: "join_superstructure",
          data: { target: superId },
        },
      },
      bob.privateKey,
    );
    const r = reduceOneSync(reduceEvents(ns, [g, invite, admitVote, accept]), create);
    expect(r.ok).toBe(true);
    expect(r.state.proposals["join-by-bob"]?.author).toBe(bob.publicKeyHex);
  });

  it("cancel_invite releases lien without moving points", async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();
    const ns = "cancel-invite";
    const g = await genesis(ns, alice);
    const inv = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: alice.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "invite",
          invitee: bob.publicKeyHex,
          vouchBondAmount: "500",
          parameters: { ...DEFAULT_PARAMETERS },
        },
      },
      alice.privateKey,
    );
    const cancel = await signEvent(
      {
        namespaceId: ns,
        prevHash: inv.id,
        lamport: 3,
        author: alice.publicKeyHex,
        timestamp: 1,
        payload: { type: "cancel_invite", invitee: bob.publicKeyHex },
      },
      alice.privateKey,
    );
    const s = reduceEvents(ns, [g, inv, cancel]);
    expect(totalPoolPoints(s)).toBe(points("10000"));
    expect(s.balances[alice.publicKeyHex]).toBe(points("10000"));
    expect(s.pendingInvites[bob.publicKeyHex]).toBeUndefined();
  });

  it("rejects accept_invite when cell is at soft cap", async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();
    const ns = "soft-cap";
    const g = await genesis(ns, alice);
    let state = reduceEvents(ns, [g]);
    const members = Array.from({ length: 50 }, (_, i) =>
      i === 0 ? alice.publicKeyHex : `${i.toString(16).padStart(64, "0")}`,
    );
    state = {
      ...state,
      members,
      pendingInvites: {
        [bob.publicKeyHex]: {
          inviter: alice.publicKeyHex,
          lienAmount: points("100"),
          parameters: { ...DEFAULT_PARAMETERS },
          admissionApproved: true,
        },
      },
      vouchLiens: {
        [bob.publicKeyHex]: { inviter: alice.publicKeyHex, amount: points("100") },
      },
    };
    const accept = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: bob.publicKeyHex,
        timestamp: 2,
        payload: { type: "accept_invite", inviter: alice.publicKeyHex },
      },
      bob.privateKey,
    );
    const r = reduceOneSync(state, accept);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("cell_cap_reached");
  });

  it("rejects invites when cell is at soft cap", async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();
    const ns = "invite-cap";
    const g = await genesis(ns, alice);
    let state = reduceEvents(ns, [g]);
    const members = Array.from({ length: 50 }, (_, i) =>
      i === 0 ? alice.publicKeyHex : `${i.toString(16).padStart(64, "0")}`,
    );
    state = { ...state, members };
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
          parameters: { ...DEFAULT_PARAMETERS },
        },
      },
      alice.privateKey,
    );
    const r = reduceOneSync(state, invite);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("cell_cap_reached");
  });

  it("registers child namespace via link_subcell proposal", async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();
    const ns = "parent-cell";
    const childNs = "child-cell-ns-id";
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
          parameters: { ...DEFAULT_PARAMETERS },
        },
      },
      alice.privateKey,
    );
    const admitVote = await signAdmissionVote(ns, alice, bob.publicKeyHex, invite.id, 3);
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
    const create = await signEvent(
      {
        namespaceId: ns,
        prevHash: accept.id,
        lamport: 5,
        author: alice.publicKeyHex,
        timestamp: 5,
        payload: {
          type: "proposal_create",
          proposalId: "link1",
          kind: "link_subcell",
          data: { target: childNs },
        },
      },
      alice.privateKey,
    );
    const vote = await signEvent(
      {
        namespaceId: ns,
        prevHash: create.id,
        lamport: 6,
        author: alice.publicKeyHex,
        timestamp: 6,
        payload: { type: "proposal_vote", proposalId: "link1", approve: true },
      },
      alice.privateKey,
    );
    const voteBob = await signEvent(
      {
        namespaceId: ns,
        prevHash: vote.id,
        lamport: 7,
        author: bob.publicKeyHex,
        timestamp: 7,
        payload: { type: "proposal_vote", proposalId: "link1", approve: true },
      },
      bob.privateKey,
    );
    const state = reduceEvents(ns, [g, invite, admitVote, accept, create, vote, voteBob]);
    expect(state.childCells).toContain(childNs);
  });
});

describe("epoch griefing mitigation", () => {
  it("governance slider events do not count toward epoch boundaries", async () => {
    const alice = await generateKeyPair();
    const ns = "epoch-spam";
    const params = { ...DEFAULT_PARAMETERS, epoch_interval: 15 };
    const g = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 1,
        author: alice.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "genesis",
          cellName: "T",
          initialPoints: "1000",
          parameters: params,
        },
      },
      alice.privateKey,
    );
    const s1 = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: alice.publicKeyHex,
        timestamp: 2,
        payload: { type: "slider_update", parameter: "decay_rate", value: 5 },
      },
      alice.privateKey,
    );
    const s2 = await signEvent(
      {
        namespaceId: ns,
        prevHash: s1.id,
        lamport: 3,
        author: alice.publicKeyHex,
        timestamp: 3,
        payload: { type: "slider_update", parameter: "decay_rate", value: 6 },
      },
      alice.privateKey,
    );
    const afterSliders = reduceEvents(ns, [g, s1, s2]);
    expect(afterSliders.epochNumber).toBe(0);
    expect(afterSliders.lastRedistributionTimestamp).toBe(1);
  });
});
