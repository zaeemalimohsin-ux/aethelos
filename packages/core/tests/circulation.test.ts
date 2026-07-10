import { describe, it, expect } from "vitest";
import {
  accrueCirculation,
  computeAccruedDecay,
  runRedistributionCycle,
  reduceEvents,
  reduceEventsWithAudit,
  signEvent,
  generateKeyPair,
  totalPoolPoints,
  createInitialState,
  circulationIntervalMinutes,
  MS_PER_MINUTE,
  MS_PER_DAY,
  TIMESTAMP_FORWARD_SKEW_MS,
  DEFAULT_PARAMETERS,
  MIN_EPOCH_INTERVAL_MINUTES,
  type PoolState,
  points,
} from "../src/index.js";

describe("time-proportional accrual", () => {
  it("carry accumulates across short elapsed windows", () => {
    let carry = 0n;
    const balance = points("10000");
    const annual = 5;
    const sliceMs = 6 * 60 * 60 * 1000;
    let total = 0n;
    for (let i = 0; i < 4; i++) {
      const { decay, newCarry } = computeAccruedDecay(balance, annual, sliceMs, carry);
      carry = newCarry;
      total += decay;
    }
    expect(total).toBeGreaterThanOrEqual(points("1"));
  });

  it("accrues to commons without redistribution when interval not met", () => {
    const t0 = 1_700_000_000_000;
    const s: PoolState = {
      ...createInitialState("acc"),
      initialized: true,
      members: ["alice"],
      balances: { alice: points("10000") },
      parameters: { ...DEFAULT_PARAMETERS, decay_rate: 5, epoch_interval: 60 },
      lastAccrualTimestamp: t0,
      lastRedistributionTimestamp: t0,
      genesisTimestamp: t0,
      maxEventTimestamp: t0,
      totalSupply: points("10000"),
      circulationCarry: 0n,
    };
    const elapsed = MS_PER_DAY;
    const { state: after, accruedTotal } = accrueCirculation(s, 5, elapsed);
    expect(accruedTotal).toBeGreaterThan(0n);
    expect(after.commons).toBe(accruedTotal);
    expect(after.balances["alice"]).toBeLessThan(points("10000"));
    expect(totalPoolPoints(after)).toBe(points("10000"));
  });

  it("holds commons when no eligible live/vouched souls (P2.4)", () => {
    const t0 = 1_700_000_000_000;
    const asOf = t0 + 60 * MS_PER_MINUTE;
    const s: PoolState = {
      ...createInitialState("commons-hold"),
      initialized: true,
      members: ["alice", "bob"],
      balances: { alice: points("5000"), bob: points("5000") },
      commons: points("80"),
      // No inviters / liens → not vouched; also stale activity → not live.
      inviters: { alice: "alice", bob: "bob" },
      vouchLiens: {},
      parameters: { ...DEFAULT_PARAMETERS, epoch_interval: 60 },
      lastAccrualTimestamp: asOf,
      lastRedistributionTimestamp: t0,
      genesisTimestamp: t0,
      maxEventTimestamp: asOf,
      lastActiveTimestamp: { alice: t0, bob: t0 },
      totalSupply: points("10000"),
      circulationCarry: 0n,
    };
    const before = totalPoolPoints(s);
    const after = runRedistributionCycle(s, asOf);
    expect(after.commons).toBe(points("80"));
    expect(after.balances["alice"]).toBe(points("5000"));
    expect(after.balances["bob"]).toBe(points("5000"));
    expect(totalPoolPoints(after)).toBe(before);
    expect(after.epochNumber).toBe(s.epochNumber + 1);
  });

  it("redistribution flushes commons when interval met", () => {
    const t0 = 1_700_000_000_000;
    const asOf = t0 + 60 * MS_PER_MINUTE;
    const s: PoolState = {
      ...createInitialState("flush"),
      initialized: true,
      members: ["alice", "bob"],
      balances: { alice: points("5000"), bob: points("5000") },
      commons: points("50"),
      parameters: { ...DEFAULT_PARAMETERS, epoch_interval: 60 },
      redistributionSliders: {
        alice: { alice: 50, bob: 50 },
        bob: { alice: 50, bob: 50 },
      },
      lastAccrualTimestamp: asOf,
      lastRedistributionTimestamp: t0,
      genesisTimestamp: t0,
      maxEventTimestamp: asOf,
      lastActiveTimestamp: { alice: asOf, bob: asOf },
      totalSupply: points("10000"),
      circulationCarry: 0n,
    };
    const before = totalPoolPoints(s);
    const after = runRedistributionCycle(s, asOf);
    expect(after.commons).toBe(0n);
    expect(after.epochNumber).toBe(1);
    expect(totalPoolPoints(after)).toBe(before);
  });

  it("catch-up runs multiple redistribution cycles after stepped timestamps", async () => {
    const alice = await generateKeyPair();
    const ns = "catch-up";
    const t0 = 1_700_000_000_000;
    const params = { ...DEFAULT_PARAMETERS, epoch_interval: 15, decay_rate: 5 };

    const g = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 1,
        author: alice.publicKeyHex,
        timestamp: t0,
        payload: {
          type: "genesis",
          cellName: "C",
          initialPoints: "10000",
          parameters: params,
        },
      },
      alice.privateKey,
    );

    const events = [g];
    let prevHash = g.id;
    let lamport = 1;
    let ts = t0;
    const gapMs = 45 * MS_PER_MINUTE;
    const steps = Math.ceil(gapMs / TIMESTAMP_FORWARD_SKEW_MS);

    for (let i = 0; i < steps; i++) {
      lamport += 1;
      ts += TIMESTAMP_FORWARD_SKEW_MS;
      const tx = await signEvent(
        {
          namespaceId: ns,
          prevHash,
          lamport,
          author: alice.publicKeyHex,
          timestamp: ts,
          payload: {
            type: "transaction",
            to: alice.publicKeyHex,
            amount: "1",
          },
        },
        alice.privateKey,
      );
      events.push(tx);
      prevHash = tx.id;
    }

    const after = reduceEvents(ns, events);
    expect(after.epochNumber).toBeGreaterThanOrEqual(3);
    expect(totalPoolPoints(after)).toBe(points("10000"));
  });

  it("rejects timestamps beyond forward skew", async () => {
    const alice = await generateKeyPair();
    const ns = "skew";
    const t0 = 1_700_000_000_000;
    const g = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 1,
        author: alice.publicKeyHex,
        timestamp: t0,
        payload: {
          type: "genesis",
          cellName: "S",
          initialPoints: "1000",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      alice.privateKey,
    );
    const tx = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: alice.publicKeyHex,
        timestamp: t0 + TIMESTAMP_FORWARD_SKEW_MS + 1,
        payload: { type: "transaction", to: alice.publicKeyHex, amount: "1" },
      },
      alice.privateKey,
    );
    const after = reduceEvents(ns, [g, tx]);
    expect(after.eventCount).toBe(1);
    expect(after.epochNumber).toBe(0);
  });

  it("accrual is independent of member order", () => {
    const t0 = 1_700_000_000_000;
    const base: PoolState = {
      ...createInitialState("order"),
      initialized: true,
      members: ["alice", "bob", "carol"],
      balances: { alice: points("5000"), bob: points("3000"), carol: points("2000") },
      parameters: { ...DEFAULT_PARAMETERS, decay_rate: 5, epoch_interval: 60 },
      lastAccrualTimestamp: t0,
      lastRedistributionTimestamp: t0,
      genesisTimestamp: t0,
      maxEventTimestamp: t0,
      totalSupply: points("10000"),
      circulationCarry: points("123"),
    };
    const elapsed = 37 * MS_PER_MINUTE;

    const forward = accrueCirculation(base, 5, elapsed);
    const reversed = accrueCirculation(
      { ...base, members: ["carol", "bob", "alice"] },
      5,
      elapsed,
    );
    const shuffled = accrueCirculation(
      { ...base, members: ["bob", "carol", "alice"] },
      5,
      elapsed,
    );

    expect(forward.accruedTotal).toBe(reversed.accruedTotal);
    expect(forward.accruedTotal).toBe(shuffled.accruedTotal);
    expect(forward.state.circulationCarry).toBe(reversed.state.circulationCarry);
    expect(forward.state.commons).toBe(reversed.state.commons);
    expect(forward.state.balances).toEqual(reversed.state.balances);
    expect(totalPoolPoints(forward.state)).toBe(points("10000"));
  });

  it("reduceEvents collects rejections when rejected array passed", async () => {
    const alice = await generateKeyPair();
    const ns = "audit-inline";
    const t0 = 1_700_000_000_000;
    const g = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 1,
        author: alice.publicKeyHex,
        timestamp: t0,
        payload: {
          type: "genesis",
          cellName: "A",
          initialPoints: "1000",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      alice.privateKey,
    );
    const tx = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: alice.publicKeyHex,
        timestamp: t0 + TIMESTAMP_FORWARD_SKEW_MS + 1,
        payload: { type: "transaction", to: alice.publicKeyHex, amount: "1" },
      },
      alice.privateKey,
    );
    const rejected: { eventId: string; reason: string }[] = [];
    const state = reduceEvents(ns, [g, tx], rejected);
    expect(state.eventCount).toBe(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBe("timestamp_too_far_future");
  });

  it("reduceEventsWithAudit surfaces rejected events", async () => {
    const alice = await generateKeyPair();
    const ns = "audit";
    const t0 = 1_700_000_000_000;
    const g = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 1,
        author: alice.publicKeyHex,
        timestamp: t0,
        payload: {
          type: "genesis",
          cellName: "A",
          initialPoints: "1000",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      alice.privateKey,
    );
    const tx = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: alice.publicKeyHex,
        timestamp: t0 + TIMESTAMP_FORWARD_SKEW_MS + 1,
        payload: { type: "transaction", to: alice.publicKeyHex, amount: "1" },
      },
      alice.privateKey,
    );
    const { state, rejected } = reduceEventsWithAudit(ns, [g, tx]);
    expect(state.eventCount).toBe(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBe("timestamp_too_far_future");
  });
});

describe("epoch interval floor (P2.2)", () => {
  it("clamps redistribution interval to the 15-minute philosophy floor", () => {
    const state: PoolState = {
      ...createInitialState("floor"),
      initialized: true,
      members: ["alice"],
      balances: { alice: points("1000") },
      parameters: { ...DEFAULT_PARAMETERS, epoch_interval: 5 },
    };
    expect(MIN_EPOCH_INTERVAL_MINUTES).toBe(15);
    expect(circulationIntervalMinutes(state)).toBe(15);
  });

  it("steps epoch_interval to the nearest 15-minute increment", () => {
    const low: PoolState = {
      ...createInitialState("step-low"),
      initialized: true,
      members: ["alice"],
      balances: { alice: points("1000") },
      parameters: { ...DEFAULT_PARAMETERS, epoch_interval: 22 },
    };
    const high: PoolState = {
      ...low,
      namespaceId: "step-high",
      parameters: { ...DEFAULT_PARAMETERS, epoch_interval: 38 },
    };
    expect(circulationIntervalMinutes(low)).toBe(15);
    expect(circulationIntervalMinutes(high)).toBe(45);
  });
});
