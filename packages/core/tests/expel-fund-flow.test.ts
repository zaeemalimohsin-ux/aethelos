import { describe, it, expect } from "vitest";
import {
  generateKeyPair,
  signEvent,
  reduceEvents,
  totalPoolPoints,
  admissionProposalId,
  DEFAULT_PARAMETERS,
  getBalance,
  points,
  type SignedEvent,
} from "../src/index.js";

describe("expelMemberReducer fund flow (no parent superstructure)", () => {
  it("equal-splits severed balance and forfeited lien among remaining members", async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();
    const charlie = await generateKeyPair();
    const ns = "expel-fund-split";
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

    await push(alice, {
      type: "genesis",
      cellName: "Fund Flow",
      initialPoints: "10000",
      parameters: { ...DEFAULT_PARAMETERS },
    });
    await push(alice, {
      type: "invite",
      invitee: bob.publicKeyHex,
      vouchBondAmount: "500",
      parameters: { ...DEFAULT_PARAMETERS },
    });
    await push(alice, {
      type: "proposal_vote",
      proposalId: admissionProposalId(bob.publicKeyHex),
      approve: true,
    });
    await push(bob, { type: "accept_invite", inviter: alice.publicKeyHex });

    await push(alice, {
      type: "invite",
      invitee: charlie.publicKeyHex,
      vouchBondAmount: "100",
      parameters: { ...DEFAULT_PARAMETERS },
    });
    await push(alice, {
      type: "proposal_vote",
      proposalId: admissionProposalId(charlie.publicKeyHex),
      approve: true,
    });
    await push(charlie, { type: "accept_invite", inviter: alice.publicKeyHex });

    await push(alice, {
      type: "transaction",
      to: bob.publicKeyHex,
      amount: "1000",
    });

    const before = reduceEvents(ns, events);
    const beforeTotal = totalPoolPoints(before);
    const aliceBefore = getBalance(before, alice.publicKeyHex);
    const bobBefore = getBalance(before, bob.publicKeyHex);

    await push(alice, {
      type: "proposal_create",
      proposalId: "expel-bob",
      kind: "expel_member",
      data: { target: bob.publicKeyHex },
    });
    await push(alice, { type: "proposal_vote", proposalId: "expel-bob", approve: true });

    const after = reduceEvents(ns, events);
    expect(after.members).not.toContain(bob.publicKeyHex);
    expect(after.members).toContain(alice.publicKeyHex);
    expect(after.members).toContain(charlie.publicKeyHex);
    expect(totalPoolPoints(after)).toBe(beforeTotal);

    const aliceGain = getBalance(after, alice.publicKeyHex) - aliceBefore;
    const charlieGain = getBalance(after, charlie.publicKeyHex);
    const redistributionDust = bobBefore - (aliceGain + charlieGain);
    expect(redistributionDust).toBeGreaterThanOrEqual(0n);
    expect(redistributionDust).toBeLessThan(points("100"));
    expect(getBalance(after, bob.publicKeyHex)).toBe(0n);
  });

  it("routes severed value to commons when the expelled member was the last member", async () => {
    const solo = await generateKeyPair();
    const ns = "expel-last-commons";
    const g = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 1,
        author: solo.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "genesis",
          cellName: "Solo",
          initialPoints: "1000",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      solo.privateKey,
    );
    const expelCreate = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: solo.publicKeyHex,
        timestamp: 2,
        payload: {
          type: "proposal_create",
          proposalId: "expel-self",
          kind: "expel_member",
          data: { target: solo.publicKeyHex },
        },
      },
      solo.privateKey,
    );
    const expelVote = await signEvent(
      {
        namespaceId: ns,
        prevHash: expelCreate.id,
        lamport: 3,
        author: solo.publicKeyHex,
        timestamp: 3,
        payload: { type: "proposal_vote", proposalId: "expel-self", approve: true },
      },
      solo.privateKey,
    );

    const after = reduceEvents(ns, [g, expelCreate, expelVote]);
    expect(after.members).toHaveLength(0);
    expect(after.commons ?? 0n).toBe(points("1000"));
    expect(totalPoolPoints(after)).toBe(points("1000"));
  });
});
