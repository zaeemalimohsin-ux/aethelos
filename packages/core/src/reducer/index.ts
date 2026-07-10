import type { SignedEvent } from "../schema/index.js";
import type { PoolState } from "./state.js";
import {
  createInitialState,
  admissionProposalId,
  circulationIntervalMs,
  DEFAULT_PARAMETERS,
  isBridge,
  isFrozen,
  isMember,
  requiredVouchLien,
  resolveGovernanceParameter,
  resolveRedistributionTargets,
  resolveVouchHead,
  SOFT_CELL_CAP,
  TIMESTAMP_FORWARD_SKEW_MS,
  MIN_EPOCH_INTERVAL_MINUTES,
  votingWeight,
  getBalance,
} from "./state.js";
import type { EventPayload, EventType, GovernanceParameter } from "../schema/events.js";
import { isValidRelayUrl } from "../schema/validate.js";
import {
  accrueCirculation,
  distributeRedistribution,
  mintPoints,
  placeVouchLien,
  releaseVouchLien,
  transferPoints,
} from "../economy/index.js";
import {
  allocateCommonsToChildCells,
  canInitiateSuperstructureProposal,
} from "../governance/index.js";
import { parsePointsAmount, tryParsePointsAmount } from "../money/points.js";
import { topologicalSort, verifyEventSync } from "../dag/index.js";

export type ReduceResult =
  | { ok: true; state: PoolState }
  | { ok: false; reason: string; state: PoolState };

/** A signed event the reducer refused to apply (for sync diagnostics). */
export interface RejectedReduction {
  eventId: string;
  reason: string;
  author: string;
  eventType: string;
}

const GOVERNANCE_PARAMS: GovernanceParameter[] = [
  "decay_rate",
  "approval_threshold",
  "vouch_threshold",
  "epoch_interval",
  "vouch_bond_rate",
];

function withRefreshedParameters(state: PoolState): PoolState {
  const parameters = { ...state.parameters };
  for (const param of GOVERNANCE_PARAMS) {
    parameters[param] = resolveGovernanceParameter(state, param);
  }
  return { ...state, parameters };
}

function applyOrderedEvents(
  state: PoolState,
  ordered: SignedEvent[],
  rejected?: RejectedReduction[],
): PoolState {
  for (const event of ordered) {
    const result = reduceOneSync(state, event);
    if (result.ok) {
      state = result.state;
    } else if (rejected) {
      rejected.push({
        eventId: event.id,
        reason: result.reason,
        author: event.author,
        eventType: event.payload.type,
      });
    }
  }
  return state;
}

export function reduceEvents(
  namespaceId: string,
  events: SignedEvent[],
  rejected?: RejectedReduction[],
): PoolState {
  const ordered = topologicalSort(events);
  return applyOrderedEvents(createInitialState(namespaceId), ordered, rejected);
}

/** Like reduceEvents, but returns every rejected event with its reason. */
export function reduceEventsWithAudit(
  namespaceId: string,
  events: SignedEvent[],
): { state: PoolState; rejected: RejectedReduction[] } {
  const ordered = topologicalSort(events);
  const rejected: RejectedReduction[] = [];
  const state = applyOrderedEvents(createInitialState(namespaceId), ordered, rejected);
  return { state, rejected };
}

/** @internal incremental replay helper */
export function applyEventsToState(
  state: PoolState,
  ordered: SignedEvent[],
  rejected?: RejectedReduction[],
): PoolState {
  return applyOrderedEvents(state, ordered, rejected);
}

export function reduceOneSync(state: PoolState, event: SignedEvent): ReduceResult {
  if (event.namespaceId !== state.namespaceId) {
    return { ok: false, reason: "namespace_mismatch", state };
  }

  if (!verifyEventSync(event)) {
    return { ok: false, reason: "invalid_signature", state };
  }

  if (isFrozen(state, event.author)) {
    return { ok: false, reason: "author_frozen", state };
  }

  if (state.initialized) {
    if (event.timestamp < state.genesisTimestamp) {
      return { ok: false, reason: "timestamp_before_genesis", state };
    }
    const maxForward = state.maxEventTimestamp + TIMESTAMP_FORWARD_SKEW_MS;
    if (event.timestamp > maxForward) {
      return { ok: false, reason: "timestamp_too_far_future", state };
    }
  }

  const result = applyEvent(state, event);
  if (!result.ok) return result;

  const nextCount = result.state.eventCount + 1;
  let s: PoolState = {
    ...result.state,
    eventCount: nextCount,
    maxEventTimestamp: Math.max(result.state.maxEventTimestamp, event.timestamp),
    lastActiveTimestamp: {
      ...result.state.lastActiveTimestamp,
      [event.author]: event.timestamp,
    },
    lastActiveEvent: { ...result.state.lastActiveEvent, [event.author]: nextCount },
  };
  s = maybeAccrueCirculation(s, event.timestamp);
  s = maybeRedistribute(s, event.timestamp);
  return { ok: true, state: s };
}

