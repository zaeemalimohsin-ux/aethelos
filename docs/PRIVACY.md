# Privacy notice

> Template for general availability. Have qualified counsel review before broad public marketing outside the software community.

**Last updated:** 2026-07-12  
**Applies to:** AethelOS client software (Windows desktop and browser), self-hosted deployments, and any future hosted instance at [app.aethelos.org](https://app.aethelos.org) when operated by maintainers.

## Hosted app (optional)

The canonical URL `https://app.aethelos.org` is **not live** as of v0.2.6. The primary distribution path is the [Windows installer](https://github.com/zaeemalimohsin-ux/aethelos/releases/latest): founders run the desktop app and share invite links globally (often via a temporary Cloudflare quick tunnel). When maintainers operate a hosted instance at `app.aethelos.org`, this notice applies to that instance as well.

Privacy questions: open a [GitHub issue](https://github.com/zaeemalimohsin-ux/aethelos/issues/new/choose) (label: privacy) or contact the address listed in the repository profile.

**Self-hosted operators** run their own infrastructure and are independent data controllers for their instance.

## What stays on your device

- Your **cryptographic identity** (encrypted with your passphrase)
- Your **12-word recovery phrase** (only if you write it down — never sent to us)
- A full copy of your community **event log** in browser storage (IndexedDB)
- A small **local analytics ring buffer** (up to ~50 funnel events such as `genesis_success`) used only for diagnostics — **not sent to any server**

You can export identity, event log, and diagnostics from the **Identity** tab.

## What is shared with your community

AethelOS is **transparent by design**, not private messaging:

- Display names and public keys
- Transfers, proposals, votes, and memos in the shared ledger
- Anything you write in a memo field

All members can verify the same history. Do not put secrets in memos.

## Linked chapters (federation)

When federation is enabled, a community may link to a parent or child chapter. Linked namespaces sync read-only governance and bridge events across the federation seam (member visibility, proposals mirrored to parent, bridge transfers). Transparency extends beyond a single community namespace — do not link chapters unless members understand cross-chapter visibility.

## What passes through relays

Connection points (relays) buffer and forward signed events between members. By default:

- Up to **10,000 events per community namespace**
- **24-hour retention** on the relay buffer (see [RELAY_OPERATORS.md](./RELAY_OPERATORS.md))

Relays do not hold your passphrase or forge events, but operators can see traffic metadata and buffered content.

## What we do not do

- No advertising or sale of personal data
- No third-party analytics SDK sending usage to our servers
- No custodial accounts — we cannot reset your recovery phrase

## Third-party services

The web client may load **Google Fonts** for typography. Fonts are requested from Google servers when you use the app in a browser.

**Cloudflare quick tunnels** (`*.trycloudflare.com`): when a Windows founder shares a public invite link, the desktop app may route joiner traffic through a temporary Cloudflare tunnel to the founder's machine. Joiner sync traffic (signed events, WebSocket metadata) may transit Cloudflare's network. Tunnels are ephemeral and session-bound to the founder's desktop session.

Self-hosting operators can remove Google Fonts and avoid quick tunnels by using a fixed hosted URL with same-origin `/ws` — see [PUBLISHER.md](./PUBLISHER.md).

## Your choices

| Action | Supported? |
|--------|------------|
| Export identity / event log | Yes (Identity tab) |
| Export diagnostics | Yes (manual JSON export) |
| Delete data on this device | **Browser:** lock session; clear site data in browser settings. **Windows desktop:** Identity → lock session; uninstall the app from Windows Settings to remove local storage |
| Erase community history | **No** — the ledger is immutable by design once events are shared |

## Changes

We may update this notice. Material changes will be noted in the app changelog and release notes.
