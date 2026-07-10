# AethelOS — Vouch Pilot (beta)

**Status:** Early beta for trusted pilots — not general availability.

## What this is

Community ledger and governance on your devices. No bank, no platform operator holding your keys.

## What this is not

- Not private messaging (history is verifiable by members)
- Not regulated money or insured deposits
- Not censorship-proof infrastructure (relays can drop traffic; use exports and multiple connection points)

## Your responsibilities

1. **Save your 12-word recovery phrase** — restores your identity only, not community membership by itself. Rejoin with your invite link or an event-log export from another device.
2. **Export your event log** periodically if you need disaster recovery without an invite link
3. **Vouch carefully** — you pledge real stake behind people you admit. After vouching, you (and other members) must **vote Approve** on the admission proposal in Proposals before the invitee can join.

## Quick start

See [GET_STARTED.md](./GET_STARTED.md) for founder vs joiner flows.

## Distribution for pilots

Windows friends install from [GitHub Releases](https://github.com/zaeemalimohsin-ux/aethelos/releases/latest) — not `Build-Release.bat` (developer-only).

## Hosting (for operators)

- Preferred: VPS with TLS and a permanent domain ([PUBLISHER.md](./PUBLISHER.md))
- Run `./scripts/publisher-preflight.sh https://your-domain` before sharing the link (see PUBLISHER.md)
- Ephemeral tunnel URLs are for demos, not long-term communities

## Operator checklist (pilot cohort)

1. Install from [GitHub Releases](https://github.com/zaeemalimohsin-ux/aethelos/releases/latest) (Windows `.exe` / `.msi`).
2. Founder: create identity → start community → **Invite people** → share link.
3. Run `node scripts/charter-a-preflight.mjs` against your hosted URL when `AETHELOS_URL` is set (optional smoke).
4. Joiner: open invite on phone browser → join code → wait for vouch + admission vote → accept.
5. Export event logs periodically from at least one device.

Pilot scope: federation / linked chapters are **off** unless the build sets `VITE_ENABLE_FEDERATION=1` (developer/E2E only).

## Getting help

Report issues with: what you did, what you expected, **build v0.2.0** (installer filename or Identity tab), and screenshots if possible.

## Known limitations (beta)

Guest admission is four steps: (1) invitee shares join code, (2) inviter vouches, (3) community votes Approve in Proposals, (4) invitee taps Accept invitation. Vouch alone is not enough.

- Offline actions queue until a connection point is reachable
- Federation and linked chapters are advanced / rough edges
- Desktop Windows builds may trigger SmartScreen until signed release pipeline is complete