import { describe, it, expect } from "vitest";
import {
  generateKeyPair,
  signEvent,
  reduceEvents,
  resolveVouchHead,
  DEFAULT_PARAMETERS,
  points,
} from "../src/index.js";

describe("head election via events", () => {
  it("retains sitting head below threshold when still a member", () => {
    const founder = "f".repeat(64);
    const challenger = "c".repeat(64);
    const state = {
      namespaceId: "head",
      cellName: "H",
      initialized: true,
      members: [founder, challenger],
      balances: { [founder]: points("6000"), [challenger]: points("4000") },
      frozen: [],
      vouchLiens: {},
      inviters: {},
      head: founder,
      parameters: { ...DEFAULT_PARAMETERS, vouch_threshold: 51 },
      governanceSliders: {},
      redistributionSliders: {},
      vouchSliders: {
        [founder]: { [founder]: 10, [challenger]: 20 },
        [challenger]: { [challenger]: 100 },
      },
      proposals: {},
      superstructureId: null,
      parentSuperstructures: [],
      epochNumber: 0,
      totalSupply: points("10000"),
      fractures: [],
      pendingInvites: {},
      commons: 0n,
      genesisTimestamp: 1,
      lastEpochTimestamp: 1,
      lastAccrualTimestamp: 1,
      lastRedistributionTimestamp: 1,
      maxEventTimestamp: 1,
      lastActiveTimestamp: {},
      circulationCarry: 0n,
    } as any;
    expect(resolveVouchHead(state)).toBe(founder);
  });

  it("installs challenger when vouch crosses threshold via reduceEvents", async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();
    const ns = "head-shift";
    const g = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 1,
        author: alice.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "genesis",
          cellName: "Head",
          initialPoints: "10000",
          parameters: DEFAULT_PARAMETERS,
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
        payload: { type: "invite", invitee: bob.publicKeyHex, vouchBondAmount: "500" },
      },
      alice.privateKey,
    );
    const vote = await signEvent(
      {
        namespaceId: ns,
        prevHash: invite.id,
        lamport: 3,
        author: alice.publicKeyHex,
        timestamp: 3,
        payload: {
          type: "proposal_vote",
          proposalId: `admit:${bob.publicKeyHex}`,
          approve: true,
        },
      },
      alice.privateKey,
    );
    const accept = await signEvent(
      {
        namespaceId: ns,
        prevHash: vote.id,
        lamport: 4,
        author: bob.publicKeyHex,
        timestamp: 4,
        payload: { type: "accept_invite", inviter: alice.publicKeyHex },
      },
      bob.privateKey,
    );
    const transfer = await signEvent(
      {
        namespaceId: ns,
        prevHash: accept.id,
        lamport: 5,
        author: alice.publicKeyHex,
        timestamp: 5,
        payload: { type: "transaction", to: bob.publicKeyHex, amount: "4000" },
      },
      alice.privateKey,
    );
    const vouch = await signEvent(
      {
        namespaceId: ns,
        prevHash: transfer.id,
        lamport: 6,
        author: alice.publicKeyHex,
        timestamp: 6,
        payload: {
          type: "vouch_update",
          target: bob.publicKeyHex,
          weight: 100,
        },
      },
      alice.privateKey,
    );
    const state = reduceEvents(ns, [g, invite, vote, accept, transfer, vouch]);
    expect(state.head).toBe(bob.publicKeyHex);
  });
});
