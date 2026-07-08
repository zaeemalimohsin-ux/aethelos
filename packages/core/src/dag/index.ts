import type { EventHash, SignedEvent, UnsignedEvent } from "../schema/index.js";
import {
  canonicalJson,
  hashHex,
  signMessage,
  verifySignatureSync,
} from "../crypto/index.js";
import { utf8ToBytes } from "@noble/hashes/utils";

export function canonicalUnsignedEvent(event: UnsignedEvent): string {
  return canonicalJson({
    namespaceId: event.namespaceId,
    prevHash: event.prevHash,
    lamport: event.lamport,
    author: event.author,
    timestamp: event.timestamp,
    payload: event.payload,
  });
}

export function hashEvent(event: UnsignedEvent): EventHash {
  return hashHex(utf8ToBytes(canonicalUnsignedEvent(event)));
}

export async function signEvent(
  event: UnsignedEvent,
  privateKey: Uint8Array,
): Promise<SignedEvent> {
  const id = hashEvent(event);
  const message = utf8ToBytes(canonicalUnsignedEvent(event));
  const signatureBytes = await signMessage(privateKey, message);
  const { bytesToHex } = await import("@noble/hashes/utils");
  return {
    ...event,
    id,
    signature: bytesToHex(signatureBytes),
  };
}

export async function verifyEvent(event: SignedEvent): Promise<boolean> {
  return verifyEventSync(event);
}

export function verifyEventSync(event: SignedEvent): boolean {
  const expectedId = hashEvent(event);
  if (event.id !== expectedId) return false;
  const message = utf8ToBytes(canonicalUnsignedEvent(event));
  return verifySignatureSync(event.author, message, event.signature);
}

export function compareEvents(a: SignedEvent, b: SignedEvent): number {
  if (a.lamport !== b.lamport) return a.lamport - b.lamport;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

export function sortEvents(events: SignedEvent[]): SignedEvent[] {
  return [...events].sort(compareEvents);
}

/**
 * Deterministic causal ordering: an event is never applied before the event it
 * references via prevHash. This guarantees a spend that causally follows its funding
 * credit is applied after it, so honest receive-then-spend cannot manufacture a false
 * Fracture. Ties break by (Lamport, hash) so every Node produces identical order.
 */
export function topologicalSort(events: SignedEvent[]): SignedEvent[] {
  // O(N log N) Kahn's algorithm-style topological sort.
  // Sort all events by Lamport first to guarantee deterministic tie-breaking.
  const sorted = [...events].sort(compareEvents);
  
  const byId = new Map<string, SignedEvent>();
  const children = new Map<string, SignedEvent[]>();
  const inDegree = new Map<string, number>();

  for (const e of sorted) {
    byId.set(e.id, e);
    inDegree.set(e.id, 0);
  }

  for (const e of sorted) {
    if (e.prevHash === null) {
      inDegree.set(e.id, 0);
      continue;
    }
    if (byId.has(e.prevHash)) {
      inDegree.set(e.id, 1);
      const list = children.get(e.prevHash) || [];
      list.push(e);
      children.set(e.prevHash, list);
      continue;
    }
    // Missing parent: hold aside (never ready) so partial logs do not reorder.
    inDegree.set(e.id, -1);
  }

  // We maintain the ready pool. Sort descending so we can pop() from the end in O(1).
  let ready = sorted.filter((e) => inDegree.get(e.id) === 0).sort((a, b) => compareEvents(b, a));
  const result: SignedEvent[] = [];

  while (ready.length > 0) {
    const next = ready.pop()!;
    result.push(next);

    const dependents = children.get(next.id) || [];
    let newlyReady = false;
    for (const dep of dependents) {
      const deg = inDegree.get(dep.id)! - 1;
      inDegree.set(dep.id, deg);
      if (deg === 0) {
        ready.push(dep);
        newlyReady = true;
      }
    }
    // Only re-sort when new items are introduced to maintain descending order
    if (newlyReady) {
      ready.sort((a, b) => compareEvents(b, a));
    }
  }

  // Hold cycles/orphans aside. They become ready only after a later merge
  // brings missing parents into the set (or never, for true cycles).
  return result;
}

/**
 * True when every event's prevHash is either null or present in `events`.
 * Used for import / backup validation — incomplete causal closures must not land.
 */
export function isCausalClosure(events: SignedEvent[]): boolean {
  if (events.length === 0) return true;
  const ids = new Set(events.map((e) => e.id));
  for (const e of events) {
    if (e.prevHash !== null && !ids.has(e.prevHash)) return false;
  }
  return true;
}

/**
 * Keep only events reachable from roots (null prevHash or parents outside the
 * candidate set that are supplied in `known`). Orphans and cycles are dropped.
 */
export function filterCausalClosure(
  candidates: SignedEvent[],
  known: SignedEvent[] = [],
): { accepted: SignedEvent[]; rejected: SignedEvent[] } {
  const byId = new Map<string, SignedEvent>();
  for (const e of known) byId.set(e.id, e);
  for (const e of candidates) byId.set(e.id, e);

  const knownIds = new Set(known.map((e) => e.id));
  const acceptedIds = new Set<string>(knownIds);
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of candidates) {
      if (acceptedIds.has(e.id)) continue;
      if (e.prevHash === null || acceptedIds.has(e.prevHash)) {
        acceptedIds.add(e.id);
        grew = true;
      }
    }
  }

  const accepted: SignedEvent[] = [];
  const rejected: SignedEvent[] = [];
  for (const e of candidates) {
    if (acceptedIds.has(e.id) && !knownIds.has(e.id)) accepted.push(e);
    else if (!acceptedIds.has(e.id)) rejected.push(e);
  }
  return { accepted, rejected };
}

export function mergeEventLogs(
  local: SignedEvent[],
  remote: SignedEvent[],
): SignedEvent[] {
  const byId = new Map<string, SignedEvent>();
  for (const e of [...local, ...remote]) {
    byId.set(e.id, e);
  }
  return sortEvents([...byId.values()]);
}

export function nextLamport(
  localMax: number,
  remoteMax: number,
  authorEvents: number,
): number {
  return Math.max(localMax, remoteMax, authorEvents) + 1;
}

export function maxLamport(events: SignedEvent[]): number {
  if (events.length === 0) return 0;
  return events.reduce((max, e) => Math.max(max, e.lamport), 0);
}

export function findEventByHash(
  events: SignedEvent[],
  hash: EventHash | null,
): SignedEvent | undefined {
  if (hash === null) return undefined;
  return events.find((e) => e.id === hash);
}

export function validateCausalChain(event: SignedEvent, known: SignedEvent[]): boolean {
  if (event.prevHash === null) return true;
  return known.some((e) => e.id === event.prevHash);
}
