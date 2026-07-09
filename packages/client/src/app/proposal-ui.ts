import type { PoolState } from "@aethelos/core";
import { votingWeight } from "@aethelos/core";

type Proposal = PoolState["proposals"][string];

/** Stake-weighted yes % from live voter map (matches reducer execution). */
export function stakeWeightedApprovalPercent(
  pool: PoolState,
  proposal: Proposal,
): number {
  let totalStake = 0n;
  let votesFor = 0n;
  for (const member of pool.members) {
    if (pool.frozen.includes(member)) continue;
    const weight = votingWeight(pool, member);
    totalStake += weight;
    if (proposal.voters?.[member]?.approve) votesFor += weight;
  }
  if (totalStake === 0n) return 0;
  return Number((votesFor * 100n) / totalStake);
}
