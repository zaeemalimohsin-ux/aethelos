# Genesis Bootstrap Guide

AethelOS begins with a connection between two people. This guide walks through the first Cell.

## What You Need

- Two desktop/laptop computers with standard internet access
- One stateless Relay (self-hosted or shared)
- Two browsers running the AethelOS PWA client

## Step 1 — Start Infrastructure

On any machine (or a VPS):

```bash
pnpm dev:relay
```

The relay listens on `ws://localhost:8787` by default. For remote peers, expose the port or deploy behind a reverse proxy with WebSocket support.

## Step 2 — Person A: Genesis

1. Open the client (`pnpm dev:client` → http://localhost:5173)
2. Create an identity (display name + passphrase) and save the recovery phrase
3. Choose **Start a community** and set a name (e.g. "Oak Street Collective")
4. Click **Create community** — connection points are chosen automatically (localhost in
   dev; desktop/hosted installs supply a mailbox)

This generates an Ed25519 keypair (encrypted in IndexedDB), creates a namespace ID, signs the genesis event, and broadcasts it.

**Person A shares one thing — the invite link.** In the **Community** tab, tap
**Invite people** and send the link (or QR). It encodes the connection point(s),
namespace ID, inviter key, and community name, so Person B never copies anything
by hand.

## Step 3 — Person B: Join via the link

On Person B's device:

1. Open the invite link.
2. Create a new identity (display name + passphrase) and save the recovery phrase.
3. Confirm **Join this community**. Person B does **not** genesis — they join
   Person A's Cell and start syncing.

## Step 4 — Person A: Invite with Vouch Bond

Once Person B appears, Person A stakes a Vouch Bond to bring them in:

1. In the **Community** tab, enter Person B's public key.
2. Set the bond amount (the system enforces a super-linear minimum that grows with
   how many people you have vouched).
3. Click **Send invite**.

The bond is locked in escrow and decays over time. If Person B is later expelled
for fraud, the bond goes to the Pool.

## Step 5 — Person B: Accept Invite

Person B sees a banner in the **Community** tab and taps **Accept invite**. Both
Nodes sync through the relay and the Reducer converges them to identical state.

## Step 6 — Verify Convergence

Both participants should see:
- Same member list
- Same Share percentages (derived from Points)
- Same governance parameters

Run `pnpm test` in `packages/core` to validate determinism locally.

## Relay Failover

If a relay goes down or becomes hostile:

1. Start or point to a different relay
2. In the client **Relay** section, enter the new URL and click **Switch Relay**
3. Nodes re-sync from local Event Logs + new relay cache

The relay holds no authority — switching is frictionless.

## Export / Reconstitute

Each Node holds a full Event Log backup in IndexedDB. To reconstitute after device loss:

1. Export the Event Log (API: `NodeController.exportLog()`)
2. Import on a new device with the same identity key
3. Connect to any relay

Capturing a Node achieves nothing alone — the community carries their Shares, relationships, and logs with them.

## Superstructures

Parent–child relationships between Cells are recorded via governance proposals.
Cross-Cell bridging, upward escrow consumption, and population routing are live
in the reducer and covered by `superstructure.test.ts`, `federation.spec.ts`,
and federation reader sync — treat superstructures as linkage architecture with
real economic routing, not a future scaffold.

When a Cell is stable and you have a real parent namespace to join:

1. Any member proposes `join_superstructure` (target = parent namespace ID)
2. Members vote (share-weighted until threshold)
3. Parent Cell creates a `link_subcell` proposal (target = child namespace ID)

Lower Cells may `leave_superstructure` at any time — the architecture of exit is
the architecture of accountability.

## Sub-Cells (growth at the soft cap)

AethelOS scales by **depth**, not width. Each Cell has a soft cap of 50 members.
Past that, growth continues in new sub-Cells that federate upward.

### When approaching the cap

1. The Head opens **Community** and clicks **Spawn sub-Cell**
2. Names the sub-Cell (e.g. "Oak Collective — Ward A")
3. The client genesis's a new namespace with the same identity as founder

### Link parent and child

**In the sub-Cell (any member):**

1. Follow the linkage banner, or go to **Proposals → Superstructures**
2. Propose join with the **parent namespace ID**

**In the parent Cell (any member can propose; community votes):**

1. **Community → Sub-Cells → Propose link** with the child namespace ID
2. Or create a **Link sub-Cell** proposal in **Proposals**

Once both sides pass, the parent records `childCells` and the child records
`parentSuperstructures`. New members invite into the sub-Cell, not the full parent.

## Production deploy

See [PUBLISHER.md](./PUBLISHER.md) for relay hosting, static
hosting, and verification steps.
