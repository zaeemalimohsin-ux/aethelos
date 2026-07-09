# Get started with AethelOS

**Open the app → start a community → invite people.**  
**Or open an invite link someone sent you.**

**Pilot build:** v0.2.0 ([latest release](https://github.com/zaeemalimohsin-ux/aethelos/releases/latest))

| You are… | Do this |
|----------|---------|
| **Starting a community** | Open AethelOS (web or [Windows installer from GitHub Releases](https://github.com/zaeemalimohsin-ux/aethelos/releases/latest)) → create identity → **Start a community** → **Invite people** |
| **Joining a community** | Open the **invite link** someone sent you |

---

## Start a community

1. Open AethelOS in your browser, or install the Windows app from [GitHub Releases](https://github.com/zaeemalimohsin-ux/aethelos/releases/latest) (download the `.exe` or `.msi` for **v0.2.0**). Send friends the Releases link — don't ask them to build from source.
2. **Create a new identity** → save your recovery phrase → **Start a community**.
3. On the **Community** tab, tap **Invite people** and send the link or QR to anyone.

The app connects in the background. Operators can tune hosting under **Identity → Advanced → network**.

---

## Join a community

1. Open the invite link.
2. **Create a new identity** (or restore from your recovery phrase).
3. Tap **Join this community**.
4. Copy your **join code** (Community tab) and send it to your inviter.
5. Wait: inviter **vouches** → community **votes** on your admission (Proposals tab; stake-weighted).
6. When approved (step 4 of 4 in the app), tap **Accept invitation**.

Works in any mobile or desktop browser. Use **Install app** on the welcome screen when offered, or add to home screen.

See [USER_GUIDE.md](./USER_GUIDE.md) for everyday use.

---

## Need help?

| Problem | Fix |
|---------|-----|
| Can't create a community | Use a **hosted install**, the **desktop app**, or enter a **connection point** on the Start a community screen |
| Lost device / new phone | Recovery phrase restores **identity only** — rejoin with your **invite link** or **import an event log** export. Export your event log periodically from another device as a backup. |
| Stuck offline | Wait a moment; actions queue and send when back online |
| Invite link doesn't open | Ask the sender for a fresh link from **Invite people** |

For developers and operators: [`Start-AethelOS.bat`](../Start-AethelOS.bat) runs from source with a local relay.
