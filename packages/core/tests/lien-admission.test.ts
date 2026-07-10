import { describe, it, expect } from "vitest";
import {
  generateKeyPair,
  signEvent,
  reduceEvents,
  reduceOneSync,
  totalPoolPoints,
  admissionProposalId,
  requiredVouchLien,
  DEFAULT_PARAMETERS,
} from "../src/index.js";

async function genesis(ns: string, author: Awaited<ReturnType<typeof generateKeyPair>>) {
  return signEvent(
    {
      namespaceId: ns,
      prevHash: null,
      lamport: 1,
      author: author.publicKeyHex,
      timestamp: 1,
      payload: {
        type: "genesis",
        cellName: "Lien",
        initialPoints: "10000",
        parameters: { ...DEFAULT_PARAMETERS },
      },
    },
    author.privateKey,
  );
}

describe("lien and admission invariants", () => {
  it("ignores adversarial vouchBondAmount in invite payload", async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();
    const ns = "lien-payload";
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
          vouchBondAmount: "1",
        },
      },
      alice.privateKey,
    );
    const state = reduceEvents(ns, [g, invite]);
    const expected = requiredVouchLien(reduceEvents(ns, [g]), alice.publicKeyHex);
    expect(state.vouchLiens[bob.publicKeyHex]?.amount).toBe(expected);
    expect(state.vouchLiens[bob.publicKeyHex]!.amount).not.toBe(1n);
  });

  it("blocks competing inviter with invite_pending", async () => {
    const alice = await generateKeyPair();
    const carol = await generateKeyPair();
    const bob = await generateKeyPair();
    const ns = "invite-pending";
    const g = await genesis(ns, alice);
    const inviteCarol = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: alice.publicKeyHex,
        timestamp: 2,
        payload: { type: "invite", invitee: carol.publicKeyHex, vouchBondAmount: "500" },
      },
      alice.privateKey,
    );
    const voteCarol = await signEvent(
      {
        namespaceId: ns,
        prevHash: inviteCarol.id,
        lamport: 3,
        author: alice.publicKeyHex,
        timestamp: 3,
        payload: {
          type: "proposal_vote",
          proposalId: `admit:${carol.publicKeyHex}`,
          approve: true,
        },
      },
      alice.privateKey,
    );
    const acceptCarol = await signEvent(
      {
        namespaceId: ns,
        prevHash: voteCarol.id,
        lamport: 4,
        author: carol.publicKeyHex,
        timestamp: 4,
        payload: { type: "accept_invite", inviter: alice.publicKeyHex },
      },
      carol.privateKey,
    );
    const inviteBob = await signEvent(
      {
        namespaceId: ns,
        prevHash: acceptCarol.id,
        lamport: 5,
        author: alice.publicKeyHex,
        timestamp: 5,
        payload: { type: "invite", invitee: bob.publicKeyHex, vouchBondAmount: "500" },
      },
      alice.privateKey,
    );
    const state1 = reduceEvents(ns, [g, inviteCarol, voteCarol, acceptCarol, inviteBob]);
    const inviteC = await signEvent(
      {
        namespaceId: ns,
        prevHash: inviteBob.id,
        lamport: 6,
        author: carol.publicKeyHex,
        timestamp: 6,
        payload: { type: "invite", invitee: bob.publicKeyHex, vouchBondAmount: "500" },
      },
      carol.privateKey,
    );
    const result = reduceOneSync(state1, inviteC);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invite_pending");
    expect(totalPoolPoints(result.state)).toBe(totalPoolPoints(state1));
  });

  it("rejects accept_invite before admission approved", async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();
    const ns = "admit-gate";
    const g = await genesis(ns, alice);
    const invite = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: alice.publicKeyHex,
        timestamp: 2,
        payload: { type: "invite", invitee: bob.publicKeyHex, vouchBondAmount: "500" },
      },
      alice.privateKey,
    );
    const state = reduceEvents(ns, [g, invite]);
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
    const result = reduceOneSync(state, accept);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("admission_not_approved");
  });
});
