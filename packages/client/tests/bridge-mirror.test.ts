import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateKeyPair,
  DEFAULT_PARAMETERS,
  type PoolState,
  type SignedEvent,
} from "@aethelos/core";
import { BridgeMirrorCoordinator } from "../src/node/bridge-mirror.js";

const { mockPublishes } = vi.hoisted(() => ({ mockPublishes: [] as unknown[] }));

vi.mock("../src/sync/engine.js", () => ({
  SyncEngine: class {
    async start() {}
    disconnect() {}
    async publish(msg: unknown) {
      mockPublishes.push(msg);
    }
  },
}));

describe("BridgeMirrorCoordinator", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockPublishes.length = 0;
  });

  it("mirrors outbound bridge_transaction once per event id", async () => {
    const kp = await generateKeyPair();
    const parentId = "parent-1";
    const pool: PoolState = {
      namespaceId: "child-1",
      cellName: "Child",
      initialized: true,
      members: [kp.publicKeyHex],
      balances: { [kp.publicKeyHex]: 100n },
      frozen: [],
      vouchLiens: {},
      inviters: {},
      head: kp.publicKeyHex,
      parameters: DEFAULT_PARAMETERS,
      governanceSliders: {},
      redistributionSliders: {},
      vouchSliders: {},
      proposals: {},
      superstructureId: parentId,
      parentSuperstructures: [parentId],
      childCells: [],
      childPopulation: {},
      childCellEscrow: {},
      childSliderRelay: {},
      bridges: [kp.publicKeyHex],
      epochNumber: 0,
      totalSupply: 100n,
      fractures: [],
      pendingInvites: {},
      eventCount: 0,
      eventsSinceEpoch: 0,
      lastEpochTimestamp: 0,
      lastAccrualTimestamp: 1,
      lastRedistributionTimestamp: 1,
      maxEventTimestamp: 1,
      commons: 0n,
      superstructureEscrow: {},
    };

    const coordinator = new BridgeMirrorCoordinator();
    await coordinator.syncLinkedNamespaces(
      pool,
      kp,
      ["ws://127.0.0.1:1"],
      kp.publicKeyHex,
    );

    const event = {
      id: "evt-bridge-1",
      namespaceId: "child-1",
      prevHash: null,
      lamport: 1,
      author: kp.publicKeyHex,
      timestamp: 1,
      payload: {
        type: "bridge_transaction" as const,
        superstructureId: parentId,
        localProposalId: "p1",
        to: "00000000000000000000000000000000000000000000000000000000000000aa",
        amount: "10",
      },
      signature: "ab".repeat(32),
    } satisfies SignedEvent;

    await coordinator.mirrorOutboundEvents(pool, [event], kp.publicKeyHex);
    await coordinator.mirrorOutboundEvents(pool, [event], kp.publicKeyHex);

    expect(mockPublishes.length).toBe(1);
    coordinator.stop();
  });
});