/** @deprecated Epochs are time-based; kept for tests documenting old event-count model. */
export function countsTowardEpoch(type: EventType): boolean {
  switch (type) {
    case "slider_update":
    case "vouch_update":
    case "proposal_create":
    case "proposal_vote":
    case "proposal_close":
    case "epoch_close":
    case "expel":
    case "join_superstructure":
    case "leave_superstructure":
    case "relay_cell_governance":
    case "relay_contribute":
    case "relay_revoke":
    case "freeze_resolve":
      return false;
    default:
      return true;
  }
}

/** Safety cap on redistribution catch-up loops per event (DoS guard). */
const MAX_REDISTRIBUTION_CATCHUP = 10_000;

/** Accrue time-proportional decay to commons on every signed activity. */
function maybeAccrueCirculation(state: PoolState, eventTimestamp: number): PoolState {
  if (state.lastAccrualTimestamp <= 0) return state;
  const rawElapsed = eventTimestamp - state.lastAccrualTimestamp;
  const elapsedMs = Math.min(rawElapsed, TIMESTAMP_FORWARD_SKEW_MS);
  if (elapsedMs <= 0) return state;
  const annualPercent = resolveGovernanceParameter(state, "decay_rate");
  const { state: after } = accrueCirculation(state, annualPercent, elapsedMs);
  return { ...after, lastAccrualTimestamp: eventTimestamp };
}

/** Flush commons via redistribution when the community interval elapses. */
function maybeRedistribute(state: PoolState, eventTimestamp: number): PoolState {
  if (state.lastRedistributionTimestamp <= 0) return state;
  const intervalMs = circulationIntervalMs(state);
  let s = state;
  let cycles = 0;
  while (
    eventTimestamp - s.lastRedistributionTimestamp >= intervalMs &&
    cycles < MAX_REDISTRIBUTION_CATCHUP
  ) {
    s = runRedistributionCycle(s, eventTimestamp);
    const nextTs = s.lastRedistributionTimestamp + intervalMs;
    s = {
      ...s,
      lastRedistributionTimestamp: nextTs,
      lastEpochTimestamp: nextTs,
    };
    cycles += 1;
  }
  return s;
}

/** Redistribute accumulated commons; does not accrue decay. */
export function runRedistributionCycle(
  state: PoolState,
  asOfTimestamp: number,
): PoolState {
  const pool = state.commons ?? 0n;
  let s: PoolState = { ...state, commons: 0n };

  if (pool <= 0n) {
    return { ...s, epochNumber: s.epochNumber + 1, eventsSinceEpoch: 0 };
  }

  const childIds = s.childCells ?? [];
  if (childIds.length > 0) {
    const { state: afterChild, allocated } = allocateCommonsToChildCells(s, pool);
    s = afterChild;
    const remainder = pool - allocated;
    if (remainder > 0n) {
      s = { ...s, commons: remainder };
    }
  } else {
    const targets = resolveRedistributionTargets(state, asOfTimestamp);
    if (Object.keys(targets).length === 0) {
      s = { ...s, commons: pool };
    } else {
      s = distributeRedistribution(s, pool, targets);
    }
  }

  return { ...s, epochNumber: s.epochNumber + 1, eventsSinceEpoch: 0 };
}

/** @deprecated use runRedistributionCycle; accrual is separate from redistribution. */
export function runEpoch(state: PoolState, asOfTimestamp: number): PoolState {
  return runRedistributionCycle(state, asOfTimestamp);
}

export async function reduceOne(
  state: PoolState,
  event: SignedEvent,
): Promise<ReduceResult> {
  return reduceOneSync(state, event);
}

function clampSliderValue(
  param: import("../schema/events.js").GovernanceParameter | "redistribution",
  value: number,
): number {
  if (Number.isNaN(value)) return 0;

  if (param === "decay_rate") {
    const d = Math.round(value * 10) / 10;
    return Math.max(0, Math.min(20, d));
  }
  const v = Math.round(value);
  if (param === "epoch_interval") {
    const stepped =
      Math.round(value / MIN_EPOCH_INTERVAL_MINUTES) * MIN_EPOCH_INTERVAL_MINUTES;
    return Math.max(MIN_EPOCH_INTERVAL_MINUTES, Math.min(10_080, stepped));
  }
  if (param === "redistribution") return Math.max(0, Math.min(100, v));
  return Math.max(0, Math.min(100, v));
}

