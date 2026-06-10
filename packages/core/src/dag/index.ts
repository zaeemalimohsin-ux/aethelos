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
  const byId = new Map<string, SignedEvent>(events.map((e) => [e.id, e]));
  const applied = new Set<string>();
  const remaining = new Set<string>(events.map((e) => e.id));
  const result: SignedEvent[] = [];

  const isReady = (e: SignedEvent): boolean =>
    e.prevHash === null || !byId.has(e.prevHash) || applied.has(e.prevHash);

  while (result.length < events.length) {
    let pool = [...remaining].map((id) => byId.get(id)!).filter(isReady);
    // Fallback for cycles/orphans: consider everything remaining (still deterministic).
    if (pool.length === 0) pool = [...remaining].map((id) => byId.get(id)!);
    pool.sort(compareEvents);
    const next = pool[0]!;
    result.push(next);
    applied.add(next.id);
    remaining.delete(next.id);
  }
  return result;
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
