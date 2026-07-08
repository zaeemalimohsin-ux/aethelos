import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateKeyPair, DEFAULT_PARAMETERS, type PoolState } from "@aethelos/core";
import { FederationReader } from "../src/node/federation-reader.js";

const { mockEngines } = vi.hoisted(() => ({
  mockEngines: [] as Array<{
    ns: string;
    started: boolean;
    engine: { deliverEvents: (events: unknown[]) => void } | null;
  }>,
}));

vi.mock("../src/sync/engine.js", () => ({
  SyncEngine: class {
    ns: string;
    started = false;
    private listener: ((events: unknown[]) => void) | null = null;
    constructor(_urls: string[], namespaceId: string) {
      this.ns = namespaceId;
      const entry = {
        ns: namespaceId,
        started: false,
        engine: null as { deliverEvents: (events: unknown[]) => void } | null,
      };
      entry.engine = {
        deliverEvents: (events: unknown[]) => {
          this.listener?.(events);
        },
      };
      mockEngines.push(entry);
    }
    onEvents(fn: (events: unknown[]) => void) {
      this.listener = fn;
      return () => {
        this.listener = null;
      };
    }
    async start() {
      this.started = true;
      const entry = mockEngines.find((e) => e.ns === this.ns);
      if (entry) entry.started = true;
    }
    disconnect() {}
  },
}));

function minimalPool(overrides: Partial<PoolState>): PoolState {
  return {
    namespaceId: "child",
    cellName: "C",
    initialized: true,
    members: [],
    balances: {},
    frozen: [],
    vouchLiens: {},
    inviters: {},
    head: null,
    parameters: DEFAULT_PARAMETERS,
    governanceSliders: {},
    redistributionSliders: {},
    vouchSliders: {},
    proposals: {},
    superstructureId: null,
    parentSuperstructures: [],
    childCells: [],
    childPopulation: {},
    childCellEscrow: {},
    childSliderRelay: {},
    bridges: [],
    epochNumber: 0,
    totalSupply: 0n,
    fractures: [],
    pendingInvites: {},
    eventCount: 0,
    eventsSinceEpoch: 0,
    lastEpochTimestamp: 0,
    lastAccrualTimestamp: 0,
    lastRedistributionTimestamp: 0,
    maxEventTimestamp: 0,
    commons: 0n,
    superstructureEscrow: {},
    ...overrides,
  };
}

describe("FederationReader", () => {
  beforeEach(() => {
    mockEngines.length = 0;
  });

  it("subscribes to linked parent namespaces on sync", async () => {
    const kp = await generateKeyPair();
    const parentId = "parent-linked";
    const pool = minimalPool({
      members: [kp.publicKeyHex],
      parentSuperstructures: [parentId],
    });

    const reader = new FederationReader();
    await reader.sync(pool, kp, ["ws://127.0.0.1:1"]);
    expect(mockEngines.some((e) => e.ns === parentId && e.started)).toBe(true);
    reader.stop();
  });

  it("drops engines when namespace is unlinked", async () => {
    const kp = await generateKeyPair();
    const parentId = "parent-drop";
    const base = minimalPool({
      namespaceId: "child2",
      members: [kp.publicKeyHex],
      parentSuperstructures: [parentId],
    });

    const reader = new FederationReader();
    await reader.sync(base, kp, ["ws://127.0.0.1:1"]);
    expect(mockEngines.some((e) => e.ns === parentId)).toBe(true);

    await reader.sync({ ...base, parentSuperstructures: [] }, kp, ["ws://127.0.0.1:1"]);
    expect(Object.keys(reader.getPools())).toHaveLength(0);
    reader.stop();
  });

  it("ensureNamespace waits for sync before returning pool state", async () => {
    const kp = await generateKeyPair();
    const parentId = "parent-await-sync";
    const reader = new FederationReader();

    const promise = reader.ensureNamespace(parentId, kp, ["ws://127.0.0.1:1"]);
    await expect(
      Promise.race([
        promise.then(() => "done"),
        new Promise((resolve) => setTimeout(() => resolve("pending"), 30)),
      ]),
    ).resolves.toBe("pending");

    const entry = mockEngines.find((e) => e.ns === parentId);
    entry?.engine?.deliverEvents([]);
    await promise;
    expect(reader.getPool(parentId)).toBeDefined();
    reader.stop();
  });
});