function parseParentParameters(
  raw: string | undefined,
): Record<GovernanceParameter, number> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<GovernanceParameter, number>>;
    return {
      decay_rate: parsed.decay_rate ?? DEFAULT_PARAMETERS.decay_rate,
      approval_threshold:
        parsed.approval_threshold ?? DEFAULT_PARAMETERS.approval_threshold,
      vouch_threshold: parsed.vouch_threshold ?? DEFAULT_PARAMETERS.vouch_threshold,
      epoch_interval: parsed.epoch_interval ?? DEFAULT_PARAMETERS.epoch_interval,
      vouch_bond_rate: parsed.vouch_bond_rate ?? DEFAULT_PARAMETERS.vouch_bond_rate,
    };
  } catch {
    return undefined;
  }
}

function applyJoinSuperstructure(
  state: PoolState,
  bridgeMember: string,
  superstructureId: string,
  parentParameters?: Record<GovernanceParameter, number>,
): PoolState {
  if (superstructureId.length === 0) return state;
  let s: PoolState = {
    ...state,
    parentSuperstructures: state.parentSuperstructures.includes(superstructureId)
      ? state.parentSuperstructures
      : [...state.parentSuperstructures, superstructureId],
    superstructureId: state.superstructureId ?? superstructureId,
    bridges: state.bridges.includes(bridgeMember)
      ? state.bridges
      : [...state.bridges, bridgeMember],
  };
  if (parentParameters) {
    s = {
      ...s,
      parameters: { ...parentParameters },
      governanceSliders: Object.fromEntries(
        s.members.map((m) => [m, { ...parentParameters }]),
      ),
    };
  }
  return s;
}

function validateBridgeProposal(
  state: PoolState,
  superstructureId: string,
  localProposalId: string,
  to: string,
  amount: bigint,
): boolean {
  const proposal = state.proposals[localProposalId];
  if (!proposal || proposal.kind !== "bridge_transfer") return false;
  if (!proposal.executed || proposal.bridgeCompleted) return false;
  const remoteId = proposal.data["target"];
  const proposalTo = proposal.data["to"];
  const proposalAmount = proposal.data["amount"];
  if (!remoteId || !proposalTo || !proposalAmount) return false;
  if (remoteId !== superstructureId || proposalTo !== to) return false;
  try {
    const parsed = tryParsePointsAmount(proposalAmount);
    return parsed !== null && parsed === amount;
  } catch {
    return false;
  }
}

function markBridgeProposalCompleted(
  state: PoolState,
  localProposalId: string,
): PoolState {
  const proposal = state.proposals[localProposalId];
  if (!proposal) return state;
  return {
    ...state,
    proposals: {
      ...state.proposals,
      [localProposalId]: { ...proposal, bridgeCompleted: true },
    },
  };
}

function applyLeaveSuperstructure(state: PoolState, superstructureId: string): PoolState {
  const parents = state.parentSuperstructures.filter((id) => id !== superstructureId);
  return {
    ...state,
    parentSuperstructures: parents,
    superstructureId: parents.length === 0 ? null : state.superstructureId,
    bridges: parents.length === 0 ? [] : state.bridges,
  };
}

