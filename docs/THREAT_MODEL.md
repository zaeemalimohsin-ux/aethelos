# AethelOS Threat Model

This document describes what AethelOS defends against, what it deliberately does
not, and where trust ultimately rests (with people and communities, not
infrastructure). Scope: community-trust coordination, not regulated financial
custody.

## Assets

- **Private keys** — the user's identity. Compromise = impersonation.
- **Event Log** — the append-only history that determines all state.
- **Derived Pool state** — balances, governance, membership.

## Trust boundaries

```mermaid
flowchart LR
  User -->|passphrase| Device[Device: keys + Event Log]
  Device <-->|signed events| Relay[Relay: powerless]
  Relay <--> Others[Other devices]
```

- The **device** is trusted to hold the user's key (encrypted at rest).
- The **relay** is explicitly untrusted. It only moves bytes.
- **Other participants** are semi-trusted; the protocol assumes some may be
  adversarial and relies on determinism + social resolution.

## Adversaries and mitigations

| Threat | Mitigation |
| --- | --- |
| Malicious/lying relay (forge, alter, inject state) | Every event is Ed25519-signed; Nodes verify signatures and re-derive state locally. Forged/altered events are rejected. |
| Relay censorship / outage | Multi-relay connections + automatic failover; durable offline outbox; relays are swappable with zero switching cost. |
| Malformed/oversized wire input (DoS, parser exploits) | Strict structural validation (`isValidRelayMessage`/`isValidWireEnvelope`), message size caps, per-connection rate limits, connection caps on the relay. |
| Double-spend via offline reorder | Deterministic causal (topological) ordering + Fracture detection; genuine impossible states freeze the offending key for social resolution. |
| Sybil / bot swarms | Super-linear, perpetual, decaying Vouch Bonds; redistribution limited to live, vouched souls. Farming fake identities is capital-destroying. |
| Key theft from disk | Keys encrypted with AES-GCM via PBKDF2 (210k iterations) from the user's passphrase; never stored in plaintext. |
| Lost device / passphrase | 12-word BIP39 recovery phrase deterministically regenerates the key on any device; encrypted identity export as a second path. |
| Supply-chain / dependency risk | Pinned, lockfile-frozen deps; `pnpm audit` in CI; audited `@noble` crypto; no third-party CDNs (everything self-hosted, so no remote script trust). |
| XSS / injection in the client | CSP (scripts from `'self'` only; `style-src` allows `'unsafe-inline'` for component CSS), `X-Content-Type-Options`, framing denied; React escaping; no `dangerouslySetInnerHTML`. |
| Capture of a single Node or Head | State lives across the community; participants carry Shares + Event Logs and reconstitute elsewhere. The bridge is a revocable role, not a single fixed key. |
| Malicious invite **shell URL** (wrong PWA origin) | Signed payload (namespace, relays) is verified on join; the **page origin** is only the client shell — founders must open the app from their share link first. See [GET_STARTED.md](./GET_STARTED.md). |
| Ephemeral desktop tunnel mailboxes | Desktop founders may publish `*.trycloudflare.com` URLs via cloudflared; treat as convenience, not long-term infrastructure. |
| Bridge / federation secondary sync | Same identity key may sync multiple linked namespaces via bridge mirror and federation readers — semi-trusted graph, not a new crypto trust root. |
| Client-side abuse / spam | **Relay-only** rate and size limits; client outbox is unbounded; social resolution (expulsion) remains the backstop. |

## Explicit non-goals

- **Confidentiality of the ledger.** Event Logs are shared for verification;
  AethelOS is transparent by design, not private. Do not put secrets in memos.
- **Regulatory/financial compliance (KYC/AML).** Out of scope; value is social.
- **Protection against a user who leaks their own recovery phrase.**
- **Global anti-spam at the relay layer beyond rate/size limits.** Spam is
  ultimately resolved socially (expulsion, vouch withdrawal).

## Cryptography

- Identity/signatures: Ed25519 (`@noble/ed25519`).
- Hashing / event IDs: SHA-256 over canonical serialization (`@noble/hashes`).
- Key-at-rest: AES-GCM 256, PBKDF2-SHA-256 (210k iterations).
- Recovery: BIP39 (`@scure/bip39`); seed stretched to the Ed25519 key via SHA-256.

## Reporting

See [SECURITY.md](../SECURITY.md).
