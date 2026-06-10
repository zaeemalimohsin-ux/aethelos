import { describe, it, expect } from "vitest";
import {
  createInitialState,
  reduceEvents,
  reduceOneSync,
  signEvent,
  generateKeyPair,
  totalPoolPoints,
  resolveGovernanceParameter,
  DEFAULT_PARAMETERS,
  type PoolState,
  points,
} from "../src/index.js";

describe("federation governance gaps", () => {
  it("leave_superstructure clears bridges and superstructureId when last parent removed", async () => {
    const head = await generateKeyPair();
    const ns = "leave-test";
    const parentId = "parent-ns";

    const g = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 1,
        author: head.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "genesis",
          cellName: "Child",
          initialPoints: "1000",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      head.privateKey,
    );
    const joinCreate = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: head.publicKeyHex,
        timestamp: 2,
        payload: {
          type: "proposal_create",
          proposalId: "join1",
          kind: "join_superstructure",
          data: { target: parentId },
        },
      },
      head.privateKey,
    );
    const joinVote = await signEvent(
      {
        namespaceId: ns,
        prevHash: joinCreate.id,
        lamport: 3,
        author: head.publicKeyHex,
        timestamp: 3,
        payload: { type: "proposal_vote", proposalId: "join1", approve: true },
      },
      head.privateKey,
    );
    const joined = reduceEvents(ns, [g, joinCreate, joinVote]);
    expect(joined.bridges).toContain(head.publicKeyHex);
    expect(joined.superstructureId).toBe(parentId);

    const leaveCreate = await signEvent(
      {
        namespaceId: ns,
        prevHash: joinVote.id,
        lamport: 4,
        author: head.publicKeyHex,
        timestamp: 4,
        payload: {
          type: "proposal_create",
          proposalId: "leave1",
          kind: "leave_superstructure",
          data: { target: parentId },
        },
      },
      head.privateKey,
    );
    const leaveVote = await signEvent(
      {
        namespaceId: ns,
        prevHash: leaveCreate.id,
        lamport: 5,
        author: head.publicKeyHex,
        timestamp: 5,
        payload: { type: "proposal_vote", proposalId: "leave1", approve: true },
      },
      head.privateKey,
    );
    const after = reduceEvents(ns, [g, joinCreate, joinVote, leaveCreate, leaveVote]);
    expect(after.parentSuperstructures).not.toContain(parentId);
    expect(after.bridges).not.toContain(head.publicKeyHex);
    expect(after.superstructureId).toBeNull();
  }, 30_000);

  it("rejects bridge_transfer proposal for unlinked namespace", async () => {
    const head = await generateKeyPair();
    const ns = "bridge-proposal-gate";
    const g = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 1,
        author: head.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "genesis",
          cellName: "Solo",
          initialPoints: "500",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      head.privateKey,
    );
    const create = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: head.publicKeyHex,
        timestamp: 2,
        payload: {
          type: "proposal_create",
          proposalId: "b1",
          kind: "bridge_transfer",
          data: {
            target: "unknown-parent",
            to: head.publicKeyHex,
            amount: "10",
          },
        },
      },
      head.privateKey,
    );
    const r = reduceOneSync(reduceEvents(ns, [g]), create);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("unknown_superstructure");
  });

  it("bridge_completed prevents re-execution of same bridge_transfer", async () => {
    const bridge = await generateKeyPair();
    const recipient = await generateKeyPair();
    const state: PoolState = {
      ...createInitialState("cell"),
      initialized: true,
      members: [bridge.publicKeyHex, recipient.publicKeyHex],
      balances: {
        [bridge.publicKeyHex]: points("300"),
        [recipient.publicKeyHex]: points("100"),
      },
      bridges: [bridge.publicKeyHex],
      totalSupply: points("400"),
      proposals: {
        p1: {
          id: "p1",
          kind: "bridge_transfer",
          author: bridge.publicKeyHex,
          data: { target: "remote", to: recipient.publicKeyHex, amount: "50" },
          votesFor: points("100"),
          votesAgainst: 0n,
          voters: {},
          closed: true,
          executed: true,
          bridgeCompleted: true,
        },
      },
    };
    const evt = await signEvent(
      {
        namespaceId: "cell",
        prevHash: null,
        lamport: 1,
        author: bridge.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "bridge_transaction",
          superstructureId: "remote",
          localProposalId: "p1",
          to: recipient.publicKeyHex,
          amount: "50",
        },
      },
      bridge.privateKey,
    );
    const r = reduceOneSync(state, evt);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("bridge_not_approved");
  });

  it("expulsion routes severed stake to parent superstructureEscrow", async () => {
    const founder = await generateKeyPair();
    const joiner = await generateKeyPair();
    const parentId = "parent-top";
    const ns = "expel-escrow";

    const g = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 1,
        author: founder.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "genesis",
          cellName: "Cell",
          initialPoints: "10000",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      founder.privateKey,
    );
    const joinCreate = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: founder.publicKeyHex,
        timestamp: 2,
        payload: {
          type: "proposal_create",
          proposalId: "join1",
          kind: "join_superstructure",
          data: { target: parentId },
        },
      },
      founder.privateKey,
    );
    const joinVote = await signEvent(
      {
        namespaceId: ns,
        prevHash: joinCreate.id,
        lamport: 3,
        author: founder.publicKeyHex,
        timestamp: 3,
        payload: { type: "proposal_vote", proposalId: "join1", approve: true },
      },
      founder.privateKey,
    );
    let state = reduceEvents(ns, [g, joinCreate, joinVote]);

    const invite = await signEvent(
      {
        namespaceId: ns,
        prevHash: joinVote.id,
        lamport: 4,
        author: founder.publicKeyHex,
        timestamp: 4,
        payload: {
          type: "invite",
          invitee: joiner.publicKeyHex,
          lienAmount: "500",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      founder.privateKey,
    );
    state = reduceEvents(ns, [g, joinCreate, joinVote, invite]);

    const admitCreate = await signEvent(
      {
        namespaceId: ns,
        prevHash: invite.id,
        lamport: 5,
        author: founder.publicKeyHex,
        timestamp: 5,
        payload: {
          type: "proposal_create",
          proposalId: `admit:${joiner.publicKeyHex}`,
          kind: "admit_member",
          data: { target: joiner.publicKeyHex },
        },
      },
      founder.privateKey,
    );
    const admitVote = await signEvent(
      {
        namespaceId: ns,
        prevHash: admitCreate.id,
        lamport: 6,
        author: founder.publicKeyHex,
        timestamp: 6,
        payload: {
          type: "proposal_vote",
          proposalId: `admit:${joiner.publicKeyHex}`,
          approve: true,
        },
      },
      founder.privateKey,
    );
    const accept = await signEvent(
      {
        namespaceId: ns,
        prevHash: admitVote.id,
        lamport: 7,
        author: joiner.publicKeyHex,
        timestamp: 7,
        payload: { type: "accept_invite", inviter: founder.publicKeyHex },
      },
      joiner.privateKey,
    );
    state = reduceEvents(ns, [
      g,
      joinCreate,
      joinVote,
      invite,
      admitCreate,
      admitVote,
      accept,
    ]);

    const transfer = await signEvent(
      {
        namespaceId: ns,
        prevHash: accept.id,
        lamport: 8,
        author: founder.publicKeyHex,
        timestamp: 8,
        payload: { type: "transaction", to: joiner.publicKeyHex, amount: "2000" },
      },
      founder.privateKey,
    );
    state = reduceEvents(ns, [
      g,
      joinCreate,
      joinVote,
      invite,
      admitCreate,
      admitVote,
      accept,
      transfer,
    ]);

    const beforeTotal = totalPoolPoints(state);
    const expelCreate = await signEvent(
      {
        namespaceId: ns,
        prevHash: transfer.id,
        lamport: 9,
        author: founder.publicKeyHex,
        timestamp: 9,
        payload: {
          type: "proposal_create",
          proposalId: "expel1",
          kind: "expel_member",
          data: { target: joiner.publicKeyHex },
        },
      },
      founder.privateKey,
    );
    const expelVote = await signEvent(
      {
        namespaceId: ns,
        prevHash: expelCreate.id,
        lamport: 10,
        author: founder.publicKeyHex,
        timestamp: 10,
        payload: { type: "proposal_vote", proposalId: "expel1", approve: true },
      },
      founder.privateKey,
    );
    const after = reduceEvents(ns, [
      g,
      joinCreate,
      joinVote,
      invite,
      admitCreate,
      admitVote,
      accept,
      transfer,
      expelCreate,
      expelVote,
    ]);

    expect(after.members).not.toContain(joiner.publicKeyHex);
    expect(after.superstructureEscrow[parentId] ?? 0n).toBeGreaterThan(0n);
    expect(totalPoolPoints(after)).toBe(beforeTotal);
  }, 30_000);

  it("resolveGovernanceParameter blends two child relays by population", () => {
    const parent: PoolState = {
      ...createInitialState("parent"),
      initialized: true,
      members: ["head"],
      balances: { head: points("1000") },
      governanceSliders: { head: { decay_rate: 10 } },
      childCells: ["child-a", "child-b"],
      childPopulation: { "child-a": 1, "child-b": 3 },
      childSliderRelay: {
        "child-a": { decay_rate: 20 },
        "child-b": { decay_rate: 40 },
      },
      parameters: DEFAULT_PARAMETERS,
    };
    const blended = resolveGovernanceParameter(parent, "decay_rate");
    // head stake 1000 @ 10 + child-a pop 1 @ 20 + child-b pop 3 @ 40
    expect(blended).toBeCloseTo((10 * 1000 + 20 * 1 + 40 * 3) / (1000 + 1 + 3), 5);
  });

  it("link_subcell registers child bridge for upward governance relay", async () => {
    const parentHead = await generateKeyPair();
    const childBridge = await generateKeyPair();
    const parentNs = "parent-link-bridge";
    const childId = "child-linked";

    const g = await signEvent(
      {
        namespaceId: parentNs,
        prevHash: null,
        lamport: 1,
        author: parentHead.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "genesis",
          cellName: "Parent",
          initialPoints: "10000",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      parentHead.privateKey,
    );
    const linkCreate = await signEvent(
      {
        namespaceId: parentNs,
        prevHash: g.id,
        lamport: 2,
        author: parentHead.publicKeyHex,
        timestamp: 2,
        payload: {
          type: "proposal_create",
          proposalId: "link1",
          kind: "link_subcell",
          data: { target: childId, population: "1", bridge: childBridge.publicKeyHex },
        },
      },
      parentHead.privateKey,
    );
    const linkVote = await signEvent(
      {
        namespaceId: parentNs,
        prevHash: linkCreate.id,
        lamport: 3,
        author: parentHead.publicKeyHex,
        timestamp: 3,
        payload: { type: "proposal_vote", proposalId: "link1", approve: true },
      },
      parentHead.privateKey,
    );
    const parent = reduceEvents(parentNs, [g, linkCreate, linkVote]);
    expect(parent.bridges).toContain(childBridge.publicKeyHex);

    const relay = await signEvent(
      {
        namespaceId: parentNs,
        prevHash: linkVote.id,
        lamport: 4,
        author: childBridge.publicKeyHex,
        timestamp: 4,
        payload: {
          type: "relay_cell_governance",
          cellId: childId,
          parameters: { ...DEFAULT_PARAMETERS, decay_rate: 18 },
          population: 1,
        },
      },
      childBridge.privateKey,
    );
    const after = reduceEvents(parentNs, [g, linkCreate, linkVote, relay]);
    expect(after.parameters.decay_rate).toBeGreaterThan(DEFAULT_PARAMETERS.decay_rate);
  });
});
