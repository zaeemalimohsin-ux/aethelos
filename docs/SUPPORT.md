# Getting support

**Windows Early Access** — software community release (not general availability). See [RELEASE-NOTES.md](../RELEASE-NOTES.md) for version history.

## Report a bug or request a feature

**[Open an issue on GitHub](https://github.com/zaeemalimohsin-ux/aethelos/issues/new/choose)** (bug report or feature request templates).

### What to include

1. **App version** — Identity tab → App version (e.g. `0.2.6.2 / wire 1`)
2. **Platform** — browser + OS, or Windows installer filename
3. **Steps to reproduce** — what you did, what you expected, what happened
4. **Screenshots** — if UI-related
5. **Diagnostics** (optional) — Identity → Export diagnostics JSON (no keys or balances)

## Security vulnerabilities

Do **not** file public issues for security bugs. See [SECURITY.md](../SECURITY.md).

## What we can and cannot help with

| Situation | Support path |
|-----------|--------------|
| Lost recovery phrase | **Self-service only** — we cannot reset keys |
| Stuck on admission (vouch/vote) | Ask your community founder or inviter |
| `app.aethelos.org` down | Operator/deploy issue — check [OPERATIONS.md](./OPERATIONS.md) hosted preflight |
| Self-hosted URL problems | Your operator or [PUBLISHER.md](./PUBLISHER.md) |

## Service status

There is no public status page yet. Maintainers monitor nightly **hosted-preflight** in GitHub Actions. The managed browser demo at [thegritz-aethelos.hf.space](https://thegritz-aethelos.hf.space) **may be paused** — see [PUBLISHER.md](./PUBLISHER.md) to unpause or self-host. The canonical URL `app.aethelos.org` is **not live**; it requires operator DNS (see [PUBLISHER.md](./PUBLISHER.md)).

## Windows install (SmartScreen / unsigned installer)

The Windows `.exe` and `.msi` from [GitHub Releases](https://github.com/zaeemalimohsin-ux/aethelos/releases/latest) are **not Authenticode-signed** in Early Access. Windows SmartScreen may show **“Windows protected your PC”** or **“Unknown publisher”**.

1. Click **More info** → **Run anyway** (wording varies by Windows version).
2. Verify the download: compare the file’s SHA-256 to `checksums.txt` on the same release page (PowerShell: `Get-FileHash .\\AethelOS_*.exe -Algorithm SHA256`).

If your organisation blocks unsigned installers, use an allowlisted machine or wait for a signed build (not available in EA).

## Invite links and public address (founders)

Founders on the **Windows desktop app** share invite links through a **temporary public address** (Cloudflare quick tunnel). Common issues:

| Symptom | What to try |
|---------|-------------|
| Joiner cannot open the link | Keep your **PC on** and the app running; generate a **fresh link** from **Invite people** after any app restart (the public address changes). |
| “Could not prepare invite link” | Open the **Connection** tab — turn hosting on and wait until a public address appears, then try **Invite people** again. |
| Link worked yesterday, not today | Restarting the desktop app rotates the tunnel — send a **new** invite link; old links may stop working. |
| Joiner stuck offline | Ask them to use a full browser (Safari on iPhone, not an in-app browser), keep the tab open, and retry. |

## Version mismatch (installer vs in-app)

Release installers may show bundle version **0.2.6** in the filename while **Identity → App version** shows **0.2.6.2** (or newer patch). That is expected: the filename uses the desktop bundle semver; the app shows the full npm patch version. When reporting bugs, always copy **App version** from the Identity tab.

## Upgrading

Install the new `.exe` or `.msi` **over** your existing install — do **not** uninstall first (you would lose local identity storage). After upgrading, open the app and confirm **Identity → App version** matches the release you installed.

## Product overview & limitations

- [PRODUCT.md](./PRODUCT.md) — responsibilities and known limits
- [USER_GUIDE.md](./USER_GUIDE.md) — everyday use
- [GET_STARTED.md](./GET_STARTED.md) — founder vs joiner
