import type { Points } from "../schema/primitives.js";
import type { PublicKeyHex } from "../schema/index.js";
import type { PoolState } from "../reducer/state.js";
import {
  availableToPledge,
  getBalance,
  isFrozen,
  isMember,
  MIN_EPOCH_INTERVAL_MINUTES,
  MS_PER_DAY,
  MS_PER_YEAR,
  totalPoolPoints,
} from "../reducer/state.js";

/** Calendar days per reference year for annual circulation subdivision. */
export const DAYS_PER_YEAR = 365;

/** Derive per-cycle decay in basis points from annual circulation % and cycle length in days. */
export function derivePerEpochDecayBps(
  annualPercent: number,
  intervalDays: number,
): number {
  const days = Math.max(1, Math.round(intervalDays));
  return Math.round((annualPercent * 100 * days) / DAYS_PER_YEAR);
}

/** Derive per-redistribution-interval accrual in basis points (display only). */
export function deriveAccrualBpsOverInterval(
  annualPercent: number,
  intervalMinutes: number,
): number {
  const minutes = Math.max(MIN_EPOCH_INTERVAL_MINUTES, intervalMinutes);
  return Math.round((annualPercent * 100 * minutes) / (DAYS_PER_YEAR * 24 * 60));
}

/** Human-readable per-cycle percent (two decimals) from annual target and interval days. */
export function perEpochDecayPercent(
  annualPercent: number,
  intervalDays: number,
): number {
  return derivePerEpochDecayBps(annualPercent, intervalDays) / 100;
}

/** Expected accrual % over a redistribution interval (display only). */
export function accrualPercentOverInterval(
  annualPercent: number,
  intervalMinutes: number,
): number {
  return deriveAccrualBpsOverInterval(annualPercent, intervalMinutes) / 100;
}

/**
 * Time-proportional decay for one balance over elapsed ms with fixed-point carry.
 * decayPoints = (balance * annualBps * elapsedMs + carry) / (MS_PER_YEAR * 10000)
 */
export function computeAccruedDecay(
  balance: Points,
  annualPercent: number,
  elapsedMs: number,
  carry: Points,
): { decay: Points; newCarry: Points } {
  if (balance <= 0n || elapsedMs <= 0) return { decay: 0n, newCarry: carry };
  const annualBps = BigInt(Math.max(0, Math.round(annualPercent * 100)));
  const numerator = balance * annualBps * BigInt(elapsedMs) + carry;
  const denominator = BigInt(MS_PER_YEAR) * 10000n;
  const decay = numerator / denominator;
  const newCarry = numerator % denominator;
  const actualDecay = decay > balance ? balance : decay;
  return { decay: actualDecay, newCarry };
}

/** Accrue time-proportional decay from member balances into commons (recipient-less). */
export function accrueCirculation(
  state: PoolState,
  annualPercent: number,
  elapsedMs: number,
): { state: PoolState; accruedTotal: Points } {
  if (elapsedMs <= 0) return { state, accruedTotal: 0n };
  const members = state.members.filter((m) => !isFrozen(state, m)).sort();
  if (members.length === 0) return { state, accruedTotal: 0n };

  const annualBps = BigInt(Math.max(0, Math.round(annualPercent * 100)));
  const elapsed = BigInt(elapsedMs);
  const denominator = BigInt(MS_PER_YEAR) * 10000n;
  const carry = state.circulationCarry ?? 0n;

  type Entry = { member: PublicKeyHex; balance: Points; num: Points };
  const entries: Entry[] = [];
  let totalNumerator = carry;
  let totalBalance = 0n;

  for (const m of members) {
    const balance = getBalance(state, m);
    if (balance <= 0n) continue;
    const num = balance * annualBps * elapsed;
    entries.push({ member: m, balance, num });
    totalNumerator += num;
    totalBalance += balance;
  }

  if (entries.length === 0 || totalNumerator <= 0n) {
    return { state, accruedTotal: 0n };
  }

  let totalDecay = totalNumerator / denominator;
  if (totalDecay > totalBalance) totalDecay = totalBalance;
  const newCarry = totalNumerator - totalDecay * denominator;

  const decays = allocateProportionalDecay(totalDecay, entries, totalNumerator);
  const newBalances = { ...state.balances };
  let accruedTotal = 0n;
  for (const [member, decay] of decays) {
    if (decay <= 0n) continue;
    newBalances[member] = getBalance(state, member) - decay;
    accruedTotal += decay;
  }

  return {
    state: {
      ...state,
      balances: newBalances,
      commons: (state.commons ?? 0n) + accruedTotal,
      circulationCarry: newCarry,
    },
    accruedTotal,
  };
}

