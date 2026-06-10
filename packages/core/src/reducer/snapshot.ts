import type { SignedEvent } from "../schema/index.js";
import type { PoolState } from "./state.js";
import { createInitialState } from "./state.js";
import { reduceOneSync, applyEventsToState, type RejectedReduction } from "./index.js";
import { topologicalSort } from "../dag/index.js";
import { hashString } from "../crypto/index.js";

/**
 * A resumable reduction checkpoint. Because the Reducer is pure and deterministic,
 * we can snapshot the derived state after applying the first N canonically-ordered
 * events, then resume from it when more events arrive — as long as the ordered
 * prefix is unchanged. This avoids re-verifying signatures and re-running the
 * Reducer over the entire log on every update, which is the cost that does not
 * scale. If a late event reorders history, we transparently fall back to a full
 * replay, preserving correctness.
 */
export interface ReducerSnapshot {
  state: PoolState;
  appliedCount: number;
  prefixHash: string;
}

function prefixHash(ids: string[]): string {
  return hashString(ids.join("|"));
}

function fullReduce(
  namespaceId: string,
  ordered: SignedEvent[],
  rejected?: RejectedReduction[],
): PoolState {
  return applyEventsToState(createInitialState(namespaceId), ordered, rejected);
}

export function reduceWithSnapshot(
  namespaceId: string,
  events: SignedEvent[],
  prev?: ReducerSnapshot,
  rejected?: RejectedReduction[],
): ReducerSnapshot {
  const ordered = topologicalSort(events);
  const ids = ordered.map((e) => e.id);
  const fullHash = prefixHash(ids);

  if (prev && prev.appliedCount <= ordered.length) {
    const candidate = prefixHash(ids.slice(0, prev.appliedCount));
    if (candidate === prev.prefixHash) {
      // Ordered prefix is unchanged: resume from the snapshot.
      let state = prev.state;
      for (let i = prev.appliedCount; i < ordered.length; i++) {
        const result = reduceOneSync(state, ordered[i]!);
        if (result.ok) {
          state = result.state;
        } else if (rejected) {
          const event = ordered[i]!;
          rejected.push({
            eventId: event.id,
            reason: result.reason,
            author: event.author,
            eventType: event.payload.type,
          });
        }
      }
      return { state, appliedCount: ordered.length, prefixHash: fullHash };
    }
  }

  return {
    state: fullReduce(namespaceId, ordered, rejected),
    appliedCount: ordered.length,
    prefixHash: fullHash,
  };
}