function applyEvent(state: PoolState, event: SignedEvent): ReduceResult {
  const payload = event.payload;

  switch (payload.type) {
    case "genesis": {
      if (state.initialized) {
        return { ok: false, reason: "already_initialized", state };
      }
      let initial: bigint;
      try {
        initial = parsePointsAmount(payload.initialPoints);
      } catch {
        return { ok: false, reason: "invalid_initial_points", state };
      }
      const author = event.author;
      let s: PoolState = {
        ...state,
        initialized: true,
        cellName: payload.cellName,
        members: [author],
        parameters: { ...DEFAULT_PARAMETERS, ...(payload.parameters || {}) },
        governanceSliders: {
          [author]: { ...DEFAULT_PARAMETERS, ...(payload.parameters || {}) },
        },
        redistributionSliders: { [author]: { [author]: 100 } },
        vouchSliders: { [author]: {} },
      };
      s = mintPoints(s, author, initial);
      s = {
        ...s,
        head: author,
        lastEpochTimestamp: event.timestamp,
        lastAccrualTimestamp: event.timestamp,
        lastRedistributionTimestamp: event.timestamp,
        circulationCarry: 0n,
        genesisTimestamp: event.timestamp,
        maxEventTimestamp: event.timestamp,
        lastActiveTimestamp: { [author]: event.timestamp },
      };
      return { ok: true, state: s };
    }

    case "invite": {
      if (!isMember(state, event.author)) {
        return { ok: false, reason: "not_member", state };
      }
      if (state.members.length >= SOFT_CELL_CAP) {
        return { ok: false, reason: "cell_cap_reached", state };
      }
      if (isMember(state, payload.invitee)) {
        return { ok: false, reason: "already_member", state };
      }

      let s = state;
      const existingLien = s.vouchLiens[payload.invitee];
      const existingPending = s.pendingInvites[payload.invitee];
      if (existingLien || existingPending) {
        const priorInviter = existingLien?.inviter ?? existingPending?.inviter;
        if (priorInviter !== event.author) {
          return { ok: false, reason: "invite_pending", state };
        }
        s = releaseVouchLien(s, payload.invitee);
        const proposalId = admissionProposalId(payload.invitee);
        const existingProposal = s.proposals[proposalId];
        if (existingProposal && !existingProposal.closed) {
          s = {
            ...s,
            proposals: {
              ...s.proposals,
              [proposalId]: { ...existingProposal, closed: true },
            },
          };
        }
      }

      const lienAmount = requiredVouchLien(s, event.author);
      if (lienAmount <= 0n) {
        return { ok: false, reason: "invalid_lien_amount", state: s };
      }
      const placed = placeVouchLien(s, event.author, payload.invitee, lienAmount);
      if (!placed.ok) {
        return {
          ok: false,
          reason: placed.reason ?? "lien_exceeds_self",
          state: s,
        };
      }

      const proposalId = admissionProposalId(payload.invitee);
      const proposals = { ...placed.state.proposals };
      if (!proposals[proposalId] || proposals[proposalId]!.closed) {
        proposals[proposalId] = {
          id: proposalId,
          kind: "admit_member",
          author: event.author,
          data: { target: payload.invitee },
          votesFor: 0n,
          votesAgainst: 0n,
          voters: {},
          closed: false,
          executed: false,
        };
      }

      return {
        ok: true,
        state: {
          ...placed.state,
          proposals,
          pendingInvites: {
            ...placed.state.pendingInvites,
            [payload.invitee]: {
              inviter: event.author,
              lienAmount,
              parameters: { ...DEFAULT_PARAMETERS, ...(payload.parameters || {}) },
              admissionApproved: false,
            },
          },
        },
      };
    }

    case "cancel_invite": {
      if (!isMember(state, event.author)) {
        return { ok: false, reason: "not_member", state };
      }
      const pending = state.pendingInvites[payload.invitee];
      if (!pending || pending.inviter !== event.author) {
        return { ok: false, reason: "no_pending_invite", state };
      }
      if (isMember(state, payload.invitee)) {
        return { ok: false, reason: "already_member", state };
      }
      let s = releaseVouchLien(state, payload.invitee);
      const proposalId = admissionProposalId(payload.invitee);
      const proposal = s.proposals[proposalId];
      if (proposal && !proposal.closed) {
        s = {
          ...s,
          proposals: {
            ...s.proposals,
            [proposalId]: { ...proposal, closed: true },
          },
        };
      }
      return { ok: true, state: s };
    }

    case "accept_invite": {
      if (isMember(state, event.author)) {
        return { ok: false, reason: "already_member", state };
      }
      if (state.members.length >= SOFT_CELL_CAP) {
        return { ok: false, reason: "cell_cap_reached", state };
      }
      const invite = state.pendingInvites[event.author];
      if (!invite || invite.inviter !== payload.inviter) {
        return { ok: false, reason: "no_pending_invite", state };
      }
      if (!invite.admissionApproved) {
        return { ok: false, reason: "admission_not_approved", state };
      }
      const { [event.author]: _, ...restInvites } = state.pendingInvites;
      let s: PoolState = {
        ...state,
        pendingInvites: restInvites,
        members: [...state.members, event.author],
        inviters: { ...state.inviters, [event.author]: payload.inviter },
        governanceSliders: {
          ...state.governanceSliders,
          [event.author]: { ...invite.parameters },
        },
        redistributionSliders: {
          ...state.redistributionSliders,
          [event.author]: { [event.author]: 50 },
        },
        vouchSliders: {
          ...state.vouchSliders,
          [event.author]: { [payload.inviter]: 100 },
        },
      };
      s = { ...s, head: resolveVouchHead(s) };
      return { ok: true, state: s };
    }

    case "transaction": {
      let amount: bigint;
      try {
        amount = parsePointsAmount(payload.amount);
      } catch {
        return { ok: false, reason: "invalid_amount", state };
      }
      if (!isMember(state, payload.to)) {
        return { ok: false, reason: "recipient_not_member", state };
      }
      const { state: newState, fracture } = transferPoints(
        state,
        event.author,
        payload.to,
        amount,
      );
      if (fracture) {
        return { ok: true, state: newState };
      }
      return { ok: true, state: newState };
    }

    case "epoch_close": {
      // Retired: Epochs now close deterministically from log progress (see maybeRedistribute).
      // Kept as an idempotent no-op for wire back-compat; cannot be used to force decay.
      return { ok: true, state };
    }

    case "slider_update": {
      if (!isMember(state, event.author)) {
        return { ok: false, reason: "not_member", state };
      }
      const clamped = clampSliderValue(payload.parameter, payload.value);
      if (payload.parameter === "redistribution") {
        if (!payload.target) return { ok: false, reason: "missing_target", state };
        const sliders = {
          ...state.redistributionSliders,
          [event.author]: {
            ...(state.redistributionSliders[event.author] ?? {}),
            [payload.target]: clamped,
          },
        };
        return { ok: true, state: { ...state, redistributionSliders: sliders } };
      }
      const gov = {
        ...state.governanceSliders,
        [event.author]: {
          ...(state.governanceSliders[event.author] ?? {}),
          [payload.parameter]: clamped,
        },
      };
      const newParams = { ...state.parameters };
      newParams[payload.parameter] = resolveGovernanceParameter(
        { ...state, governanceSliders: gov },
        payload.parameter,
      );
      return {
        ok: true,
        state: { ...state, governanceSliders: gov, parameters: newParams },
      };
    }

    case "vouch_update": {
      if (!isMember(state, event.author)) {
        return { ok: false, reason: "not_member", state };
      }
      if (payload.target === event.author) {
        return { ok: false, reason: "self_vouch_forbidden", state };
      }
      const vouch = {
        ...state.vouchSliders,
        [event.author]: {
          ...(state.vouchSliders[event.author] ?? {}),
          [payload.target]: Math.max(0, Math.min(100, Math.round(payload.weight))),
        },
      };
      const s = {
        ...state,
        vouchSliders: vouch,
        head: resolveVouchHead({ ...state, vouchSliders: vouch }),
      };
      return { ok: true, state: s };
    }

    case "expel": {
      // Retired: expulsion requires an executed expel_member proposal.
      return { ok: false, reason: "use_proposal", state };
    }

    case "proposal_create": {
      if (!isMember(state, event.author)) {
        return { ok: false, reason: "not_member", state };
      }
      if (
        (payload.kind === "join_superstructure" ||
          payload.kind === "leave_superstructure") &&
        !canInitiateSuperstructureProposal(state, event.author)
      ) {
        // Any unfrozen member may initiate join/leave; only non-members are barred.
        return { ok: false, reason: "not_eligible_member", state };
      }
      if (payload.kind === "bridge_transfer") {
        const remoteId = payload.data["target"];
        const to = payload.data["to"];
        const amountRaw = payload.data["amount"];
        if (!remoteId || !to || !amountRaw) {
          return { ok: false, reason: "invalid_bridge_proposal", state };
        }
        const parsed = tryParsePointsAmount(amountRaw);
        if (parsed === null) {
          return { ok: false, reason: "invalid_amount", state };
        }
        const linked =
          state.parentSuperstructures.includes(remoteId) ||
          (state.childCells ?? []).includes(remoteId);
        if (!linked) {
          return { ok: false, reason: "unknown_superstructure", state };
        }
      }
      return {
        ok: true,
        state: {
          ...state,
          proposals: {
            ...state.proposals,
            [payload.proposalId]: {
              id: payload.proposalId,
              kind: payload.kind,
              author: event.author,
              data: payload.data,
              votesFor: 0n,
              votesAgainst: 0n,
              voters: {},
              closed: false,
              executed: false,
            },
          },
        },
      };
    }

    case "proposal_vote": {
      const proposal = state.proposals[payload.proposalId];
      if (!proposal || proposal.closed) {
        return { ok: false, reason: "proposal_not_open", state };
      }
      if (!isMember(state, event.author) || isFrozen(state, event.author)) {
        return { ok: false, reason: "not_eligible_voter", state };
      }

      const weight = state.balances[event.author] ?? 0n;
      const voters = proposal.voters ?? {};
      const prior = voters[event.author];
      let votesFor = proposal.votesFor;
      let votesAgainst = proposal.votesAgainst;
      if (prior) {
        if (prior.approve) votesFor -= prior.weight;
        else votesAgainst -= prior.weight;
      }
      if (payload.approve) votesFor += weight;
      else votesAgainst += weight;

      const updated = {
        ...proposal,
        votesFor,
        votesAgainst,
        voters: {
          ...voters,
          [event.author]: { approve: payload.approve, weight },
        },
      };
      let s: PoolState = {
        ...state,
        proposals: { ...state.proposals, [payload.proposalId]: updated },
      };
      s = tryExecuteProposal(s, payload.proposalId);
      return { ok: true, state: s };
    }

    case "proposal_close": {
      const proposal = state.proposals[payload.proposalId];
      if (!proposal || proposal.closed) {
        return { ok: false, reason: "proposal_not_open", state };
      }
      if (state.head !== event.author) {
        return { ok: false, reason: "head_only", state };
      }
      return {
        ok: true,
        state: {
          ...state,
          proposals: {
            ...state.proposals,
            [payload.proposalId]: { ...proposal, closed: true },
          },
        },
      };
    }

    case "join_superstructure": {
      return { ok: false, reason: "use_proposal", state };
    }

    case "leave_superstructure": {
      return { ok: false, reason: "use_proposal", state };
    }

    case "relay_cell_governance": {
      const cellId = payload.cellId;
      // Population is self-reported by the child's bridge. Reducer enforces only that
      // it is a finite positive integer; the client FederationReader cross-checks the
      // relayed count against the synced child membership and surfaces any mismatch
      // (see docs/THREAT_MODEL.md — population attestation residual).
      const pop = Number.isFinite(payload.population)
        ? Math.max(1, Math.round(payload.population))
        : 1;

      if ((state.childCells ?? []).includes(cellId)) {
        if (!isBridge(state, event.author)) {
          return { ok: false, reason: "not_bridge", state };
        }
        const updated: PoolState = {
          ...state,
          childSliderRelay: {
            ...(state.childSliderRelay ?? {}),
            [cellId]: { ...payload.parameters },
          },
          childPopulation: {
            ...(state.childPopulation ?? {}),
            [cellId]: pop,
          },
        };
        return { ok: true, state: withRefreshedParameters(updated) };
      }

      if (cellId === state.namespaceId) {
        if (state.head !== event.author) {
          return { ok: false, reason: "head_only", state };
        }
        return { ok: true, state };
      }

      return { ok: false, reason: "unknown_cell", state };
    }

    case "bridge_transaction": {
      // Any dual-registered member holding the (revocable) bridge role may bridge,
      // not only the Head — capture of a single key cannot compromise the seam.
      if (!isBridge(state, event.author)) {
        return { ok: false, reason: "not_bridge", state };
      }
      let amount: bigint;
      try {
        amount = parsePointsAmount(payload.amount);
      } catch {
        return { ok: false, reason: "invalid_amount", state };
      }

      const remoteId = payload.superstructureId;

      // Inbound delivery to a local member. Linked namespaces still require a local
      // executed bridge_transfer proposal — unpaired mirror credit must not mint.
      if (isMember(state, payload.to)) {
        const linkedInbound =
          state.parentSuperstructures.includes(remoteId) ||
          (state.childCells ?? []).includes(remoteId);
        if (
          !validateBridgeProposal(
            state,
            remoteId,
            payload.localProposalId,
            payload.to,
            amount,
          )
        ) {
          return { ok: false, reason: "bridge_not_approved", state };
        }
        if (linkedInbound) {
          const newBalances = { ...state.balances };
          newBalances[payload.to] = getBalance(state, payload.to) + amount;
          return {
            ok: true,
            state: markBridgeProposalCompleted(
              {
                ...state,
                balances: newBalances,
                totalSupply: state.totalSupply + amount,
              },
              payload.localProposalId,
            ),
          };
        }
        const { state: newState, fracture } = transferPoints(
          state,
          event.author,
          payload.to,
          amount,
        );
        if (fracture) {
          return { ok: false, reason: "insufficient_balance", state };
        }
        return {
          ok: true,
          state: markBridgeProposalCompleted(newState, payload.localProposalId),
        };
      }

      // Outbound upward: release severed value held for a parent Superstructure.
      if (state.parentSuperstructures.includes(remoteId)) {
        if (
          !validateBridgeProposal(
            state,
            remoteId,
            payload.localProposalId,
            payload.to,
            amount,
          )
        ) {
          return { ok: false, reason: "bridge_not_approved", state };
        }
        const escrow = state.superstructureEscrow[remoteId] ?? 0n;
        if (escrow < amount) {
          return { ok: false, reason: "insufficient_escrow", state };
        }
        return {
          ok: true,
          state: markBridgeProposalCompleted(
            {
              ...state,
              superstructureEscrow: {
                ...state.superstructureEscrow,
                [remoteId]: escrow - amount,
              },
            },
            payload.localProposalId,
          ),
        };
      }

      // Outbound downward: release population-weighted allocation to a linked child Cell.
      if ((state.childCells ?? []).includes(remoteId)) {
        if (
          !validateBridgeProposal(
            state,
            remoteId,
            payload.localProposalId,
            payload.to,
            amount,
          )
        ) {
          return { ok: false, reason: "bridge_not_approved", state };
        }
        const escrow = state.childCellEscrow?.[remoteId] ?? 0n;
        if (escrow < amount) {
          return { ok: false, reason: "insufficient_escrow", state };
        }
        return {
          ok: true,
          state: markBridgeProposalCompleted(
            {
              ...state,
              childCellEscrow: {
                ...(state.childCellEscrow ?? {}),
                [remoteId]: escrow - amount,
              },
            },
            payload.localProposalId,
          ),
        };
      }

      return { ok: false, reason: "unknown_superstructure", state };
    }

    case "relay_contribute": {
      if (!isMember(state, event.author) || isFrozen(state, event.author)) {
        return { ok: false, reason: "not_member", state };
      }
      const url = payload.url.trim();
      if (!isValidRelayUrl(url)) {
        return { ok: false, reason: "invalid_relay_url", state };
      }
      const authors = { ...(state.communityRelayAuthors ?? {}) };
      const relays = (state.communityRelays ?? []).filter(
        (existing) => authors[existing] !== event.author,
      );
      for (const existing of Object.keys(authors)) {
        if (authors[existing] === event.author) {
          delete authors[existing];
        }
      }
      if (relays.includes(url)) {
        return {
          ok: true,
          state: { ...state, communityRelays: relays, communityRelayAuthors: authors },
        };
      }
      const MAX_COMMUNITY_RELAYS = 8;
      if (relays.length >= MAX_COMMUNITY_RELAYS) {
        return { ok: false, reason: "relay_cap_reached", state };
      }
      return {
        ok: true,
        state: {
          ...state,
          communityRelays: [...relays, url],
          communityRelayAuthors: { ...authors, [url]: event.author },
        },
      };
    }

    case "relay_revoke": {
      if (!isMember(state, event.author) || isFrozen(state, event.author)) {
        return { ok: false, reason: "not_member", state };
      }
      const url = payload.url.trim();
      if (!isValidRelayUrl(url)) {
        return { ok: false, reason: "invalid_relay_url", state };
      }
      const authors = state.communityRelayAuthors ?? {};
      if (authors[url] !== event.author) {
        return { ok: false, reason: "not_author", state };
      }
      const { [url]: _removed, ...restAuthors } = authors;
      return {
        ok: true,
        state: {
          ...state,
          communityRelays: (state.communityRelays ?? []).filter((u) => u !== url),
          communityRelayAuthors: restAuthors,
        },
      };
    }

    case "freeze_resolve": {
      return { ok: false, reason: "use_proposal", state };
    }

    default:
      return { ok: false, reason: "unknown_event", state };
  }
}

