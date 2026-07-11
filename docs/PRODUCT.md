# AethelOS — Product overview

Community ledger and governance on your devices. No bank, no platform operator holding your keys.

## What this is

A local-first app for communities to hold value, make decisions together, and organise — with cryptographic identity and a shared, verifiable event log.

**Fastest path:** open [app.aethelos.org](https://app.aethelos.org) in your browser. Optional [Windows installer](https://github.com/zaeemalimohsin-ux/aethelos/releases/latest) for desktop relay hosting.

## What this is not

- Not private messaging — community history is verifiable by members
- Not regulated money or insured deposits — Points and stake are social coordination, not currency
- Not censorship-proof infrastructure — relays can drop traffic; use exports and multiple connection points

## Your responsibilities

1. **Save your 12-word recovery phrase** — restores your identity only, not community membership by itself. Rejoin with your invite link or an event-log export from another device.
2. **Export your event log** periodically if you need disaster recovery without an invite link.
3. **Vouch carefully** — you pledge real stake behind people you admit. After vouching, you (and other members) must **vote Approve** on the admission proposal in Proposals before the invitee can join.

## Quick start

See [GET_STARTED.md](./GET_STARTED.md) for founder vs joiner flows.

## Distribution

- **Browser:** [app.aethelos.org](https://app.aethelos.org) — no install required for joiners.
- **Windows:** [GitHub Releases](https://github.com/zaeemalimohsin-ux/aethelos/releases/latest) (`.exe` / `.msi`). Unsigned builds may trigger SmartScreen — use **More info → Run anyway** until a signed pipeline ships.

Developers build from source; end users should not run `Build-Release.bat`.

## Hosting (for operators)

- Preferred: VPS with TLS and a permanent domain ([PUBLISHER.md](./PUBLISHER.md))
- Run `./scripts/publisher-preflight.sh https://your-domain` before sharing the link
- Ephemeral tunnel URLs are for demos, not long-term communities

## Operator checklist

1. Deploy with TLS and same-origin `/ws` ([PUBLISHER.md](./PUBLISHER.md), [`deploy/Caddyfile.example`](../deploy/Caddyfile.example)).
2. Founder: create identity → start community → **Invite people** → share link.
3. Run `node scripts/charter-a-preflight.mjs` against your hosted URL before go-live.
4. Joiner: open invite on phone browser → join code → wait for vouch + admission vote → accept.
5. Export event logs periodically from at least one device.

## Known limitations

Guest admission is four steps: (1) invitee shares join code, (2) inviter vouches, (3) community votes Approve in Proposals, (4) invitee taps Accept invitation. Vouch alone is not enough.

- Offline actions queue until a connection point is reachable
- Standard builds limit communities to **50 members**; linked chapters (federation) are advanced and off in the default production build
- Desktop Windows builds may trigger SmartScreen until Authenticode signing ships

## Legal & privacy

- [Privacy](./PRIVACY.md)
- [Terms of use](./TERMS.md)

## Getting help

See [SUPPORT.md](./SUPPORT.md) — report issues on GitHub with your app version (Identity tab) and steps to reproduce.
