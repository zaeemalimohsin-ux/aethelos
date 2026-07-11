import { describe, it, expect } from "vitest";
import {
  createInitialState,
  reduceOneSync,
  signEvent,
  generateKeyPair,
  DEFAULT_PARAMETERS,
  points,
} from "../src/index.js";

describe("superstructure authorization guards", () => {
  it("rejects bridge_transaction from a non-bridge member with not_bridge", async () => {
    const bridge = await generateKeyPair();
    const plain = await generateKeyPair();
    const ns = "guard-bridge-tx";
    const state = {
      ...createInitialState(ns),
      initialized: true,
      members: [bridge.publicKeyHex, plain.publicKeyHex],
      balances: {
        [bridge.publicKeyHex]: points("1000"),
        [plain.publicKeyHex]: points("100"),
      },
      bridges: [bridge.publicKeyHex],
      parentSuperstructures: ["parent-ns"],
      head: bridge.publicKeyHex,
      parameters: DEFAULT_PARAMETERS,
    };

    const evt = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 1,
        author: plain.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "bridge_transaction",
          superstructureId: "parent-ns",
          to: plain.publicKeyHex,
          amount: "10",
          localProposalId: "p1",
        },
      },
      plain.privateKey,
    );
    const r = reduceOneSync(state, evt);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("not_bridge");
  });

  it("rejects relay_cell_governance from a non-bridge author for a known child cell", async () => {
    const bridge = await generateKeyPair();
    const plain = await generateKeyPair();
    const ns = "guard-relay-gov";
    const state = {
      ...createInitialState(ns),
      initialized: true,
      members: [bridge.publicKeyHex, plain.publicKeyHex],
      balances: { [bridge.publicKeyHex]: points("1000") },
      bridges: [bridge.publicKeyHex],
      childCells: ["child-ns"],
      head: bridge.publicKeyHex,
      parameters: DEFAULT_PARAMETERS,
    };

    const evt = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 1,
        author: plain.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "relay_cell_governance",
          cellId: "child-ns",
          population: 1,
          parameters: { decay_rate: 10 },
        },
      },
      plain.privateKey,
    );
    const r = reduceOneSync(state, evt);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("not_bridge");
  });

  it("rejects relay_cell_governance for an unknown cellId with unknown_cell", async () => {
    const bridge = await generateKeyPair();
    const ns = "guard-unknown-cell";
    const state = {
      ...createInitialState(ns),
      initialized: true,
      members: [bridge.publicKeyHex],
      balances: { [bridge.publicKeyHex]: points("1000") },
      bridges: [bridge.publicKeyHex],
      childCells: ["child-ns"],
      head: bridge.publicKeyHex,
      parameters: DEFAULT_PARAMETERS,
    };

    const evt = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 1,
        author: bridge.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "relay_cell_governance",
          cellId: "missing-child",
          population: 1,
          parameters: { decay_rate: 10 },
        },
      },
      bridge.privateKey,
    );
    const r = reduceOneSync(state, evt);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("unknown_cell");
  });

  it("rejects join_superstructure proposal from a non-member with not_member", async () => {
    const outsider = await generateKeyPair();
    const member = await generateKeyPair();
    const ns = "guard-join-proposal";
    const state = {
      ...createInitialState(ns),
      initialized: true,
      members: [member.publicKeyHex],
      balances: { [member.publicKeyHex]: points("1000") },
      head: member.publicKeyHex,
      parameters: DEFAULT_PARAMETERS,
    };

    const evt = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 1,
        author: outsider.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "proposal_create",
          proposalId: "join-outsider",
          kind: "join_superstructure",
          data: { target: "parent-ns" },
        },
      },
      outsider.privateKey,
    );
    const r = reduceOneSync(state, evt);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("not_member");
  });

  it("rejects leave_superstructure proposal from a frozen member with author_frozen", async () => {
    const frozen = await generateKeyPair();
    const ns = "guard-leave-frozen";
    const state = {
      ...createInitialState(ns),
      initialized: true,
      members: [frozen.publicKeyHex],
      balances: { [frozen.publicKeyHex]: points("1000") },
      frozen: [frozen.publicKeyHex],
      parentSuperstructures: ["parent-ns"],
      bridges: [frozen.publicKeyHex],
      head: frozen.publicKeyHex,
      parameters: DEFAULT_PARAMETERS,
    };

    const evt = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 1,
        author: frozen.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "proposal_create",
          proposalId: "leave-frozen",
          kind: "leave_superstructure",
          data: { target: "parent-ns" },
        },
      },
      frozen.privateKey,
    );
    const r = reduceOneSync(state, evt);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("author_frozen");
  });
});
