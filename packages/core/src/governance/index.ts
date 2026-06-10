import type { PublicKeyHex } from "../schema/index.js";
import type { Points } from "../schema/primitives.js";
import type { PoolState } from "../reducer/state.js";
import {
  createInitialState,
  isFrozen,
  isMember,
  resolveGovernanceParameter,
  stakeWeightNumber,
  votingWeight,
} from "../reducer/state.js";

export function canInitiateSuperstructureProposal(
  state: PoolState,
  author: PublicKeyHex,
): boolean {
  return state.head === author;
}

export function canCloseProposal(state: PoolState, author: PublicKeyHex): boolean {
  return state.head === author;
}

export function proposalApprovalPercent(votesFor: bigint, votesAgainst: bigint): number {
  const total = votesFor + votesAgainst;
  if (total === 0n) return 0;
  return Number((votesFor * 100n) / total);
}

export function hasProposalReachedThreshold(
  state: PoolState,
  proposalId: string,
): boolean {
  const proposal = state.proposals[proposalId];
  if (!proposal || proposal.closed || proposal.executed) return false;
  if (proposal.votesFor <= 0n) return false;

  const threshold = resolveGovernanceParameter(state, "approval_threshold");
  let totalStake = 0n;
  for (const member of state.members) {
    if (!state.frozen.includes(member)) {
      totalStake += votingWeight(state, member);
    }
  }
  if (totalStake <= 0n) return false;

  return Number((proposal.votesFor * 100n) / totalStake) >= threshold;
}

export function aggregateCellSliderForSuperstructure(
  state: PoolState,
  param: import("../schema/events.js").GovernanceParameter,
): number {
  const members = state.members.filter((m) => !isFrozen(state, m));
  if (members.length === 0) return state.parameters[param];

  let weightedSum = 0;
  let totalWeight = 0;
  for (const m of members) {
    const slider = state.governanceSliders[m]?.[param] ?? state.parameters[param];
    const weight = stakeWeightNumber(state, m);
    if (weight <= 0) continue;
    weightedSum += slider * weight;
    totalWeight += weight;
  }
  if (totalWeight <= 0) return state.parameters[param];
  return weightedSum / totalWeight;
}

const GOVERNANCE_PARAMS: import("../schema/events.js").GovernanceParameter[] = [
  "decay_rate",
  "approval_threshold",
  "vouch_threshold",
  "epoch_interval",
  "vouch_bond_rate",
];

/** Resolved governance parameters for this Pool (includes child relays on superstructures). */
export function resolvedGovernanceParameters(
  state: PoolState,
): Record<import("../schema/events.js").GovernanceParameter, number> {
  const out = {} as Record<import("../schema/events.js").GovernanceParameter, number>;
  for (const param of GOVERNANCE_PARAMS) {
    out[param] = resolveGovernanceParameter(state, param);
  }
  return out;
}

/** Share-weighted governance snapshot a Head relays upward to a parent Superstructure. */
export function relayGovernanceSnapshot(
  state: PoolState,
): Record<import("../schema/events.js").GovernanceParameter, number> {
  const out = {} as Record<import("../schema/events.js").GovernanceParameter, number>;
  for (const param of GOVERNANCE_PARAMS) {
    out[param] = aggregateCellSliderForSuperstructure(state, param);
  }
  return out;
}

export function cellPopulationWeight(state: PoolState): number {
  return state.members.length;
}

export function computeSuperstructureRedistribution(
  cellStates: PoolState[],
  totalPool: bigint,
): Map<string, bigint> {
  const totalPopulation = cellStates.reduce((sum, c) => sum + c.members.length, 0);
  if (totalPopulation === 0) return new Map();

  const allocations = new Map<string, bigint>();
  let distributed = 0n;

  for (let i = 0; i < cellStates.length; i++) {
    const cell = cellStates[i]!;
    const share =
      i === cellStates.length - 1
        ? totalPool - distributed
        : (totalPool * BigInt(cell.members.length)) / BigInt(totalPopulation);
    allocations.set(cell.namespaceId, share);
    distributed += share;
  }

  return allocations;
}

/** Route commons to linked child Cells by population weight; remainder stays unallocated. */
export function allocateCommonsToChildCells(
  state: PoolState,
  pool: Points,
): { state: PoolState; allocated: Points } {
  const childIds = state.childCells ?? [];
  if (pool <= 0n || childIds.length === 0) {
    return { state, allocated: 0n };
  }

  const cellStates = childIds.map((id) => {
    const pop = Math.max(1, state.childPopulation?.[id] ?? 1);
    return {
      ...createInitialState(id),
      members: Array.from({ length: pop }, (_, i) => `${id}:member:${i}`),
    } satisfies PoolState;
  });

  const allocations = computeSuperstructureRedistribution(cellStates, pool);
  const childCellEscrow = { ...(state.childCellEscrow ?? {}) };
  let allocated = 0n;

  for (const [id, amount] of allocations) {
    if (amount <= 0n) continue;
    childCellEscrow[id] = (childCellEscrow[id] ?? 0n) + amount;
    allocated += amount;
  }

  return {
    state: { ...state, childCellEscrow },
    allocated,
  };
}

export function canDisconnectFromSuperstructure(
  _state: PoolState,
  _superstructureId: string,
): boolean {
  return true;
}

export function memberVotingPower(state: PoolState, member: PublicKeyHex): bigint {
  return votingWeight(state, member);
}

export function isEligibleVoter(state: PoolState, member: PublicKeyHex): boolean {
  return isMember(state, member) && !state.frozen.includes(member);
}
