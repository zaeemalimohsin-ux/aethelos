import { describe, it, expect } from "vitest";
import { createInitialState, resolveGovernanceParameter } from "../src/reducer/state.js";
import { points, DEFAULT_PARAMETERS } from "../src/index.js";

describe("resolveGovernanceParameter (cell-level)", () => {
  it("blends member sliders by stake weight within a single cell", () => {
    const state = {
      ...createInitialState("cell"),
      initialized: true,
      members: ["a", "b"],
      frozen: [],
      balances: { a: points("6000"), b: points("4000") },
      parameters: { ...DEFAULT_PARAMETERS, decay_rate: 5 },
      governanceSliders: { a: { decay_rate: 10 }, b: { decay_rate: 20 } },
    };
    expect(resolveGovernanceParameter(state, "decay_rate")).toBeCloseTo(14, 5);
  });

  it("excludes frozen members from the weighted blend", () => {
    const state = {
      ...createInitialState("cell"),
      initialized: true,
      members: ["a", "b"],
      frozen: ["b"],
      balances: { a: points("5000"), b: points("5000") },
      parameters: { ...DEFAULT_PARAMETERS, decay_rate: 5 },
      governanceSliders: { a: { decay_rate: 12 }, b: { decay_rate: 99 } },
    };
    expect(resolveGovernanceParameter(state, "decay_rate")).toBeCloseTo(12, 5);
  });

  it("falls back to genesis default when no voting weight remains", () => {
    const state = {
      ...createInitialState("cell"),
      initialized: true,
      members: ["a"],
      frozen: ["a"],
      balances: { a: points("1000") },
      parameters: { ...DEFAULT_PARAMETERS, decay_rate: 7 },
      governanceSliders: { a: { decay_rate: 40 } },
    };
    expect(resolveGovernanceParameter(state, "decay_rate")).toBe(7);
  });
});