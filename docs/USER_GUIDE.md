# AethelOS User Guide

A friendly walkthrough for community members. No technical background needed.

## What is AethelOS?

A shared space for a group to hold value, trade, make decisions together, and
organise — without a bank or company in the middle. You hold your own identity,
and your device keeps a full copy of your community's history.

## 1. Create your identity

1. Open AethelOS in your browser or install the Windows app (see [GET_STARTED.md](./GET_STARTED.md)).
2. Choose **Create a new identity**.
3. Pick a display name and a passphrase. The passphrase encrypts your key on this
   device.

## 2. Save your recovery phrase

You'll see **12 words**. This is the only way to recover your identity if you lose
your device or forget your passphrase.

**Identity only — not membership.** The phrase restores your cryptographic identity, not your community membership or history by itself. To get back into a community, paste your invite link again or import an event log export from another device.

- Write them down on paper and store them safely.
- Never share them with anyone. No one from AethelOS will ever ask for them.
- Tick the confirmation box and continue.

You can re-check whether you've confirmed a backup under **Identity**.

## 3. Start or join a community

See [GET_STARTED.md](./GET_STARTED.md). Summary:

- **Start a community:** create identity → name your community → **Invite people** from the Community tab.
- **Join a community:** open the invite link → join → share your **join code** with your inviter → wait for **vouch** and community **vote** in Proposals → **Accept invitation** when approved (step 4 of 4).

## 4. Everyday use

- **Community tab:** invite people, see members, send Points to others. If you're waiting to join, your progress stepper lives here (not Proposals).
- **Governance tab:** move sliders to shape the rules (decay, thresholds), vouch
  for who should be the Head, and direct redistribution. Your sliders are
  averaged with everyone else's.
- **Proposals tab:** propose and vote on one-off decisions (admitting, expelling,
  linking chapters, resolving a frozen account). After someone is vouched, an **Admit member** proposal appears automatically — you don't create it manually for normal joins. Proposals pass when they cross
  the community's approval threshold — by math, not a deadline.
- **Identity tab:** export/import your identity, export your event log, switch
  theme, and lock your session.

## 5. Inviting people

| Step | Actor | Action |
|------|-------|--------|
| 1 | Inviter | **Invite people** → send link or QR |
| 2 | Invitee | Opens link, joins, sends **join code** |
| 3 | Inviter | **Vouch** (Community → paste their join code) |
| 4 | Members (incl. inviter) | **Proposals** → vote **Approve** on **Admit member** |
| 5 | Invitee | **Accept invitation** after approval |

After vouching, the app opens Proposals and highlights the admission vote. Use **Vote to admit** on the Community card if you return later.

## 6. Staying resilient

- The header shows **Connected**, **Syncing…**, or **Offline**. Actions queue offline and send when you're back.
- **App update?** When a new version is ready, use **Reload now** on the banner at the top.
- **Lost device or new phone:** Install AethelOS elsewhere and choose **Restore from recovery phrase** (identity only). Reconnect your community by pasting your **invite link** again or importing an **event log** export from another device.
- **Operators:** **Connection tab** for connection endpoints and hosting.

## A note on privacy

Your community's history is shared so everyone can verify it. Don't put secrets in
memos. AethelOS is transparent by design.

**Build:** v0.2.0 — cite this when reporting issues.
