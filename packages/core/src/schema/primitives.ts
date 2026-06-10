/** Frozen wire protocol version. Bump only with explicit migration. */
export const WIRE_VERSION = 1 as const;

export type WireVersion = typeof WIRE_VERSION;

/** Canonical public key: 32-byte Ed25519 key as lowercase hex (64 chars). */
export type PublicKeyHex = string;

/** Canonical event hash: SHA-256 of canonical unsigned payload, lowercase hex. */
export type EventHash = string;

/** Namespace identifier for a Cell or Superstructure pool. */
export type NamespaceId = string;

/** Points are fixed-point bigint integers (scale 10^9); never use JS floats for amounts. */
export type Points = bigint;

/** Share percentage for UI display (0–100 scale, derived from Points). */
export type SharePercent = number;
