# AethelOS v0.2.6 Release Notes

Welcome to **AethelOS v0.2.6** — Windows EA release with green desktop CI and honest founder hosting guidance.

## Get started in 3 steps

1. **Download** the Windows installer (`.exe` or `.msi`) below
2. **Create identity** → **Start a community**
3. **Invite people** from the Community tab — share the link or QR; joiners open it in any browser

Your PC must stay on while others join. The public address may change after you restart the app.

## What's new in v0.2.6

- **Green desktop CI** — cold-path invite E2E passes; invite links never fall back to localhost
- **E2E stack health** — federation tiers wait for relay health before tests run
- **Offline outbox hardening** — bridge-first sync assertions reduce flakes
- **EA documentation** — aligned tunnel/hosting expectations across user and operator docs
- **Release workflow** — `workflow_dispatch` for manual reruns; shipping bundle scan on publish job

## v0.2.5 highlights (still included)

- Desktop proof on every tag
- Tauri exit cleanup and tunnel hardening
- Multi-hop expulsion escrow tests
- Federation E2E escrow assertions

---

[Full changelog](./CHANGELOG.md) · [Get started](./docs/GET_STARTED.md)
