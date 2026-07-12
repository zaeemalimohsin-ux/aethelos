# AethelOS — Product overview

**Windows Early Access** — software community release (not general availability).

Community ledger and governance on your devices. No bank, no platform operator holding your keys.

## What this is

A local-first app for communities to hold value, make decisions together, and organise — with cryptographic identity and a shared, verifiable event log.

**Founders:** [Download the Windows app](https://github.com/zaeemalimohsin-ux/aethelos/releases/latest), start a community, and invite people from the Community tab. Invite links work globally — joiners open them in any browser. Keep your PC on while hosting; your temporary public address may change after a restart.

**Joiners:** Open the invite link someone sent you. No install required.

## What this is not

- Not private messaging — community history is verifiable by members
- Not regulated money or insured deposits — Points and stake are social coordination, not currency
- Not censorship-proof infrastructure — relays can drop traffic; use exports and multiple connection points

## Your responsibilities

1. **Save your 12-word recovery phrase** — see [USER_GUIDE.md](./USER_GUIDE.md) §2 (identity only; rejoin via invite or event log per [GET_STARTED.md](./GET_STARTED.md) § Need help?).
2. **Export your event log** periodically — see [USER_GUIDE.md](./USER_GUIDE.md) § Staying resilient.
3. **Vouch carefully** — you pledge real stake behind people you admit. After vouching, you (and other members) must **vote Approve** on the admission proposal in Proposals before the invitee can join.

## Quick start

See [GET_STARTED.md](./GET_STARTED.md) for founder vs joiner flows.

## Distribution

- **Windows (founders):** [GitHub Releases](https://github.com/zaeemalimohsin-ux/aethelos/releases/latest) (`.exe` / `.msi`)
- **Joiners:** Any mobile or desktop browser via invite link
- **Operators / self-hosters:** [PUBLISHER.md](./PUBLISHER.md)

Developers build from source; end users should not run `Build-Release.bat`.

## Hosting (for operators)

- Preferred: VPS with TLS and a permanent domain ([PUBLISHER.md](./PUBLISHER.md))
- Run `./scripts/publisher-preflight.sh https://your-domain` before sharing the link
- Ephemeral tunnel URLs are for demos, not long-term communities

## Operator checklist

1. Deploy with TLS and same-origin `/ws` ([PUBLISHER.md](./PUBLISHER.md), [`deploy/Caddyfile.example`](../deploy/Caddyfile.example)).
2. Founder: [GET_STARTED.md](./GET_STARTED.md) (create identity → start community → invite).
3. Preflight: [OPERATIONS.md](./OPERATIONS.md#hosted-nightly-preflight) and [PUBLISHER.md](./PUBLISHER.md#publisher-preflight-before-sharing-your-url).
4. Joiner: [GET_STARTED.md](./GET_STARTED.md) § Join a community.
5. Backups: [USER_GUIDE.md](./USER_GUIDE.md) § Staying resilient.

## Known limitations

Guest admission: see [GET_STARTED.md](./GET_STARTED.md) § Join a community.

- Offline actions queue until a connection point is reachable
- Each chapter holds up to **50 members**; **linked chapters** (federation) scale communities by depth
- Federation linking uses **signed chapter links** (Head-signed, like invites)

## Legal & privacy

- [Privacy](./PRIVACY.md)
- [Terms of use](./TERMS.md)

## Getting help

See [SUPPORT.md](./SUPPORT.md) — report issues on GitHub with your app version (Identity tab) and steps to reproduce.