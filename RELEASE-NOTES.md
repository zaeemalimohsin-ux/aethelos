# AethelOS v0.2.6.1 Release Notes

Welcome to **AethelOS v0.2.6.1** — patch release with EA doc polish, supply-chain hardening, and traceability fixes on top of v0.2.6.

## Get started in 3 steps

1. **Download** the Windows installer (`.exe` or `.msi`) below
2. **Create identity** → **Start a community**
3. **Invite people** from the Community tab — share the link or QR; joiners open it in any browser

Your PC must stay on while others join. The public address may change after you restart the app.

## What's new in v0.2.6.1

- **EA documentation** — clear Windows Early Access framing; honest hosted-install and HF Space guidance
- **Supply chain** — pinned sidecar checksums verified on download; dependency audit on tag CI
- **Cargo lock discipline** — desktop release builds use `--locked`; version sync checks `Cargo.lock`
- **Traceability** — P3.2 matrix and dual-fork sign-off aligned with v0.2.6 tests
- **Federation E2E** — escrow decreases after approved bridge when amounts are seeded in test

## v0.2.6 highlights (still included)

- Green desktop CI — cold-path invite E2E; invite links never fall back to localhost
- Fail-closed invite flow and desktop proof on every tag
- Federation-on shipping bundle and multi-hop expulsion tests

---

[Full changelog](./CHANGELOG.md) · [Get started](./docs/GET_STARTED.md)
