import { describe, it, expect } from "vitest";
import {
  allocateCommonsToChildCells,
  computeSuperstructureRedistribution,
  createInitialState,
  reduceOneSync,
  reduceEvents,
  runRedistributionCycle,
  signEvent,
  generateKeyPair,
  totalPoolPoints,
  resolveGovernanceParameter,
  DEFAULT_PARAMETERS,
  type PoolState,
  points,
} from "../src/index.js";

describe("superstructure redistribution", () => {
  it("computeSuperstructureRedistribution splits by population", () => {
    const cells = [
      { ...createInitialState("a"), members: ["1", "2", "3"] },
      { ...createInitialState("b"), members: ["4", "5"] },
    ] satisfies PoolState[];
    const allocations = computeSuperstructureRedistribution(cells, points("100"));
    expect(allocations.get("a")).toBe(points("60"));
    expect(allocations.get("b")).toBe(points("40"));
  });

  it("runRedistributionCycle routes commons to childCellEscrow by population", () => {
    const parent: PoolState = {
      ...createInitialState("parent"),
      initialized: true,
      members: ["head"],
      balances: { head: points("1000") },
      childCells: ["child-a", "child-b"],
      childPopulation: { "child-a": 3, "child-b": 1 },
      commons: points("400"),
      parameters: DEFAULT_PARAMETERS,
      redistributionSliders: { head: { head: 100 } },
      lastActiveTimestamp: { head: 1 },
      totalSupply: points("1000"),
    };
    const before = totalPoolPoints(parent);
    const after = runRedistributionCycle(parent, 1);
    expect(after.commons).toBe(0n);
    expect(after.childCellEscrow["child-a"]).toBe(points("300"));
    expect(after.childCellEscrow["child-b"]).toBe(points("100"));
    expect(totalPoolPoints(after)).toBe(before);
  });

  it("allocateCommonsToChildCells conserves points", () => {
    const parent: PoolState = {
      ...createInitialState("p"),
      childCells: ["c1", "c2"],
      childPopulation: { c1: 2, c2: 2 },
    };
    const { state, allocated } = allocateCommonsToChildCells(parent, points("99"));
    expect(allocated).toBe(points("99"));
    expect((state.childCellEscrow.c1 ?? 0n) + (state.childCellEscrow.c2 ?? 0n)).toBe(
      points("99"),
    );
  });
});

