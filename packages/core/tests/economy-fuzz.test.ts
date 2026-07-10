import { describe, it, expect } from "vitest";
import { distributeRedistribution, points, totalPoolPoints } from "../src/index.js";
import { createInitialState } from "../src/reducer/state.js";
import { DEFAULT_PARAMETERS } from "../src/index.js";

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("economy fuzz", () => {
  it("distributeRedistribution conserves pool for random targets", () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 200; i++) {
      const pool = BigInt(1 + Math.floor(rnd() * 10_000_000_000));
      const memberCount = 2 + Math.floor(rnd() * 6);
      const members = Array.from({ length: memberCount }, (_, j) => `m${j}`);
      const raw: Record<string, number> = {};
      let sum = 0;
      for (const m of members) {
        const w = rnd();
        raw[m] = w;
        sum += w;
      }
      const targets: Record<string, number> = {};
      for (const m of members) targets[m] = (raw[m]! / sum) * 100;
      const state = {
        ...createInitialState("fuzz"),
        initialized: true,
        members,
        balances: Object.fromEntries(members.map((m) => [m, 0n])),
        parameters: { ...DEFAULT_PARAMETERS },
        redistributionSliders: {},
        governanceSliders: {},
        vouchSliders: {},
        proposals: {},
        pendingInvites: {},
        frozen: [],
        fractures: [],
        inviters: {},
        vouchLiens: {},
        parentSuperstructures: [],
        epochNumber: 0,
        totalSupply: 0n,
        commons: pool,
      };
      const after = distributeRedistribution(state as any, pool, targets);
      const allocated = members.reduce((acc, m) => acc + (after.balances[m] ?? 0n), 0n);
      expect(allocated).toBe(pool);
    }
  });
});
