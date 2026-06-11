# Get started with AethelOS

No terminal required for most people. Pick your role:

| You are… | Do this |
|----------|---------|
| **Trying it alone** | Double-click [`Start-AethelOS.bat`](../Start-AethelOS.bat) in the project folder |
| **Starting a community and inviting friends** | Install the **desktop app** (below), create a community, share the invite link |
| **Joining someone else's community** | Open the **invite link** they sent — browser is fine |

---

## Try it alone (Windows)

1. Install [Node.js 20 LTS](https://nodejs.org/) if prompted (or run `winget install OpenJS.NodeJS.LTS`).
2. Double-click **`Start-AethelOS.bat`** at the repo root.
3. Your browser opens automatically:
   - **Docker mode** if Docker Desktop is running → `http://localhost:8080`
   - **Otherwise** → dev client at `http://localhost:5173` or the desktop window if Rust is installed
4. Create an identity → **Start a community** → explore.

**Share on your home Wi‑Fi:** run `Start-AethelOS.bat` with LAN URLs:

```powershell
powershell -File scripts\start-aethelos.ps1 -Lan
```

Friends on the same network can open the LAN URL printed in the terminal.

---

## Download the desktop app (founders)

The desktop app lets you **host a mailbox** from your PC and invite friends abroad (with [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) installed).

### Option A — GitHub Release (easiest to share)

1. Open **Releases** on the GitHub repo (tag `v0.1.1` or later).
2. Download the Windows `.exe` installer.
3. Run the installer — **no separate Node.js install needed**.

### Option B — Build on your PC

1. Install [Rust](https://rustup.rs/) and Node 20.
2. Double-click **`Build-Release.bat`** (or run `pnpm release:desktop`).
3. Send friends the file from **`dist/releases/`**.

### After installing (invite friends abroad)

1. Install **cloudflared** (`winget install Cloudflare.cloudflared`).
2. Open AethelOS desktop → create identity → **Start a community**.
3. Check **Connection** shows **Ready for friends abroad**.
4. **Community → Share invite link** — send the link or QR.
5. When they send their **join code**, vouch for them from the invite section.

For a **public browser URL** in invite links (so friends don't need your LAN), host the PWA once — see [DEPLOY.md](./DEPLOY.md) or use Docker (`Start-AethelOS.bat` with Docker).

More detail: [QUICKSTART_REMOTE.md](./QUICKSTART_REMOTE.md)

---

## Join as a friend

1. Open the invite link (email, chat, QR).
2. **Create a new identity** (or restore an existing one).
3. Tap **Join this community**.
4. Send your **join code** back to the inviter.
5. Wait for approval, then tap **Accept invite**.

No install required if the link opens in your browser. See [USER_GUIDE.md](./USER_GUIDE.md) for everyday use.

---

## Docker stack (browser + relay)

If you use Docker Desktop:

```bash
docker compose --env-file .env.docker up --build -d
```

Open `http://localhost:8080`. Copy [`docker-compose.env.example`](../docker-compose.env.example) to `.env.docker` or let `Start-AethelOS.bat -Lan` generate it.

---

## Need help?

| Problem | Fix |
|---------|-----|
| "No mailboxes available" in browser | Use the **desktop app** to start a community, or open an **invite link** to join |
| Connection says install cloudflared | `winget install Cloudflare.cloudflared`, restart desktop app |
| Invite link starts with `localhost` | Host the PWA publicly or share the desktop-built link after configuring a public app URL |
| Start script fails on first run | Allow it to finish `pnpm install` once — can take a few minutes |

Developers: see the main [README](../README.md) for tests and CI.
