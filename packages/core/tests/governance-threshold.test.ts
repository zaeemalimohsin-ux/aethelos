import { describe, it, expect } from "vitest";
import { hasProposalReachedThreshold } from "../src/governance/index.js";
import { points, DEFAULT_PARAMETERS } from "../src/index.js";
import { createInitialState } from "../src/reducer/state.js";

describe("hasProposalReachedThreshold", () => {
  it("passes at exact 51% stake approval", () => {
    const state = {
      ...createInitialState("thresh"),
      initialized: true,
      members: ["a", "b"],
      balances: { a: points("4900"), b: points("5100") },
      frozen: [],
      parameters: { ...DEFAULT_PARAMETERS, approval_threshold: 51 },
      proposals: {
        p1: {
          id: "p1",
          kind: "expel_member",
          author: "a",
          data: { target: "x" },
          closed: false,
          executed: false,
          votesFor: points("5100"),
          votesAgainst: 0n,
          voters: { b: { approve: true, weight: points("5100") } },
        },
      },
    } as any;
    expect(hasProposalReachedThreshold(state, "p1")).toBe(true);
  });

  it("fails below threshold", () => {
    const state = {
      ...createInitialState("thresh"),
      initialized: true,
      members: ["a", "b"],
      balances: { a: points("4900"), b: points("5100") },
      frozen: [],
      parameters: { ...DEFAULT_PARAMETERS, approval_threshold: 51 },
      proposals: {
        p1: {
          id: "p1",
          kind: "expel_member",
          author: "a",
          data: { target: "x" },
          closed: false,
          executed: false,
          votesFor: points("4900"),
          votesAgainst: 0n,
          voters: { a: { approve: true, weight: points("4900") } },
        },
      },
    } as any;
    expect(hasProposalReachedThreshold(state, "p1")).toBe(false);
  });
});