function expelMemberReducer(state: PoolState, target: string): PoolState {
  if (!isMember(state, target)) return state;

  let severed = state.balances[target] ?? 0n;
  const lien = state.vouchLiens[target];
  let inviterBalance = lien ? (state.balances[lien.inviter] ?? 0n) : 0n;
  if (lien) {
    const forfeited = lien.amount > inviterBalance ? inviterBalance : lien.amount;
    severed += forfeited;
    if (forfeited > 0n) {
      inviterBalance -= forfeited;
    }
  }

  const { [target]: _b, ...restBalances } = state.balances;
  const balances =
    lien && inviterBalance !== (state.balances[lien.inviter] ?? 0n)
      ? { ...restBalances, [lien.inviter]: inviterBalance }
      : restBalances;
  const { [target]: _v, ...restLiens } = state.vouchLiens;
  const { [target]: _i, ...restInviters } = state.inviters;
  const { [target]: _la, ...restActive } = state.lastActiveTimestamp;
  const { [target]: _laEv, ...restActiveEv } = state.lastActiveEvent;

  // Sliders "disappear when they leave" (philosophy §2): drop the departing soul's
  // own rows and every column pointing at them, so no stale per-member relationship
  // survives and state does not grow unbounded across churn.
  const pruneRow = <T>(rec: Record<string, T>): Record<string, T> => {
    const { [target]: _drop, ...rest } = rec;
    return rest;
  };
  const pruneColumns = <T>(
    rec: Record<string, Record<string, T>>,
  ): Record<string, Record<string, T>> => {
    const out: Record<string, Record<string, T>> = {};
    for (const [owner, inner] of Object.entries(rec)) {
      if (owner === target) continue;
      const { [target]: _dropCol, ...restInner } = inner;
      out[owner] = restInner;
    }
    return out;
  };

  let s: PoolState = {
    ...state,
    members: state.members.filter((m) => m !== target),
    balances,
    vouchLiens: restLiens,
    inviters: restInviters,
    lastActiveTimestamp: restActive,
    lastActiveEvent: restActiveEv,
    governanceSliders: pruneRow(state.governanceSliders),
    redistributionSliders: pruneColumns(state.redistributionSliders),
    vouchSliders: pruneColumns(state.vouchSliders),
    bridges: state.bridges.filter((b) => b !== target),
    frozen: state.frozen.filter((f) => f !== target),
    fractures: state.fractures.filter((f) => f !== target),
  };

  if (severed > 0n) {
    const parents = s.parentSuperstructures;
    if (parents.length > 0) {
      // Forfeit escrows to this Cell's direct parent Superstructure (the highest Pool
      // this namespace can name). Escalation to the true highest-level Pool happens
      // hop-by-hop: each parent releases upward via an approved bridge_transfer, so a
      // C->B->A chain carries the forfeit to the root through successive bridging.
      const directParent = parents[parents.length - 1]!;
      s = {
        ...s,
        superstructureEscrow: {
          ...s.superstructureEscrow,
          [directParent]: (s.superstructureEscrow[directParent] ?? 0n) + severed,
        },
      };
    } else {
      const remaining = s.members;
      if (remaining.length > 0) {
        const equal = 100 / remaining.length;
        const targets = Object.fromEntries(remaining.map((m) => [m, equal]));
        s = distributeRedistribution(s, severed, targets);
      } else {
        s = { ...s, commons: (s.commons ?? 0n) + severed };
      }
    }
  }

  if (s.head === target) {
    s = { ...s, head: resolveVouchHead(s) };
  }

  return s;
}

