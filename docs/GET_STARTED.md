# Get started with AethelOS

**Open the app → start a community → invite people.**  
**Or open an invite link someone sent you.**

**Current release:** v0.2.6.2 ([latest release](https://github.com/zaeemalimohsin-ux/aethelos/releases/latest))  
**Windows Early Access** — software community release (not general availability).

Communities scale by **linked chapters** (50 members per chapter); federation is enabled in **release builds** (shipping Windows installer). See [PRODUCT.md](./PRODUCT.md) for responsibilities and limitations · [Privacy](./PRIVACY.md) · [Terms](./TERMS.md) · [Support](./SUPPORT.md)

| You are… | Do this |
|----------|---------|
| **Starting a community** | Install the [Windows app](https://github.com/zaeemalimohsin-ux/aethelos/releases/latest) (recommended) → create identity → **Start a community** → **Invite people**. Self-hosters: see [PUBLISHER.md](./PUBLISHER.md). |
| **Joining a community** | Open the **invite link** someone sent you |

---

## Start a community

1. Install the [Windows app](https://github.com/zaeemalimohsin-ux/aethelos/releases/latest) — recommended for founders (desktop relay + global invite links).
2. **Create a new identity** (confirm age + Terms) → save your recovery phrase → **Start a community**.
3. On the **Community** tab, tap **Invite people** and send the link or QR to anyone, anywhere.

Keep your PC on while others join. Your temporary public address may change when you restart the app — send a fresh invite link after any restart.

The app connects in the background. Operators can tune hosting under the **Connection** tab.

### Upgrading the Windows app

Download the latest installer from [GitHub Releases](https://github.com/zaeemalimohsin-ux/aethelos/releases/latest) and run it **over** your existing install (do not uninstall first). Confirm **Identity → App version** after upgrading.

### Growing past 50 members

Each chapter holds up to **50 members**. When you approach the limit, the app prompts Heads to **spawn a linked chapter** — new people join through that chapter’s invite link while staying federated with the parent community. See the capacity banner on the Community tab.

---

## Join a community

1. Open the invite link in a **full browser** (Safari on iPhone; avoid in-app browsers inside chat apps).
2. Keep the browser tab **open** while waiting for admission — closing it can delay sync.
3. **Create a new identity** (or restore from your recovery phrase).
3. Tap **Join this community**.
4. Copy your **join code** (Community tab) and send it to your inviter.
5. Wait: inviter **vouches** → community **votes** on your admission (Proposals tab; stake-weighted).
6. When approved (step 4 of 4 in the app), tap **Accept invitation**.

Works in any mobile or desktop browser. On the welcome screen you can also tap **Join with invite link**, or use **Install app** when offered.

See [USER_GUIDE.md](./USER_GUIDE.md) for everyday use.

---

## Need help?

| Problem | Fix |
|---------|-----|
| Can't create a community | Use the **desktop app** (recommended), **self-host** your own URL ([PUBLISHER.md](./PUBLISHER.md)), or enter a **connection point** on the Start a community screen. The canonical browser URL `app.aethelos.org` is **not live** yet. |
| Lost device / new phone | Recovery phrase restores **identity only** — rejoin with your **invite link** or **import an event log** export. Export your event log periodically from another device as a backup. **Importing two conflicting forks from different exports can merge both branches** — prefer a single canonical export from a trusted device. |
| Stuck offline | Wait a moment; actions queue and send when back online |
| Invite link doesn't open | Ask the sender for a fresh link from **Invite people** (especially after they restarted the desktop app) |
| Joiner on phone won't connect | Use Safari (not an in-app browser); keep the tab open; ask founder for a fresh link |
| Installer name vs App version | Filename may say `0.2.6` while Identity shows `0.2.6.2` — report bugs using **App version** |

For developers: [CONTRIBUTING.md](../CONTRIBUTING.md). Operators: [PUBLISHER.md](./PUBLISHER.md).
