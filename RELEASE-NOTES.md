# AethelOS v0.2.3 Release Notes

Welcome to **AethelOS v0.2.3** — the recommended Windows release for founding and linking communities globally.

## Highlights

### Official Windows path

- Download the [Windows installer](https://github.com/zaeemalimohsin-ux/aethelos/releases/latest) (`.exe` or `.msi`)
- Create identity → **Start a community** → **Invite people** from the Community tab
- Desktop relay + share links let joiners open your invite in any browser — no central server required

**SmartScreen:** Builds are not Authenticode-signed yet. Choose **More info → Run anyway** on first launch.

### Signed federation links

- Child and parent Heads sign chapter links (like member invites)
- Paste a signed link to propose joining or linking chapters — no more copying raw namespace IDs

### Release quality

- GitHub tag releases now run the same E2E tiers as merge CI before the installer is built
- Production bundle scanned for federation-on UI and absence of test bridge

### Federation on by default

- **50 members per chapter** — scale by linking chapters
- Linked-chapter UI in all production builds

## Joining without Windows

Joiners do **not** need the installer. Open the **invite link** the founder sent you in Chrome, Safari, or Edge on phone or desktop.

A canonical hosted URL (`app.aethelos.org`) is **not live yet** — founders share invite links from the Windows app (or self-host per [PUBLISHER.md](./docs/PUBLISHER.md)).

## Known limitations

See [PRODUCT.md](./docs/PRODUCT.md): unsigned Windows builds, 50 members per chapter, offline queueing, four-step guest admission.

---

[Full changelog](./CHANGELOG.md) · [Get started](./docs/GET_STARTED.md)