function tryExecuteProposal(state: PoolState, proposalId: string): PoolState {
  const proposal = state.proposals[proposalId];
  if (!proposal || proposal.closed || proposal.executed) return state;

  const threshold = resolveGovernanceParameter(state, "approval_threshold");

  let totalStake = 0n;
  let currentVotesFor = 0n;
  let currentVotesAgainst = 0n;

  for (const member of state.members) {
    if (!state.frozen.includes(member)) {
      const weight = votingWeight(state, member);
      totalStake += weight;

      const vote = proposal.voters?.[member];
      if (vote) {
        if (vote.approve) currentVotesFor += weight;
        else currentVotesAgainst += weight;
      }
    }
  }

  if (totalStake <= 0n) return state;

  const approvalPercent = Number((currentVotesFor * 100n) / totalStake);
  if (approvalPercent < threshold) return state;

  let s = state;
  switch (proposal.kind) {
    case "admit_member": {
      const target = proposal.data["target"];
      if (target && s.pendingInvites[target]) {
        s = {
          ...s,
          pendingInvites: {
            ...s.pendingInvites,
            [target]: {
              ...s.pendingInvites[target]!,
              admissionApproved: true,
            },
          },
        };
      }
      break;
    }
    case "expel_member": {
      const target = proposal.data["target"];
      if (target) s = expelMemberReducer(s, target);
      break;
    }
    case "resolve_fracture": {
      const target = proposal.data["target"];
      if (target) {
        s = {
          ...s,
          frozen: s.frozen.filter((f) => f !== target),
          fractures: s.fractures.filter((f) => f !== target),
        };
      }
      break;
    }
    case "join_superstructure": {
      const superstructureId = proposal.data["target"];
      const parentParameters = parseParentParameters(proposal.data["parameters"]);
      if (superstructureId && proposal.author) {
        s = applyJoinSuperstructure(
          s,
          proposal.author,
          superstructureId,
          parentParameters,
        );
      }
      break;
    }
    case "leave_superstructure": {
      const superstructureId = proposal.data["target"];
      if (superstructureId) s = applyLeaveSuperstructure(s, superstructureId);
      break;
    }
    case "link_subcell": {
      const childId = proposal.data["target"];
      const existing = s.childCells ?? [];
      if (childId && childId !== s.namespaceId && !existing.includes(childId)) {
        const popRaw = proposal.data["population"];
        const population = popRaw ? Math.max(1, parseInt(popRaw, 10) || 1) : 1;
        const bridgeKey = proposal.data["bridge"];
        s = {
          ...s,
          childCells: [...existing, childId],
          childPopulation: { ...(s.childPopulation ?? {}), [childId]: population },
          bridges:
            bridgeKey && !s.bridges.includes(bridgeKey)
              ? [...s.bridges, bridgeKey]
              : s.bridges,
        };
      }
      break;
    }
    case "bridge_transfer": {
      const remoteId = proposal.data["target"];
      const to = proposal.data["to"];
      const amountRaw = proposal.data["amount"];
      if (!remoteId || !to || !amountRaw) break;
      const amount = tryParsePointsAmount(amountRaw);
      if (amount === null) break;
      const linked =
        s.parentSuperstructures.includes(remoteId) ||
        (s.childCells ?? []).includes(remoteId);
      if (!linked) break;
      break;
    }
  }

  return {
    ...s,
    proposals: {
      ...s.proposals,
      [proposalId]: { ...proposal, executed: true, closed: true },
    },
  };
}

export { createInitialState, type PoolState } from "./state.js";
