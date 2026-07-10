import { describe, it, expect } from "vitest";
import {
  canInitiateSuperstructureProposal,
  canCloseProposal,
  proposalApprovalPercent,
  aggregateCellSliderForSuperstructure,
  resolvedGovernanceParameters,
  relayGovernanceSnapshot,
  computeSuperstructureRedistribution,
  allocateCommonsToChildCells,
  memberVotingPower,
  isEligibleVoter,
  cellPopulationWeight,
} from "../src/governance/index.js";
import { createInitialState } from "../src/reducer/state.js";
import { points, DEFAULT_PARAMETERS } from "../src/index.js";
describe("governance index coverage", () => {
  it("superstructure proposal gates and head close", () => {
    const state = {
      ...createInitialState("gov"),
      initialized: true,
      members: ["head", "bob"],
      head: "head",
      frozen: ["bob"],
      balances: { head: points("6000"), bob: points("4000") },
    };
    expect(canInitiateSuperstructureProposal(state, "head")).toBe(true);
    expect(canInitiateSuperstructureProposal(state, "bob")).toBe(false);
    expect(canCloseProposal(state, "head")).toBe(true);
    expect(canCloseProposal(state, "bob")).toBe(false);
  });
  it("proposalApprovalPercent handles empty and mixed votes", () => {
    expect(proposalApprovalPercent(0n, 0n)).toBe(0);
    expect(proposalApprovalPercent(75n, 25n)).toBe(75);
  });
  it("aggregateCellSliderForSuperstructure is share-weighted", () => {
    const state = {
      ...createInitialState("slider"),
      initialized: true,
      members: ["a", "b"],
      frozen: [],
      balances: { a: points("5000"), b: points("5000") },
      parameters: { ...DEFAULT_PARAMETERS, decay_rate: 5 },
      governanceSliders: { a: { decay_rate: 10 }, b: { decay_rate: 20 } },
    };
    expect(aggregateCellSliderForSuperstructure(state, "decay_rate")).toBe(15);
    expect(resolvedGovernanceParameters(state).decay_rate).toBeGreaterThan(0);
    expect(relayGovernanceSnapshot(state).decay_rate).toBe(15);
  });
  it("superstructure redistribution and commons allocation", () => {
    const a = { ...createInitialState("child-a"), members: ["m1", "m2"] };
    const b = { ...createInitialState("child-b"), members: ["m3"] };
    const pool = points("1000");
    const allocations = computeSuperstructureRedistribution([a, b], pool);
    const childA = allocations.get("child-a") ?? 0n;
    const childB = allocations.get("child-b") ?? 0n;
    expect(childA + childB).toBe(pool);
    expect(childA).toBeGreaterThan(childB);
    const parent = {
      ...createInitialState("parent"),
      childCells: ["child-a", "child-b"],
      childPopulation: { "child-a": 2, "child-b": 1 },
      childCellEscrow: {},
    };
    const { allocated, state } = allocateCommonsToChildCells(parent, points("900"));
    expect(allocated).toBe(points("900"));
    expect(state.childCellEscrow?.["child-a"]).toBeGreaterThan(0n);
  });
  it("member voting helpers", () => {
    const state = {
      ...createInitialState("vote"),
      initialized: true,
      members: ["alice"],
      frozen: [],
      balances: { alice: points("1000") },
    };
    expect(cellPopulationWeight(state)).toBe(1);
    expect(memberVotingPower(state, "alice")).toBeGreaterThan(0n);
    expect(isEligibleVoter(state, "alice")).toBe(true);
    state.frozen.push("alice");
    expect(isEligibleVoter(state, "alice")).toBe(false);
  });
});
