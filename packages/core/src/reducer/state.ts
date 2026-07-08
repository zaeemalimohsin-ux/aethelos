import type { GovernanceParameter, ProposalKind, PublicKeyHex } from "../schema/index.js";
import type { NamespaceId, Points } from "../schema/primitives.js";
import { POINTS_SCALE } from "../money/points.js";

export interface ProposalVoteRecord {
  approve: boolean;
  weight: Points;
}

export interface ProposalState {
  id: string;
  kind: ProposalKind;
  author: PublicKeyHex;
  data: Record<string, string>;
  votesFor: Points;
  votesAgainst: Points;
  /** One vote per member; changing vote replaces prior weight. */
  voters: Record<PublicKeyHex, ProposalVoteRecord>;
  closed: boolean;
  executed: boolean;
  /** Set when an approved bridge_transfer has been mirrored across the seam. */
  bridgeCompleted?: boolean;
}

/** Encumbrance on the inviter's own Share — points stay in balances, marked forfeitable. */
export interface VouchLien {
  inviter: PublicKeyHex;
  amount: Points;
}

/** @deprecated use VouchLien */
export type VouchBond = VouchLien;

export interface PoolState {
  namespaceId: NamespaceId;
  cellName: string;
  initialized: boolean;
  members: PublicKeyHex[];
  balances: Record<PublicKeyHex, Points>;
  frozen: PublicKeyHex[];
  vouchLiens: Record<PublicKeyHex, VouchLien>;
  inviters: Record<PublicKeyHex, PublicKeyHex>;
  head: PublicKeyHex | null;
  parameters: Record<GovernanceParameter, number>;
  /** Governance sliders: member -> parameter -> value (0-100) */
  governanceSliders: Record<PublicKeyHex, Partial<Record<GovernanceParameter, number>>>;
  /** Redistribution sliders: member -> target -> weight (0-100), equal-weight per soul */
  redistributionSliders: Record<PublicKeyHex, Record<PublicKeyHex, number>>;
  /** Vouch sliders: member -> target head candidate -> weight */
  vouchSliders: Record<PublicKeyHex, Record<PublicKeyHex, number>>;
  proposals: Record<string, ProposalState>;
  superstructureId: NamespaceId | null;
  parentSuperstructures: NamespaceId[];
  /** Child Cells registered by governance (fractal scale via depth, not width). */
  childCells: NamespaceId[];
  /** Last-known member counts for linked child Cells (population-weighted downstream routing). */
  childPopulation: Record<NamespaceId, number>;
  /** Commons allocated to child Cells, pending bridge delivery downward. */
  childCellEscrow: Record<NamespaceId, Points>;
  /** Share-weighted governance averages relayed upward from linked child Cells. */
  childSliderRelay: Record<NamespaceId, Partial<Record<GovernanceParameter, number>>>;
  /** Members registered in a parent namespace; may bridge inter-Superstructure transactions. Revocable. */
  bridges: PublicKeyHex[];
  epochNumber: number;
  totalSupply: Points;
  fractures: PublicKeyHex[];
  pendingInvites: Record<
    PublicKeyHex,
    {
      inviter: PublicKeyHex;
      lienAmount: Points;
      parameters: Record<GovernanceParameter, number>;
      /** Set when the admit_member proposal crosses the approval threshold. */
      admissionApproved?: boolean;
    }
  >;
  /** Total events applied (ordering / debug). */
  eventCount: number;
  /** @deprecated retained for snapshots; epochs are time-based. */
  eventsSinceEpoch: number;
  /** @deprecated use lastRedistributionTimestamp */
  lastEpochTimestamp: number;
  /** Wall-time ms when circulation last accrued to commons. */
  lastAccrualTimestamp: number;
  /** Wall-time ms when commons was last redistributed. */
  lastRedistributionTimestamp: number;
  /** Sub-point remainder for time-proportional accrual (numerator scale). */
  circulationCarry: Points;
  /** Genesis event timestamp; lower bound for valid event times. */
  genesisTimestamp: number;
  /** Highest event timestamp applied so far (forward-skew guard). */
  maxEventTimestamp: number;
  /** Per-member timestamp of their last authored action (drives liveness). */
  lastActiveTimestamp: Record<PublicKeyHex, number>;
  /** @deprecated use lastActiveTimestamp */
  lastActiveEvent: Record<PublicKeyHex, number>;
  /** Community mailbox URLs contributed by members (deduped, capped). */
  communityRelays: string[];
  /** Maps contributed mailbox URL to the member who published it. */
  communityRelayAuthors: Record<string, PublicKeyHex>;
  /** Recipient-less holding for decay that had no eligible souls; never credited to an agent. */
  commons: Points;
  /** Severed value earmarked upward to a parent Superstructure Pool on expulsion. */
  superstructureEscrow: Record<NamespaceId, Points>;
}

