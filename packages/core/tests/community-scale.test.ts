import { describe, it, expect } from "vitest";
import {
  generateKeyPair,
  signEvent,
  reduceEvents,
  totalPoolPoints,
  requiredVouchLien,
  DEFAULT_PARAMETERS,
  MS_PER_MINUTE,
  type KeyPair,
  type SignedEvent,
  type UnsignedEvent,
  type EventPayload,
  type GovernanceParameter,
  formatPointsAmount,
  points,
} from "../src/index.js";
import { admissionApprovalVote } from "./admission-helpers.js";

async function buildChain(
  ns: string,
  steps: { author: KeyPair; payload: EventPayload }[],
): Promise<SignedEvent[]> {
  const events: SignedEvent[] = [];
  let lamport = 0;
  let prevHash: string | null = null;
  for (const step of steps) {
    lamport += 1;
    const unsigned: UnsignedEvent = {
      namespaceId: ns,
      prevHash,
      lamport,
      author: step.author.publicKeyHex,
      timestamp: lamport * MS_PER_MINUTE,
      payload: step.payload,
    };
    const signed = await signEvent(unsigned, step.author.privateKey);
    events.push(signed);
    prevHash = signed.id;
  }
  return events;
}

async function admitMembers(
  ns: string,
  founder: KeyPair,
  joiners: KeyPair[],
  initialPoints: string,
  params: Record<GovernanceParameter, number>,
  extraSteps: { author: KeyPair; payload: EventPayload }[] = [],
): Promise<SignedEvent[]> {
  const steps: { author: KeyPair; payload: EventPayload }[] = [
    {
      author: founder,
      payload: {
        type: "genesis",
        cellName: "Scale",
        initialPoints,
        parameters: params,
      },
    },
  ];

  for (const joiner of joiners) {
    const state = reduceEvents(ns, await buildChain(ns, steps));
    const bond = requiredVouchLien(state, founder.publicKeyHex);
    steps.push({
      author: founder,
      payload: {
        type: "invite",
        invitee: joiner.publicKeyHex,
        vouchBondAmount: formatPointsAmount(bond),
        parameters: params,
      },
    });
    steps.push(admissionApprovalVote(founder, joiner.publicKeyHex));
    steps.push({
      author: joiner,
      payload: { type: "accept_invite", inviter: founder.publicKeyHex },
    });
  }

  steps.push(...extraSteps);
  return buildChain(ns, steps);
}

describe("community-scale (8 members, deterministic core)", () => {
  it("admits eight members and conserves points", async () => {
    const founder = await generateKeyPair();
    const joiners = await Promise.all(Array.from({ length: 7 }, () => generateKeyPair()));
    const ns = "scale-8";
    const params = { ...DEFAULT_PARAMETERS, vouch_bond_rate: 1 };

    const state = reduceEvents(
      ns,
      await admitMembers(ns, founder, joiners, "100000", params),
    );
    expect(state.members.length).toBe(8);
    expect(totalPoolPoints(state)).toBe(points("100000"));
  }, 30_000);

  it("does not execute expel on founder-only yes vote below stake threshold", async () => {
    const founder = await generateKeyPair();
    const others = await Promise.all(Array.from({ length: 2 }, () => generateKeyPair()));
    const target = others[1]!;
    const ns = "early-yes";
    const params = { ...DEFAULT_PARAMETERS, approval_threshold: 51, vouch_bond_rate: 1 };

    const state = reduceEvents(
      ns,
      await admitMembers(ns, founder, others, "10000", params, [
        {
          author: founder,
          payload: { type: "transaction", to: others[0]!.publicKeyHex, amount: "5000" },
        },
        {
          author: founder,
          payload: {
            type: "proposal_create",
            proposalId: "expel-early",
            kind: "expel_member",
            data: { target: target.publicKeyHex },
          },
        },
        {
          author: founder,
          payload: { type: "proposal_vote", proposalId: "expel-early", approve: true },
        },
      ]),
    );
    expect(state.members).toContain(target.publicKeyHex);
    expect(state.proposals["expel-early"]?.executed).not.toBe(true);
  });

  it("rejects expel proposal when minority stake approves", async () => {
    const founder = await generateKeyPair();
    const others = await Promise.all(Array.from({ length: 4 }, () => generateKeyPair()));
    const target = others[3]!;
    const ns = "scale-expel";
    const params = { ...DEFAULT_PARAMETERS, approval_threshold: 51, vouch_bond_rate: 1 };

    const extra: { author: KeyPair; payload: EventPayload }[] = [];
    for (let i = 0; i < 3; i++) {
      extra.push({
        author: founder,
        payload: { type: "transaction", to: others[i]!.publicKeyHex, amount: "9000" },
      });
    }
    extra.push({
      author: founder,
      payload: {
        type: "proposal_create",
        proposalId: "expel1",
        kind: "expel_member",
        data: { target: target.publicKeyHex },
      },
    });
    for (let i = 0; i < 3; i++) {
      extra.push({
        author: others[i]!,
        payload: { type: "proposal_vote", proposalId: "expel1", approve: false },
      });
    }
    extra.push({
      author: founder,
      payload: { type: "proposal_vote", proposalId: "expel1", approve: true },
    });

    const state = reduceEvents(
      ns,
      await admitMembers(ns, founder, others, "50000", params, extra),
    );
    expect(state.members).toContain(target.publicKeyHex);
    expect(state.proposals["expel1"]?.executed).not.toBe(true);
  }, 30_000);

  it(
    "runs epoch redistribution with eight members without losing points",
    { timeout: 30000 },
    async () => {
      const founder = await generateKeyPair();
      const joiners = await Promise.all(
        Array.from({ length: 7 }, () => generateKeyPair()),
      );
      const ns = "scale-epoch";
      const params = {
        ...DEFAULT_PARAMETERS,
        epoch_interval: 5,
        decay_rate: 10,
        vouch_bond_rate: 1,
      };

      const extra: { author: KeyPair; payload: EventPayload }[] = [];
      for (let i = 0; i < 6; i++) {
        extra.push({
          author: founder,
          payload: {
            type: "transaction",
            to: joiners[i % joiners.length]!.publicKeyHex,
            amount: "10",
          },
        });
      }

      const state = reduceEvents(
        ns,
        await admitMembers(ns, founder, joiners, "80000", params, extra),
      );
      expect(state.epochNumber).toBeGreaterThanOrEqual(1);
      expect(totalPoolPoints(state)).toBe(points("80000"));
    },
  );
});
