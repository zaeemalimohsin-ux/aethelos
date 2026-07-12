# AethelOS v0.2.6.2 Release Notes

Welcome to **AethelOS v0.2.6.2** — world-ship readiness patch: fixes stale invite relays after desktop restart, adds support runbooks, WebKit CI, installer rename, and in-app tunnel disclosure.

**Windows Early Access** — software community release (not general availability).

## Download

- [GitHub Releases — latest](https://github.com/zaeemalimohsin-ux/aethelos/releases/latest)
- Verify downloads with `checksums.txt` on the release page.

Installers are named `AethelOS_0.2.6.2_x64-setup.exe` / `.msi` (bundle semver remains `0.2.6`; Identity tab shows `0.2.6.2`).

## What's new in v0.2.6.2

### Founder ops (P0 fix)

- **Fresh invite relays after restart** — when your temporary public address changes, signed invite links now include the matching connection point instead of a stale tunnel URL from before restart.

### Support and docs

- **SUPPORT.md** — SmartScreen / unsigned installer, tunnel troubleshooting, upgrade steps, version mismatch FAQ.
- **GET_STARTED.md** — upgrading, growing past 50 members, mobile joiner tips.

### In-app UX

- Plain-language notice that invite links use a temporary Cloudflare tunnel that changes on restart.
- **Member limit reached** — invite button disabled at capacity with guidance to spawn a linked chapter.

### Engineering

- WebKit (iPhone 13) share-url project on merge CI.
- Sidecar SHA-256 verified on cache hit; checksum manifest gate on merge CI.
- Published installer filenames include full npm patch version.

## Upgrading from v0.2.6.1

Run the new installer **over** your existing install (do not uninstall). Confirm **Identity → App version** shows `0.2.6.2`. Send **fresh invite links** after upgrading if you had shared links before a restart.

## Known limitations (EA)

- Installers are not Authenticode-signed (SmartScreen warning).
- `app.aethelos.org` is not live; HF Space demo may be paused.
- Founders must keep PC on; tunnel URL is ephemeral.
- GA / broad consumer marketing not approved — see [ENGINEERING_SIGNOFF.md](docs/ENGINEERING_SIGNOFF.md).

See [CHANGELOG.md](CHANGELOG.md) for full history.
