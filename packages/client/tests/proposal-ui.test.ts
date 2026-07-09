import { describe, expect, it } from "vitest";
import type { PoolState } from "@aethelos/core";
import { stakeWeightedApprovalPercent } from "../src/app/proposal-ui.js";

function stubPool(
  members: string[],
  voters: Record<string, { approve: boolean }>,
): PoolState {
  return {
    members,
    frozen: [],
    proposals: {
      p1: {
        id: "p1",
        kind: "admit_member",
        target: "joiner",
        voters,
        votesFor: 0n,
        executed: false,
        proposer: members[0]!,
      },
    },
    balances: Object.fromEntries(members.map((m) => [m, 1000n])),
    pendingInvites: {},
    parameters: {
      approval_threshold: 51,
      decay_rate: 5,
      epoch_interval: 60,
    },
  } as unknown as PoolState;
}

describe("stakeWeightedApprovalPercent", () => {
  it("counts approve votes from voters map by stake weight", () => {
    const pool = stubPool(["a", "b", "c"], {
      a: { approve: true },
      b: { approve: false },
    });
    const proposal = pool.proposals.p1!;
    expect(stakeWeightedApprovalPercent(pool, proposal)).toBe(33);
  });

  it("returns 0 when no stake", () => {
    const pool = stubPool([], {});
    const proposal = pool.proposals.p1!;
    expect(stakeWeightedApprovalPercent(pool, proposal)).toBe(0);
  });
});