export const DEFAULT_PARAMETERS: Record<GovernanceParameter, number> = {
  // Annual circulation target (% of Share); per-epoch slice is derived at epoch close.
  decay_rate: 5,
  approval_threshold: 51,
  vouch_threshold: 51,
  // Minutes between redistribution flushes; accrual runs on every activity.
  epoch_interval: 60,
  vouch_bond_rate: 5,
};

/** Soft cap past which a Cell should spawn sub-cells; fractal scale comes from depth, not width. */
export const SOFT_CELL_CAP = 50;

export const MS_PER_DAY = 86_400_000;
export const MS_PER_MINUTE = 60_000;
export const MS_PER_YEAR = MS_PER_DAY * 365;

/** Max forward skew allowed beyond the log's highest timestamp (5 minutes). */
export const TIMESTAMP_FORWARD_SKEW_MS = 5 * 60 * 1000;

/** Minimum redistribution interval (minutes); philosophy floor is 15 minutes. */
export const MIN_EPOCH_INTERVAL_MINUTES = 15;

export function circulationIntervalMinutes(state: PoolState): number {
  const raw = resolveGovernanceParameter(state, "epoch_interval");
  const stepped =
    Math.round(raw / MIN_EPOCH_INTERVAL_MINUTES) * MIN_EPOCH_INTERVAL_MINUTES;
  return Math.max(MIN_EPOCH_INTERVAL_MINUTES, stepped);
}

/** @deprecated use circulationIntervalMinutes — returns fractional days, not minutes */
export function circulationIntervalDays(state: PoolState): number {
  return circulationIntervalMinutes(state) / (24 * 60);
}

export function circulationIntervalMs(state: PoolState): number {
  return circulationIntervalMinutes(state) * MS_PER_MINUTE;
}

/** When the next redistribution flush is due (display-only; applies on next activity). */
export function nextRedistributionAt(state: PoolState): number {
  if (state.lastRedistributionTimestamp <= 0) return 0;
  return state.lastRedistributionTimestamp + circulationIntervalMs(state);
}

/** @deprecated use nextRedistributionAt */
export function nextCirculationAt(state: PoolState): number {
  return nextRedistributionAt(state);
}

