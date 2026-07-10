import { describe, it, expect } from "vitest";
import {
  MS_PER_MINUTE,
  nextRedistributionAt,
  points,
  DEFAULT_PARAMETERS,
} from "@aethelos/core";
import type { PoolState } from "@aethelos/core";

function poolFixture(lastRedistribution: number, maxEventTimestamp: number): PoolState {
  return {
    namespaceId: "cd",
    cellName: "CD",
    initialized: true,
    members: ["a"],
    balances: { a: points("1000") },
    frozen: [],
    vouchLiens: {},
    inviters: {},
    head: "a",
    parameters: { ...DEFAULT_PARAMETERS, epoch_interval: 15 },
    governanceSliders: {},
    redistributionSliders: { a: { a: 100 } },
    vouchSliders: {},
    proposals: {},
    superstructureId: null,
    parentSuperstructures: [],
    epochNumber: 0,
    totalSupply: points("1000"),
    fractures: [],
    pendingInvites: {},
    commons: 0n,
    genesisTimestamp: lastRedistribution,
    lastEpochTimestamp: lastRedistribution,
    lastAccrualTimestamp: lastRedistribution,
    lastRedistributionTimestamp: lastRedistribution,
    maxEventTimestamp,
    lastActiveTimestamp: { a: maxEventTimestamp },
    circulationCarry: 0n,
  } as PoolState;
}

function countdownLabel(pool: PoolState, now: number): { due: boolean; label: string } {
  if (!pool || pool.lastRedistributionTimestamp <= 0) {
    return { due: false, label: "" };
  }
  const nextAt = nextRedistributionAt(pool);
  const referenceNow = Math.max(now, pool.maxEventTimestamp);
  const due = referenceNow >= nextAt;
  const msLeft = Math.max(0, nextAt - referenceNow);
  const label = due
    ? "Redistribution due — applies when the community next records activity"
    : `Next redistribution in ~${Math.ceil(msLeft / MS_PER_MINUTE)} min`;
  return { due, label };
}

describe("circulation countdown logic", () => {
  it("shows due when referenceNow passes next redistribution", () => {
    const now = 1_700_000_000_000;
    const last = now - 20 * 60_000;
    const result = countdownLabel(poolFixture(last, now), now);
    expect(result.due).toBe(true);
    expect(result.label).toMatch(/Redistribution due/i);
  });

  it("uses max(client now, pool.maxEventTimestamp) as reference", () => {
    const now = 1_700_000_000_000;
    const last = now;
    const futureChain = now + 5 * 60_000;
    const result = countdownLabel(poolFixture(last, futureChain), now);
    expect(result.due).toBe(false);
    expect(result.label).toMatch(/Next redistribution/i);
  });
});