describe("bridge_transaction", () => {
  it("releases superstructureEscrow upward to parent namespace", async () => {
    const bridge = await generateKeyPair();
    const parentId = "parent-ns";
    const remoteHead = "00000000000000000000000000000000000000000000000000000000000000ab";
    const state: PoolState = {
      ...createInitialState("child"),
      initialized: true,
      members: [bridge.publicKeyHex],
      balances: { [bridge.publicKeyHex]: points("500") },
      bridges: [bridge.publicKeyHex],
      parentSuperstructures: [parentId],
      superstructureEscrow: { [parentId]: points("200") },
      totalSupply: points("700"),
      proposals: {
        p1: {
          id: "p1",
          kind: "bridge_transfer",
          author: bridge.publicKeyHex,
          data: { target: parentId, to: remoteHead, amount: "150" },
          votesFor: points("100"),
          votesAgainst: 0n,
          voters: {},
          closed: true,
          executed: true,
        },
      },
    };
    const before = totalPoolPoints(state);
    const evt = await signEvent(
      {
        namespaceId: "child",
        prevHash: null,
        lamport: 1,
        author: bridge.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "bridge_transaction",
          superstructureId: parentId,
          localProposalId: "p1",
          to: remoteHead,
          amount: "150",
        },
      },
      bridge.privateKey,
    );
    const r = reduceOneSync(state, evt);
    expect(r.ok).toBe(true);
    expect(r.state.superstructureEscrow[parentId]).toBe(points("50"));
    expect(totalPoolPoints(r.state)).toBe(before - points("150"));
  });

  it("delivers inbound bridge transfer to a local member", async () => {
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
          data: {
            target: "remote",
            to: recipient.publicKeyHex,
            amount: "50",
          },
          votesFor: points("100"),
          votesAgainst: 0n,
          voters: {},
          closed: true,
          executed: true,
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
    expect(r.ok).toBe(true);
    expect(r.state.balances[bridge.publicKeyHex]).toBe(points("250"));
    expect(r.state.balances[recipient.publicKeyHex]).toBe(points("150"));
    expect(r.state.proposals.p1?.bridgeCompleted).toBe(true);
    expect(totalPoolPoints(r.state)).toBe(points("400"));
  });

  it("rejects discretionary bridge without approved proposal", async () => {
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
          localProposalId: "missing",
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

  it("credits inbound bridge from linked parent without debiting bridge float", async () => {
    const bridge = await generateKeyPair();
    const parentId = "parent-ns";
    const state: PoolState = {
      ...createInitialState("child"),
      initialized: true,
      members: [bridge.publicKeyHex],
      balances: { [bridge.publicKeyHex]: points("100") },
      bridges: [bridge.publicKeyHex],
      parentSuperstructures: [parentId],
      totalSupply: points("100"),
    };
    const evt = await signEvent(
      {
        namespaceId: "child",
        prevHash: null,
        lamport: 1,
        author: bridge.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "bridge_transaction",
          superstructureId: parentId,
          localProposalId: "src-1",
          to: bridge.publicKeyHex,
          amount: "75",
        },
      },
      bridge.privateKey,
    );
    const r = reduceOneSync(state, evt);
    expect(r.ok).toBe(true);
    expect(r.state.balances[bridge.publicKeyHex]).toBe(points("175"));
    expect(totalPoolPoints(r.state)).toBe(points("175"));
  });

  it("cross-namespace seam conserves combined pool totals", async () => {
    const bridge = await generateKeyPair();
    const parentId = "parent-ns";
    const childId = "child-ns";
    const remoteHead = "00000000000000000000000000000000000000000000000000000000000000ab";

    let child: PoolState = {
      ...createInitialState(childId),
      initialized: true,
      members: [bridge.publicKeyHex],
      balances: { [bridge.publicKeyHex]: 0n },
      bridges: [bridge.publicKeyHex],
      parentSuperstructures: [parentId],
      superstructureEscrow: { [parentId]: points("200") },
      totalSupply: points("200"),
      proposals: {
        p1: {
          id: "p1",
          kind: "bridge_transfer",
          author: bridge.publicKeyHex,
          data: { target: parentId, to: remoteHead, amount: "120" },
          votesFor: points("100"),
          votesAgainst: 0n,
          voters: {},
          closed: true,
          executed: true,
        },
      },
    };
    let parent: PoolState = {
      ...createInitialState(parentId),
      initialized: true,
      members: [bridge.publicKeyHex],
      balances: { [bridge.publicKeyHex]: points("500") },
      bridges: [bridge.publicKeyHex],
      childCells: [childId],
      totalSupply: points("500"),
    };

    const outbound = await signEvent(
      {
        namespaceId: childId,
        prevHash: null,
        lamport: 1,
        author: bridge.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "bridge_transaction",
          superstructureId: parentId,
          localProposalId: "p1",
          to: remoteHead,
          amount: "120",
        },
      },
      bridge.privateKey,
    );
    const childAfter = reduceOneSync(child, outbound);
    expect(childAfter.ok).toBe(true);
    child = childAfter.state;

    const inbound = await signEvent(
      {
        namespaceId: parentId,
        prevHash: null,
        lamport: 1,
        author: bridge.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "bridge_transaction",
          superstructureId: childId,
          localProposalId: outbound.id,
          to: bridge.publicKeyHex,
          amount: "120",
        },
      },
      bridge.privateKey,
    );
    const parentAfter = reduceOneSync(parent, inbound);
    expect(parentAfter.ok).toBe(true);
    parent = parentAfter.state;

    expect(totalPoolPoints(child)).toBe(points("80"));
    expect(totalPoolPoints(parent)).toBe(points("620"));
    expect(totalPoolPoints(child) + totalPoolPoints(parent)).toBe(points("700"));
  });

  it("parent resolveGovernanceParameter blends child slider relays by population", () => {
    const parent: PoolState = {
      ...createInitialState("parent"),
      initialized: true,
      members: ["head"],
      balances: { head: points("1000") },
      childCells: ["child-a"],
      childPopulation: { "child-a": 4 },
      childSliderRelay: { "child-a": { decay_rate: 8, approval_threshold: 60 } },
      governanceSliders: { head: { decay_rate: 4, approval_threshold: 50 } },
      parameters: DEFAULT_PARAMETERS,
      totalSupply: points("1000"),
    };
    expect(resolveGovernanceParameter(parent, "decay_rate")).toBeCloseTo(4.016, 2);
    expect(resolveGovernanceParameter(parent, "approval_threshold")).toBeCloseTo(
      50.04,
      1,
    );
  });

  it("relay_cell_governance updates parent childSliderRelay", async () => {
    const bridge = await generateKeyPair();
    const childId = "child-ns";
    const state: PoolState = {
      ...createInitialState("parent"),
      initialized: true,
      members: [bridge.publicKeyHex],
      bridges: [bridge.publicKeyHex],
      childCells: [childId],
      parameters: DEFAULT_PARAMETERS,
      totalSupply: 0n,
    };
    const evt = await signEvent(
      {
        namespaceId: "parent",
        prevHash: null,
        lamport: 1,
        author: bridge.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "relay_cell_governance",
          cellId: childId,
          parameters: { ...DEFAULT_PARAMETERS, decay_rate: 7 },
          population: 5,
        },
      },
      bridge.privateKey,
    );
    const r = reduceOneSync(state, evt);
    expect(r.ok).toBe(true);
    expect(r.state.childSliderRelay[childId]?.decay_rate).toBe(7);
    expect(r.state.childPopulation[childId]).toBe(5);
  });

  it("join_superstructure conforms child parameters from proposal data", async () => {
    const head = await generateKeyPair();
    const ns = "child-join";
    const parentParams = { ...DEFAULT_PARAMETERS, decay_rate: 9, epoch_interval: 120 };
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
    const create = await signEvent(
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
          data: {
            target: "parent-ns",
            parameters: JSON.stringify(parentParams),
          },
        },
      },
      head.privateKey,
    );
    const vote = await signEvent(
      {
        namespaceId: ns,
        prevHash: create.id,
        lamport: 3,
        author: head.publicKeyHex,
        timestamp: 3,
        payload: { type: "proposal_vote", proposalId: "join1", approve: true },
      },
      head.privateKey,
    );
    const after = reduceEvents(ns, [g, create, vote]);
    expect(after.parameters.decay_rate).toBe(9);
    expect(after.parameters.epoch_interval).toBe(120);
    expect(after.parentSuperstructures).toContain("parent-ns");
    expect(after.superstructureId).toBe("parent-ns");
  });

  it("executes bridge_transfer proposal then allows bridge_transaction", async () => {
    const head = await generateKeyPair();
    const parentId = "parent-ns";
    const ns = "child-bridge";
    const remoteHead = "00000000000000000000000000000000000000000000000000000000000000aa";

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
          initialPoints: "500",
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
    const bridgeCreate = await signEvent(
      {
        namespaceId: ns,
        prevHash: joinVote.id,
        lamport: 4,
        author: head.publicKeyHex,
        timestamp: 4,
        payload: {
          type: "proposal_create",
          proposalId: "bridge1",
          kind: "bridge_transfer",
          data: { target: parentId, to: remoteHead, amount: "40" },
        },
      },
      head.privateKey,
    );
    const bridgeVote = await signEvent(
      {
        namespaceId: ns,
        prevHash: bridgeCreate.id,
        lamport: 5,
        author: head.publicKeyHex,
        timestamp: 5,
        payload: { type: "proposal_vote", proposalId: "bridge1", approve: true },
      },
      head.privateKey,
    );

    let state = reduceEvents(ns, [g, joinCreate, joinVote, bridgeCreate, bridgeVote]);
    expect(state.proposals["bridge1"]?.executed).toBe(true);
    state = { ...state, superstructureEscrow: { [parentId]: points("100") } };

    const bridgeEvt = await signEvent(
      {
        namespaceId: ns,
        prevHash: bridgeVote.id,
        lamport: 6,
        author: head.publicKeyHex,
        timestamp: 6,
        payload: {
          type: "bridge_transaction",
          superstructureId: parentId,
          localProposalId: "bridge1",
          to: remoteHead,
          amount: "40",
        },
      },
      head.privateKey,
    );
    const after = reduceOneSync(state, bridgeEvt);
    expect(after.ok).toBe(true);
    expect(after.state.superstructureEscrow[parentId]).toBe(points("60"));
    expect(after.state.proposals["bridge1"]?.bridgeCompleted).toBe(true);
  });

  it("releases childCellEscrow downward to linked child", async () => {
    const bridge = await generateKeyPair();
    const childId = "child-ns";
    const recipient = "0000000000000000000000000000000000000000000000000000000000000001";
    const state: PoolState = {
      ...createInitialState("parent"),
      initialized: true,
      members: [bridge.publicKeyHex],
      balances: { [bridge.publicKeyHex]: points("100") },
      bridges: [bridge.publicKeyHex],
      childCells: [childId],
      childCellEscrow: { [childId]: points("80") },
      totalSupply: points("180"),
      proposals: {
        p1: {
          id: "p1",
          kind: "bridge_transfer",
          author: bridge.publicKeyHex,
          data: { target: childId, to: recipient, amount: "30" },
          votesFor: points("100"),
          votesAgainst: 0n,
          voters: {},
          closed: true,
          executed: true,
        },
      },
    };
    const evt = await signEvent(
      {
        namespaceId: "parent",
        prevHash: null,
        lamport: 1,
        author: bridge.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "bridge_transaction",
          superstructureId: childId,
          localProposalId: "p1",
          to: recipient,
          amount: "30",
        },
      },
      bridge.privateKey,
    );
    const r = reduceOneSync(state, evt);
    expect(r.ok).toBe(true);
    expect(r.state.childCellEscrow[childId]).toBe(points("50"));
    expect(totalPoolPoints(r.state)).toBe(points("150"));
  });
});