/** Format minutes as human-readable interval text. */
export function formatIntervalMinutes(minutes: number): string {
  const m = Math.max(MIN_EPOCH_INTERVAL_MINUTES, minutes);
  if (m < 1) {
    const sec = Math.round(m * 60);
    return `${sec} sec`;
  }
  const rounded = Math.round(m);
  if (rounded < 60) return `${rounded} min`;
  if (rounded % 1440 === 0) {
    const days = rounded / 1440;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  if (rounded % 60 === 0) {
    const hours = rounded / 60;
    return `${hours} hr`;
  }
  return `${rounded} min`;
}

export function createInitialState(namespaceId: NamespaceId): PoolState {
  return {
    namespaceId,
    cellName: "",
    initialized: false,
    members: [],
    balances: {},
    frozen: [],
    vouchLiens: {},
    inviters: {},
    head: null,
    parameters: { ...DEFAULT_PARAMETERS },
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
    circulationCarry: 0n,
    genesisTimestamp: 0,
    maxEventTimestamp: 0,
    lastActiveTimestamp: {},
    lastActiveEvent: {},
    communityRelays: [],
    communityRelayAuthors: {},
    commons: 0n,
    superstructureEscrow: {},
  };
}

export function getBalance(state: PoolState, member: PublicKeyHex): Points {
  return state.balances[member] ?? 0n;
}

export function isFrozen(state: PoolState, member: PublicKeyHex): boolean {
  return state.frozen.includes(member);
}

export function isMember(state: PoolState, member: PublicKeyHex): boolean {
  return state.members.includes(member);
}

export function totalPoolPoints(state: PoolState): Points {
  let total = 0n;
  for (const m of state.members) {
    total += getBalance(state, m);
  }
  total += state.commons ?? 0n;
  for (const escrowed of Object.values(state.superstructureEscrow ?? {})) {
    total += escrowed;
  }
  for (const escrowed of Object.values(state.childCellEscrow ?? {})) {
    total += escrowed;
  }
  return total;
}

/** Deterministic proposal id for admitting a pending invitee. */
export function admissionProposalId(invitee: PublicKeyHex): string {
  return `admit:${invitee}`;
}

/** Number of souls an inviter currently sustains via active Vouch Liens. */
export function countActiveVouches(state: PoolState, inviter: PublicKeyHex): number {
  return Object.values(state.vouchLiens).filter((l) => l.inviter === inviter).length;
}

/** Total lien encumbrance an inviter has pledged on their own Share. */
export function pledgedLienTotal(state: PoolState, inviter: PublicKeyHex): Points {
  let total = 0n;
  for (const lien of Object.values(state.vouchLiens)) {
    if (lien.inviter === inviter) total += lien.amount;
  }
  return total;
}

/** Share an inviter can still pledge without exceeding their balance. */
export function availableToPledge(state: PoolState, inviter: PublicKeyHex): Points {
  const balance = getBalance(state, inviter);
  const pledged = pledgedLienTotal(state, inviter);
  return balance > pledged ? balance - pledged : 0n;
}

/**
 * Required Vouch Lien for the inviter's next invite. The marginal lien scales with
 * the number of souls already sustained, so total pledged capital grows super-linearly
 * (quadratically). One human can only pledge up to 100% of themselves.
 */
export function requiredVouchLien(state: PoolState, inviter: PublicKeyHex): Points {
  const rate = BigInt(
    Math.max(0, Math.round(resolveGovernanceParameter(state, "vouch_bond_rate"))),
  );
  const base = (getBalance(state, inviter) * rate) / 100n;
  const existing = countActiveVouches(state, inviter);
  return base * BigInt(existing + 1);
}

/** @deprecated use requiredVouchLien */
export const requiredVouchBond = requiredVouchLien;

/** Liveness window in ms — same length as the circulation cycle. */
export function livenessWindowMs(state: PoolState): number {
  return circulationIntervalMs(state);
}

/** @deprecated use livenessWindowMs — legacy name; value is interval length in minutes */
export function livenessWindow(state: PoolState): number {
  return circulationIntervalMinutes(state);
}

/** A soul is live if it authored a signed event within the trailing time window. */
export function isLiveSoul(
  state: PoolState,
  member: PublicKeyHex,
  asOfTimestamp: number,
): boolean {
  const last = state.lastActiveTimestamp[member];
  if (last === undefined) return false;
  return asOfTimestamp - last <= livenessWindowMs(state);
}

/** Founders carry no inviter; invited souls must be sustained by an active incoming lien. */
export function isVouchedSoul(state: PoolState, member: PublicKeyHex): boolean {
  if (state.inviters[member] === undefined) return true;
  return state.vouchLiens[member] !== undefined;
}

/** Only live, vouched, unfrozen members draw the equal per-soul redistribution. */
export function isEligibleRecipient(
  state: PoolState,
  member: PublicKeyHex,
  asOfTimestamp: number,
): boolean {
  return (
    isMember(state, member) &&
    !isFrozen(state, member) &&
    isLiveSoul(state, member, asOfTimestamp) &&
    isVouchedSoul(state, member)
  );
}

export function isBridge(state: PoolState, member: PublicKeyHex): boolean {
  if ((state.bridges ?? []).includes(member)) return true;
  return (
    state.head === member &&
    (state.parentSuperstructures.length > 0 || (state.childCells ?? []).length > 0)
  );
}

export function sharePercent(state: PoolState, member: PublicKeyHex): number {
  const total = totalPoolPoints(state);
  if (total === 0n) return 0;
  const balance = getBalance(state, member);
  return Number((balance * 10000n) / total) / 100;
}

export function votingWeight(state: PoolState, member: PublicKeyHex): Points {
  if (!isMember(state, member) || isFrozen(state, member)) return 0n;
  return getBalance(state, member);
}

/** Stake as a human Point number for governance blending (scale-invariant). */
export function stakeWeightNumber(state: PoolState, member: PublicKeyHex): number {
  const weight = votingWeight(state, member);
  if (weight <= 0n) return 0;
  return Number(weight) / Number(POINTS_SCALE);
}

export function resolveGovernanceParameter(
  state: PoolState,
  param: GovernanceParameter,
): number {
  const members = state.members.filter((m) => !isFrozen(state, m));
  const childIds = state.childCells ?? [];

  let weightedSum = 0;
  let totalWeight = 0;

  for (const m of members) {
    const slider = state.governanceSliders[m]?.[param] ?? state.parameters[param];
    const weight = stakeWeightNumber(state, m);
    if (weight <= 0) continue;
    weightedSum += slider * weight;
    totalWeight += weight;
  }

  for (const childId of childIds) {
    const pop = Math.max(1, state.childPopulation?.[childId] ?? 1);
    const relayed = state.childSliderRelay?.[childId]?.[param] ?? state.parameters[param];
    weightedSum += relayed * pop;
    totalWeight += pop;
  }

  if (totalWeight <= 0) return state.parameters[param];
  return weightedSum / totalWeight;
}

export function resolveVouchHead(state: PoolState): PublicKeyHex | null {
  const members = state.members.filter((m) => !isFrozen(state, m));
  if (members.length === 0) return null;

  // Head election is Share-weighted: authority tracks current (decaying) stake,
  // consistent with proportional voting power. A voter cannot vouch for themselves.
  const scores = new Map<PublicKeyHex, number>();
  let totalShareWeight = 0;
  for (const voter of members) {
    const voterWeight = stakeWeightNumber(state, voter);
    totalShareWeight += voterWeight;
    const sliders = state.vouchSliders[voter] ?? {};
    for (const [target, weight] of Object.entries(sliders)) {
      if (target === voter) continue;
      scores.set(target, (scores.get(target) ?? 0) + weight * voterWeight);
    }
  }

  let best: PublicKeyHex | null = null;
  let bestScore = -1;
  for (const [target, score] of scores) {
    if (score > bestScore && isMember(state, target)) {
      best = target;
      bestScore = score;
    }
  }

  const threshold = resolveGovernanceParameter(state, "vouch_threshold");
  const maxPossible = totalShareWeight * 100;
  if (best && maxPossible > 0 && bestScore >= (threshold / 100) * maxPossible) {
    return best;
  }
  return state.head;
}

export function resolveRedistributionTargets(
  state: PoolState,
  asOfTimestamp: number,
): Record<PublicKeyHex, number> {
  // Each soul carries identical weight (one live, vouched human, one weight). Only
  // eligible souls may receive; bonds and abandoned/unvouched souls cannot be farmed.
  const voters = state.members.filter((m) => !isFrozen(state, m));
  const eligible = state.members.filter((m) =>
    isEligibleRecipient(state, m, asOfTimestamp),
  );
  if (eligible.length === 0) return {};
  const eligibleSet = new Set(eligible);

  const totals: Record<PublicKeyHex, number> = {};
  for (const m of eligible) totals[m] = 0;

  for (const voter of voters) {
    const sliders = state.redistributionSliders[voter] ?? {};
    const entries = Object.entries(sliders).filter(
      ([t, w]) => eligibleSet.has(t) && w > 0,
    );
    if (entries.length === 0) {
      if (eligibleSet.has(voter)) {
        totals[voter] = (totals[voter] ?? 0) + 1;
      } else {
        const spread = 1 / eligible.length;
        for (const e of eligible) totals[e] = (totals[e] ?? 0) + spread;
      }
      continue;
    }
    for (const [target, weight] of entries) {
      totals[target] = (totals[target] ?? 0) + weight;
    }
  }

  const sum = Object.values(totals).reduce((a, b) => a + b, 0);
  if (sum === 0) {
    const equal = 100 / eligible.length;
    const result: Record<PublicKeyHex, number> = {};
    for (const m of eligible) result[m] = equal;
    return result;
  }

  const result: Record<PublicKeyHex, number> = {};
  for (const [target, weight] of Object.entries(totals)) {
    result[target] = (weight / sum) * 100;
  }
  return result;
}
