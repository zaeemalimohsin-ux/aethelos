# Versioning & Wire Compatibility

AethelOS is a distributed system with no central coordinator. Nodes built at
different times must interoperate or fail safely. This document defines how we
version the product and, critically, the wire protocol.

## Semantic versioning (packages)

All packages share a synchronized version (`0.x` during pre-1.0). We follow
[SemVer](https://semver.org/):

- **MAJOR** — breaking API or wire changes that require migration.
- **MINOR** — backward-compatible features.
- **PATCH** — backward-compatible fixes.

## Wire protocol version

The wire format is the contract between Nodes and Relays. It is pinned by
`WIRE_VERSION` in
[packages/core/src/schema/primitives.ts](../packages/core/src/schema/primitives.ts).

Rules:

1. Every `WireEnvelope` carries its `version`.
2. A Node MUST ignore envelopes whose `version` it does not understand, rather
   than crash or apply them blindly.
3. `WIRE_VERSION` is bumped **only** when the canonical event-serialization,
   signature scheme, or envelope shape changes — anything that would alter event
   hashes or signature verification.
4. Because event IDs are content hashes of the canonical payload, a wire change
   that alters serialization is inherently breaking and requires a MAJOR bump.

## Additive event types

New signed event types may be added in a **minor** release when they are
wire-compatible: existing Nodes ignore unknown payloads during validation until
they upgrade, and the Reducer treats missing state fields with safe defaults.

| Event | Version | Notes |
|-------|---------|-------|
| `relay_contribute` | 0.x | Members publish community mailbox URLs (`ws://` / `wss://`); capped list on Pool state. Replaces prior URLs from the same author. |
| `relay_revoke` | 0.x | Author removes a mailbox URL they previously published. |

## Migration policy

When a breaking wire change is unavoidable:

1. Introduce the new `WIRE_VERSION` alongside the old one for a deprecation
   window. Nodes accept both, emit the new.
2. Provide a deterministic, one-time migration that re-derives state from the
   existing Event Log under the new rules (the Reducer is pure, so this is a
   replay).
3. Document the cutover in `CHANGELOG.md` and the release notes.
4. Never silently change serialization without a version bump — it would fork
   every community's history.

## Release process

1. Land changes on `main` via PR with green CI.
2. Update `CHANGELOG.md`.
3. Tag `vX.Y.Z`; CI builds and (for desktop) signs artifacts.
