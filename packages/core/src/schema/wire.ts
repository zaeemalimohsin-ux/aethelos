import type { EventHash, NamespaceId, PublicKeyHex, WireVersion } from "./primitives.js";
import type { EventPayload } from "./events.js";

/** Unsigned event body — canonical form is hashed and signed. */
export interface UnsignedEvent {
  namespaceId: NamespaceId;
  prevHash: EventHash | null;
  lamport: number;
  author: PublicKeyHex;
  timestamp: number;
  payload: EventPayload;
}

/** Cryptographically signed event in the DAG. */
export interface SignedEvent extends UnsignedEvent {
  id: EventHash;
  signature: string;
}

/** Wire envelope broadcast through stateless Relays. */
export interface WireEnvelope {
  version: WireVersion;
  namespaceId: NamespaceId;
  event: SignedEvent;
}

/** Relay broadcast message types (stateless bulletin board). */
export type RelayMessage =
  | { type: "announce"; envelope: WireEnvelope }
  | { type: "request_sync"; namespaceId: NamespaceId; sinceHash?: EventHash }
  | { type: "sync_batch"; namespaceId: NamespaceId; events: SignedEvent[] }
  | { type: "ping" }
  | { type: "pong" };