/** Split pooled decay across members by weight; reallocate when a member hits balance cap. */
function allocateProportionalDecay(
  totalDecay: Points,
  entries: { member: PublicKeyHex; balance: Points; num: Points }[],
  totalNumerator: Points,
): Map<PublicKeyHex, Points> {
  const result = new Map<PublicKeyHex, Points>();
  if (totalDecay <= 0n || totalNumerator <= 0n) return result;

  let remaining = totalDecay;
  let pool = entries.map((e) => ({ ...e }));

  while (remaining > 0n && pool.length > 0) {
    const weightSum = pool.reduce((sum, e) => sum + e.num, 0n);
    if (weightSum <= 0n) break;

    let distributed = 0n;
    const nextPool: typeof pool = [];

    for (let i = 0; i < pool.length; i++) {
      const e = pool[i]!;
      const allocated = result.get(e.member) ?? 0n;
      const headroom = e.balance - allocated;
      if (headroom <= 0n) continue;

      let share =
        i === pool.length - 1 ? remaining - distributed : (remaining * e.num) / weightSum;
      if (share > headroom) share = headroom;
      if (share > 0n) {
        result.set(e.member, allocated + share);
        distributed += share;
      }
      if (allocated + share < e.balance) {
        nextPool.push(e);
      }
    }

    if (distributed === 0n) break;
    remaining -= distributed;
    pool = nextPool;
  }

  return result;
}

/**
 * Decay is recipient-less circulation, not a tax: it removes Shares from holdings
 * and returns the total to the caller for equal redistribution. Liens ride inside
 * balances and decay implicitly — no separate escrow bucket.
 * Strict integer math guarantees no Points are created, destroyed, or lost to rounding.
 * @param decayRateBps Per-epoch rate in basis points (100 bps = 1%).
 */
export function applyDecay(
  state: PoolState,
  decayRateBps: number,
): { state: PoolState; decayedTotal: Points } {
  const members = state.members.filter((m) => !isFrozen(state, m));
  const rate = BigInt(Math.max(0, Math.round(decayRateBps)));

  const newBalances = { ...state.balances };
  let decayedTotal = 0n;

  for (const m of members) {
    const balance = getBalance(state, m);
    if (balance <= 0n) continue;
    const decay = (balance * rate) / 10000n;
    const actualDecay = decay > balance ? balance : decay;
    newBalances[m] = balance - actualDecay;
    decayedTotal += actualDecay;
  }

  return {
    state: { ...state, balances: newBalances },
    decayedTotal,
  };
}

export function distributeRedistribution(
  state: PoolState,
  pool: Points,
  targets: Record<PublicKeyHex, number>,
): PoolState {
  if (pool <= 0n) return state;
  const newBalances = { ...state.balances };
  const entries = Object.entries(targets).filter(([m]) => isMember(state, m));
  if (entries.length === 0) return state;

  let distributed = 0n;
  const allocations: [PublicKeyHex, Points][] = [];

  for (let i = 0; i < entries.length; i++) {
    const [member, percent] = entries[i]!;
    if (i === entries.length - 1) {
      allocations.push([member, pool - distributed]);
    } else {
      const share = (pool * BigInt(Math.round(percent * 100))) / 10000n;
      allocations.push([member, share]);
      distributed += share;
    }
  }

  for (const [member, amount] of allocations) {
    newBalances[member] = (newBalances[member] ?? 0n) + amount;
  }

  return { ...state, balances: newBalances };
}

