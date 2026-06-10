# Security Policy

## Reporting a vulnerability

Please report security issues privately. Do **not** open a public issue for
undisclosed vulnerabilities.

- Open a [GitHub security advisory](../../security/advisories/new), or
- Contact the maintainers through the channel listed in the repository profile.

We aim to acknowledge reports within a few days and to coordinate disclosure.

## Scope

- `@aethelos/core` — the deterministic engine, crypto, and wire validation.
- `@aethelos/client` — key handling, storage, and sync.
- `@aethelos/relay` — the powerless message relay.

## Threat model

See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) for what AethelOS defends
against and its deliberate non-goals.

## Good to know

- The relay is powerless: it cannot forge or alter state. Most "relay" reports
  reduce to availability, which is mitigated by running several relays.
- Keys never leave the device unencrypted. Losing your recovery phrase means
  losing the identity — by design, there is no custodian to recover it for you.