export function transferPoints(
  state: PoolState,
  from: PublicKeyHex,
  to: PublicKeyHex,
  amount: Points,
): { state: PoolState; fracture: PublicKeyHex | null } {
  if (amount <= 0n) return { state, fracture: null };
  if (!isMember(state, from) || !isMember(state, to)) return { state, fracture: null };
  if (isFrozen(state, from)) return { state, fracture: null };

  const fromBalance = getBalance(state, from);
  if (fromBalance < amount) {
    return {
      state: {
        ...state,
        frozen: state.frozen.includes(from) ? state.frozen : [...state.frozen, from],
        fractures: state.fractures.includes(from)
          ? state.fractures
          : [...state.fractures, from],
      },
      fracture: from,
    };
  }

  const newBalances = { ...state.balances };
  newBalances[from] = fromBalance - amount;
  newBalances[to] = (newBalances[to] ?? 0n) + amount;

  return { state: { ...state, balances: newBalances }, fracture: null };
}

export function mintPoints(
  state: PoolState,
  to: PublicKeyHex,
  amount: Points,
): PoolState {
  const newBalances = { ...state.balances };
  newBalances[to] = (newBalances[to] ?? 0n) + amount;
  return {
    ...state,
    balances: newBalances,
    totalSupply: state.totalSupply + amount,
  };
}

/** Clear a pending or active lien (invite cancel/update). Nothing moves — liens never left the wallet. */
export function releaseVouchLien(state: PoolState, invitee: PublicKeyHex): PoolState {
  const lien = state.vouchLiens[invitee];
  if (!lien) return state;

  const { [invitee]: _, ...restLiens } = state.vouchLiens;
  const { [invitee]: __pending, ...restPending } = state.pendingInvites;

  return {
    ...state,
    vouchLiens: restLiens,
    pendingInvites: restPending,
  };
}

/** @deprecated use releaseVouchLien */
export const refundVouchBondToInviter = releaseVouchLien;

export function placeVouchLien(
  state: PoolState,
  inviter: PublicKeyHex,
  invitee: PublicKeyHex,
  amount: Points,
): { state: PoolState; ok: boolean; reason?: string } {
  if (amount <= 0n) return { state, ok: false, reason: "invalid_lien_amount" };
  if (amount > availableToPledge(state, inviter)) {
    return { state, ok: false, reason: "lien_exceeds_self" };
  }

  return {
    state: {
      ...state,
      vouchLiens: {
        ...state.vouchLiens,
        [invitee]: { inviter, amount },
      },
    },
    ok: true,
  };
}

/** @deprecated use placeVouchLien */
export function lockVouchBond(
  state: PoolState,
  inviter: PublicKeyHex,
  invitee: PublicKeyHex,
  amount: Points,
): { state: PoolState; ok: boolean } {
  const result = placeVouchLien(state, inviter, invitee, amount);
  return { state: result.state, ok: result.ok };
}

/**
 * Forfeit a lien on expulsion: subtract min(lien, inviter balance) from the inviter
 * and return the forfeited amount for upward routing or local redistribution.
 */
export function forfeitVouchLien(
  state: PoolState,
  invitee: PublicKeyHex,
): { state: PoolState; forfeited: Points } {
  const lien = state.vouchLiens[invitee];
  if (!lien) return { state, forfeited: 0n };

  const inviterBalance = getBalance(state, lien.inviter);
  const forfeited = lien.amount > inviterBalance ? inviterBalance : lien.amount;
  const { [invitee]: _, ...restLiens } = state.vouchLiens;

  const newBalances = { ...state.balances };
  if (forfeited > 0n) {
    newBalances[lien.inviter] = inviterBalance - forfeited;
  }

  return {
    state: { ...state, vouchLiens: restLiens, balances: newBalances },
    forfeited,
  };
}

/** @deprecated use forfeitVouchLien */
export function releaseVouchBondToPool(
  state: PoolState,
  invitee: PublicKeyHex,
): PoolState {
  const { state: s, forfeited } = forfeitVouchLien(state, invitee);
  if (forfeited <= 0n) return s;
  const targets = Object.fromEntries(
    state.members.map((m) => [m, 100 / state.members.length]),
  );
  return distributeRedistribution(s, forfeited, targets);
}

export { totalPoolPoints };
