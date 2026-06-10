import { useEffect, useState } from "react";
import type { PoolState } from "@aethelos/core";
import { SOFT_CELL_CAP, requiredVouchLien, pledgedLienTotal, availableToPledge, admissionProposalId, totalPoolPoints } from "@aethelos/core";
import { useStore } from "../app/store.js";
import { Card } from "../design/components/Card.js";
import { Button } from "../design/components/Button.js";
import { Field } from "../design/components/Field.js";
import { Modal } from "../design/components/Modal.js";
import { QRCode } from "../components/QRCode.js";
import { buildInviteLink } from "../app/invite.js";
import { shortKey, formatPts } from "../app/format.js";
import {
  clearSubCellParentContext,
  loadSubCellParentContext,
} from "../app/subcell-context.js";
import { CONCEPT } from "../app/concept-help.js";
import { HelpTip } from "../design/components/HelpTip.js";
import { Disclosure } from "../design/components/Disclosure.js";
import { MemberSelect } from "../design/components/MemberSelect.js";
import { useCirculationCountdown } from "../app/useCirculationCountdown.js";
import { RelaySetupHelp } from "../design/components/RelaySetupHelp.js";
import { isValidRelayUrl } from "../app/session.js";
import { isDesktopApp } from "../app/local-node.js";
import { tunnelStatusMessage } from "../app/active-relays.js";

export function CellView({ pool }: { pool: PoolState }) {
  const controller = useStore((s) => s.controller)!;
  const myKey = useStore((s) => s.myKey);
  const transfer = useStore((s) => s.transfer);
  const invite = useStore((s) => s.invite);
  const acceptPendingInvite = useStore((s) => s.acceptPendingInvite);

  const myBalance = pool.balances[myKey] ?? 0n;
  const myShare = controller.getSharePercent(myKey);
  const pledged = pledgedLienTotal(pool, myKey);
  const poolTotal = totalPoolPoints(pool);
  const isHead = pool.head === myKey;
  const isFrozen = pool.frozen.includes(myKey);
  const pendingInvite = pool.pendingInvites[myKey];
  const hasPendingInvite = !!pendingInvite && !pool.members.includes(myKey);
  const isGuest = !pool.members.includes(myKey) && !hasPendingInvite;
  const countdown = useCirculationCountdown(pool);

  return (
    <div className="stack">
      <PhilosophyCard />
      {isGuest && <GuestJoinCodeBanner myKey={myKey} />}
      <SubCellCapBanner pool={pool} isHead={isHead} />
      <SubCellLinkageBanner pool={pool} isHead={isHead} />
      {hasPendingInvite && (
        <div className="alert info">
          {pendingInvite!.admissionApproved ? (
            <>
              The community approved your admission.{" "}
              <button className="btn sm" onClick={() => void acceptPendingInvite()}>
                Accept invite
              </button>
            </>
          ) : (
            <>Waiting for the community to approve your admission via proposal vote.</>
          )}
        </div>
      )}

      <div className="grid">
        <Card eyebrow="Your stake">
          <div className="stat">{myShare.toFixed(2)}%</div>
          <div className="stat-label">{formatPts(myBalance)} Points</div>
          {pledged > 0n && (
            <div className="hint" style={{ marginTop: "var(--sp-2)" }}>
              {formatPts(pledged)} pts pledged behind others (lien on your Share)
            </div>
          )}
          <div className="row" style={{ marginTop: "var(--sp-2)" }}>
            {isHead && <span className="badge success">Head</span>}
            {isFrozen && <span className="badge danger">Frozen</span>}
          </div>
        </Card>
        <Card eyebrow="Community">
          <div className="stat">{pool.members.length}</div>
          <div className="stat-label">
            Members · Cycle {pool.epochNumber} · Pool {formatPts(poolTotal)} pts
            {controller.getFederatedPoolTotal() > poolTotal ? (
              <> · Federated {formatPts(controller.getFederatedPoolTotal())} pts</>
            ) : null}
            {" · Commons "}
            {formatPts(pool.commons)} pts
          </div>
          {countdown.label ? (
            <div className="hint" style={{ marginTop: "var(--sp-2)" }}>
              {countdown.label}
            </div>
          ) : null}
        </Card>
      </div>

      <Members pool={pool} />

      {(pool.childCells?.length ?? 0) > 0 && <ChildCellsCard pool={pool} />}
      <FederationCard pool={pool} />
      <BridgeEscrowCard pool={pool} myKey={myKey} />

      {pool.members.includes(myKey) && !isFrozen && (
        <>
          <TransferCard onTransfer={transfer} pool={pool} myKey={myKey} />
          <ActiveVouchLiensCard pool={pool} myKey={myKey} />
          <PendingInvitesCard pool={pool} myKey={myKey} />
          <InviteCard onInvite={invite} />
        </>
      )}

      <RelaysCard />
    </div>
  );
}

function PhilosophyCard() {
  return (
    <Disclosure summary="How your community works">
      <div className="concept-card">
        <p>
          <strong>Your stake</strong> — {CONCEPT.stake} <HelpTip text={CONCEPT.points} />
        </p>
        <p>
          <strong>Vouch for people</strong> — {CONCEPT.vouch}
        </p>
        <p>
          <strong>We decide together</strong> — {CONCEPT.proposal}
        </p>
      </div>
    </Disclosure>
  );
}

function GuestJoinCodeBanner({ myKey }: { myKey: string }) {
  const toast = useStore((s) => s.toast);
  return (
    <div className="alert info">
      <strong>Waiting to be welcomed in?</strong> Send this join code to whoever invited
      you. They pledge a lien on their Share and the community votes to admit you.{" "}
      <HelpTip text={CONCEPT.vouch} />
      <div className="join-code-box">
        <code className="mono">{myKey}</code>
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(myKey);
            toast("Join code copied — send it to your inviter", "success");
          }}
        >
          Copy join code
        </Button>
      </div>
    </div>
  );
}

function Members({ pool }: { pool: PoolState }) {
  const controller = useStore((s) => s.controller)!;
  return (
    <Card eyebrow="Members">
      <ul className="list">
        {pool.members.map((m) => {
          const tags = [
            m === pool.head ? "Head" : "",
            pool.frozen.includes(m) ? "Frozen" : "",
            pool.bridges.includes(m) ? "Bridge" : "",
          ].filter(Boolean);
          return (
            <li key={m}>
              <span className="mono">
                {shortKey(m, 12)}{" "}
                {tags.map((t) => (
                  <span key={t} className="badge neutral" style={{ marginLeft: 4 }}>
                    {t}
                  </span>
                ))}
              </span>
              <span>
                {controller.getSharePercent(m).toFixed(1)}% ·{" "}
                {formatPts(pool.balances[m] ?? 0n)} pts
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function TransferCard({
  onTransfer,
  pool,
  myKey,
}: {
  onTransfer: (to: string, amount: string, memo?: string) => Promise<void>;
  pool: PoolState;
  myKey: string;
}) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  return (
    <Card eyebrow="Send to someone">
      <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
        Move Points to another member. Everyone sees the same result.{" "}
        <HelpTip text={CONCEPT.points} />
      </p>
      <MemberSelect
        label="Send to"
        members={pool.members}
        exclude={myKey}
        value={to}
        onChange={setTo}
      />
      <Field
        label="Amount (Points)"
        type="text"
        inputMode="decimal"
        hint="Up to 9 decimal places"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <Field
        label="Memo (optional)"
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
      />
      <Button
        disabled={!to.trim() || !amount}
        onClick={() => {
          void onTransfer(to.trim(), amount, memo || undefined);
          setTo("");
          setAmount("");
          setMemo("");
        }}
      >
        Send transaction
      </Button>
    </Card>
  );
}

function proposalApprovalPercent(
  votesFor: bigint,
  votesAgainst: bigint,
): number {
  const total = votesFor + votesAgainst;
  if (total === 0n) return 0;
  return Number((votesFor * 100n) / total);
}

function ActiveVouchLiensCard({ pool, myKey }: { pool: PoolState; myKey: string }) {
  const liens = Object.entries(pool.vouchLiens).filter(
    ([invitee, lien]) => lien.inviter === myKey && pool.members.includes(invitee),
  );
  if (liens.length === 0) return null;
  return (
    <Card eyebrow="Active vouch liens">
      <ul className="list">
        {liens.map(([invitee, lien]) => (
          <li key={invitee}>
            <span className="mono">{shortKey(invitee, 12)}</span>
            <span>{formatPts(lien.amount)} pts pledged (forfeitable if expelled)</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PendingInvitesCard({ pool, myKey }: { pool: PoolState; myKey: string }) {
  const cancelInvite = useStore((s) => s.cancelInvite);
  const pending = Object.entries(pool.pendingInvites).filter(
    ([, inv]) => inv.inviter === myKey,
  );
  if (pending.length === 0) return null;
  return (
    <Card eyebrow="Your pending invites">
      <ul className="list">
        {pending.map(([invitee, inv]) => {
          const proposalId = admissionProposalId(invitee);
          const proposal = pool.proposals[proposalId];
          const approvalPct = proposal
            ? proposalApprovalPercent(proposal.votesFor, proposal.votesAgainst)
            : 0;
          const status = inv.admissionApproved
            ? "Approved — waiting for them to accept"
            : proposal?.executed
              ? "Approved"
              : `Admission vote ${approvalPct}% (need ${pool.parameters.approval_threshold}%)`;
          return (
            <li key={invitee}>
              <span className="mono">{shortKey(invitee, 12)}</span>
              <span>{formatPts(inv.lienAmount)} pts pledged (lien)</span>
              <span className="muted">{status}</span>
              <button className="btn ghost sm" onClick={() => void cancelInvite(invitee)}>
                Cancel
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function InviteCard({
  onInvite,
}: {
  onInvite: (pubkey: string) => Promise<void>;
}) {
  const controller = useStore((s) => s.controller)!;
  const pool = useStore((s) => s.pool)!;
  const myKey = useStore((s) => s.myKey);
  const displayName = useStore((s) => s.displayName);
  const toast = useStore((s) => s.toast);
  const [pubkey, setPubkey] = useState("");
  const lienAmount = requiredVouchLien(pool, myKey);
  const myBalance = pool.balances[myKey] ?? 0n;
  const lienPercent =
    myBalance > 0n ? Number((lienAmount * 10000n) / myBalance) / 100 : 0;
  const pledgeCapacity = availableToPledge(pool, myKey);
  const [showLink, setShowLink] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const atCap = pool.members.length >= SOFT_CELL_CAP;
  const nearCap = pool.members.length >= SOFT_CELL_CAP - 10;

  useEffect(() => {
    if (!showLink) return;
    let cancelled = false;
    void controller
      .buildSignedInvitePayload(pool.cellName, controller.getInviteRelayUrls())
      .then((payload) => {
        if (!cancelled) setInviteLink(buildInviteLink(payload));
      })
      .catch(() => {
        if (!cancelled) toast("Could not sign invite link", "error");
      });
    return () => {
      cancelled = true;
    };
  }, [showLink, controller, pool.cellName, toast]);

  return (
    <Card eyebrow="Invite someone">
      {atCap ? (
        <div className="alert warning" style={{ marginBottom: "var(--sp-3)" }}>
          This community is full ({SOFT_CELL_CAP} members). Start a sub-community for
          new people instead.
        </div>
      ) : nearCap ? (
        <div className="alert info" style={{ marginBottom: "var(--sp-3)" }}>
          {pool.members.length} / {SOFT_CELL_CAP} members — plan a sub-community soon.
        </div>
      ) : null}
      <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
        Share a link first. When they open it, they copy a <strong>join code</strong> back
        to you — then you vouch for them. <HelpTip text={CONCEPT.vouch} />
      </p>
      <Button variant="secondary" block onClick={() => setShowLink(true)}>
        Share invite link
      </Button>

      <Disclosure summary="They opened your link — vouch for them">
        <Field
          label="Join code"
          hint="Paste the code from their screen (Community tab)."
          value={pubkey}
          onChange={(e) => setPubkey(e.target.value)}
          className="mono"
        />
        <p className="hint">
          This vouch pledges <strong>{lienPercent.toFixed(1)}%</strong> of your Share (
          {formatPts(lienAmount)} pts) as a forfeitable lien. Points stay in your wallet; the
          community must approve admission before they can join.{" "}
          {formatPts(pledgeCapacity)} pts still available to pledge.
        </p>
        <Button
          block
          disabled={!pubkey.trim() || atCap || lienAmount > pledgeCapacity}
          onClick={() => {
            void onInvite(pubkey.trim());
            setPubkey("");
          }}
        >
          Vouch and send invite
        </Button>
      </Disclosure>

      {showLink && inviteLink && (
        <Modal title="Invite link" onClose={() => setShowLink(false)}>
          <p className="muted" style={{ marginBottom: "var(--sp-3)" }}>
            {displayName ? `${displayName} invites you to ` : "Join "}
            <strong>{pool.cellName}</strong>. This link is signed by the inviter. Share
            it or the QR:
          </p>
          <div className="center" style={{ marginBottom: "var(--sp-3)" }}>
            <QRCode value={inviteLink} />
          </div>
          <div className="field">
            <textarea className="textarea mono" rows={3} readOnly value={inviteLink} />
          </div>
          <Button
            block
            onClick={async () => {
              await navigator.clipboard.writeText(inviteLink);
              toast("Invite link copied", "success");
            }}
          >
            Copy link
          </Button>
        </Modal>
      )}
    </Card>
  );
}

function SubCellCapBanner({ pool, isHead }: { pool: PoolState; isHead: boolean }) {
  const spawnSubCell = useStore((s) => s.spawnSubCell);
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const count = pool.members.length;
  const warn = count >= SOFT_CELL_CAP - 10;
  if (!warn) return null;

  const atCap = count >= SOFT_CELL_CAP;
  return (
    <>
      <div className={`alert ${atCap ? "warning" : "info"}`}>
        {atCap ? (
          <>
            This Cell has reached the soft cap ({SOFT_CELL_CAP} members). Growth continues
            by spawning sub-Cells, not widening this one.
          </>
        ) : (
          <>
            {count} / {SOFT_CELL_CAP} members — AethelOS scales by depth (sub-Cells), not
            width.
          </>
        )}
        {isHead && (
          <button
            className="btn sm"
            style={{ marginLeft: "var(--sp-2)" }}
            onClick={() => setOpen(true)}
          >
            Spawn sub-Cell
          </button>
        )}
      </div>
      {open && (
        <Modal title="Spawn a sub-Cell" onClose={() => setOpen(false)}>
          <p className="muted" style={{ marginBottom: "var(--sp-3)" }}>
            Creates a new community (new namespace) with you as founder. New members join
            the sub-Cell; link it back here via proposals on both sides.
          </p>
          <Field
            label="Sub-Cell name"
            placeholder={`${pool.cellName} — Ward A`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            block
            disabled={!name.trim()}
            onClick={() => {
              void spawnSubCell(name.trim()).then(() => {
                setOpen(false);
                setName("");
              });
            }}
          >
            Create sub-Cell
          </Button>
        </Modal>
      )}
    </>
  );
}

function SubCellLinkageBanner({
  pool,
  isHead,
}: {
  pool: PoolState;
  isHead: boolean;
}) {
  const joinSuperstructure = useStore((s) => s.joinSuperstructure);
  const toast = useStore((s) => s.toast);
  const parent = loadSubCellParentContext();
  if (!parent) return null;
  if (pool.parentSuperstructures.includes(parent.parentNamespaceId)) {
    clearSubCellParentContext();
    return null;
  }

  return (
    <div className="alert info">
      <strong>Link to parent:</strong> {parent.parentCellName}. In this sub-Cell, the
      Head proposes joining the parent namespace. In the parent Cell, create a{" "}
      <em>Link sub-Cell</em> proposal with this namespace ID:
      <div className="mono faint" style={{ margin: "var(--sp-2) 0", wordBreak: "break-all" }}>
        {pool.namespaceId}
      </div>
      <div className="row">
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(pool.namespaceId);
            toast("Namespace ID copied", "success");
          }}
        >
          Copy this Cell ID
        </Button>
        {isHead && (
          <Button
            size="sm"
            onClick={() => void joinSuperstructure(parent.parentNamespaceId)}
          >
            Propose join to parent
          </Button>
        )}
        <button className="btn ghost sm" onClick={() => clearSubCellParentContext()}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

function ChildCellsCard({ pool }: { pool: PoolState }) {
  const linkSubcell = useStore((s) => s.linkSubcell);
  const [childId, setChildId] = useState("");
  const children = pool.childCells ?? [];
  return (
    <Card eyebrow="Sub-Cells">
      <ul className="list">
        {children.map((id) => (
          <li key={id}>
            <span className="mono">{shortKey(id, 16)}</span>
          </li>
        ))}
      </ul>
      <p className="hint" style={{ margin: "var(--sp-3) 0" }}>
        Register a child namespace after its Head has genesis'd it:
      </p>
      <div className="row">
        <input
          className="input mono"
          placeholder="Child namespace ID"
          value={childId}
          onChange={(e) => setChildId(e.target.value)}
          style={{ flex: 1 }}
        />
        <Button
          variant="secondary"
          disabled={!childId.trim()}
          onClick={() => {
            void linkSubcell(childId.trim());
            setChildId("");
          }}
        >
          Propose link
        </Button>
      </div>
    </Card>
  );
}

function FederationCard({ pool }: { pool: PoolState }) {
  const linkedPools = useStore((s) => s.linkedPools);
  const ids = [...pool.parentSuperstructures, ...(pool.childCells ?? [])];
  if (ids.length === 0) return null;

  return (
    <Card eyebrow="Linked communities">
      <ul className="list">
        {ids.map((id) => {
          const linked = linkedPools[id];
          const role = pool.parentSuperstructures.includes(id) ? "Parent" : "Child";
          return (
            <li key={id}>
              <span className="badge neutral">{role}</span>
              <span className="mono">{shortKey(id, 16)}</span>
              {linked ? (
                <span className="muted">
                  {linked.cellName || "—"} · {linked.members.length} members ·{" "}
                  {formatPts(
                    linked.members.reduce((s, m) => s + (linked.balances[m] ?? 0n), 0n),
                  )}{" "}
                  pts in wallets
                </span>
              ) : (
                <span className="muted">Syncing…</span>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function BridgeEscrowCard({ pool, myKey }: { pool: PoolState; myKey: string }) {
  const bridgeEscrow = useStore((s) => s.bridgeEscrow);
  const linkedPools = useStore((s) => s.linkedPools);
  const linked =
    pool.parentSuperstructures.length > 0 || (pool.childCells?.length ?? 0) > 0;
  const isBridgeRole = pool.bridges.includes(myKey) || pool.head === myKey;
  const [remoteId, setRemoteId] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");

  const escrowEntries = [
    ...Object.entries(pool.superstructureEscrow ?? {}),
    ...Object.entries(pool.childCellEscrow ?? {}),
  ].filter(([, v]) => v > 0n);

  if (!linked && escrowEntries.length === 0) return null;

  return (
    <Card eyebrow="Bridge & escrow">
      {escrowEntries.length > 0 && (
        <ul className="list" style={{ marginBottom: "var(--sp-3)" }}>
          {escrowEntries.map(([id, pts]) => (
            <li key={id}>
              <span className="mono">{shortKey(id, 12)}</span>
              <span>{formatPts(pts)} pts held for bridge delivery</span>
            </li>
          ))}
        </ul>
      )}
      {isBridgeRole && linked ? (
        <>
          <p className="hint" style={{ marginBottom: "var(--sp-2)" }}>
            Propose a cross-community transfer. After stake-weighted approval, bridge members
            mirror it automatically on the linked namespace.
          </p>
          <div className="stack">
            <Field
              label="Remote community ID"
              value={remoteId}
              onChange={(e) => setRemoteId(e.target.value)}
              className="mono"
            />
            <Field
              label="Recipient public key"
              hint="Head of the remote community, or a member there."
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mono"
            />
            <Field
              label="Bridge amount (Points)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <Button
              disabled={!remoteId.trim() || !to.trim() || !amount.trim()}
              onClick={() => {
                void bridgeEscrow(remoteId, to, amount);
                setRemoteId("");
                setTo("");
                setAmount("");
              }}
            >
              Propose bridge transfer
            </Button>
            {remoteId.trim() && linkedPools[remoteId.trim()]?.head ? (
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => setTo(linkedPools[remoteId.trim()]!.head!)}
              >
                Use remote Head key
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <p className="muted">Only bridge members can initiate cross-community transfers.</p>
      )}
    </Card>
  );
}

function RelaysCard() {
  const controller = useStore((s) => s.controller)!;
  const sync = useStore((s) => s.sync);
  const pool = useStore((s) => s.pool);
  const relaySharing = useStore((s) => s.relaySharing);
  const tunnelStatus = useStore((s) => s.tunnelStatus);
  const setRelaySharing = useStore((s) => s.setRelaySharing);
  const addRelay = useStore((s) => s.addRelay);
  const removeRelay = useStore((s) => s.removeRelay);
  const [url, setUrl] = useState("");
  const [relayError, setRelayError] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const desktop = isDesktopApp();
  const relays =
    sync?.relays ??
    controller.getRelayUrls().map((u) => ({ url: u, status: "offline" as const }));
  const communityCount = pool?.communityRelays?.length ?? 0;
  const onlineCount = relays.filter((r) => r.status === "online").length;

  return (
    <Card eyebrow="Connection">
      <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
        Community mailboxes: {communityCount || "none published yet"} · connected to{" "}
        {onlineCount} of {relays.length}. <HelpTip text={CONCEPT.relay} />
      </p>
      {desktop ? (
        <>
          <div className="row" style={{ marginBottom: "var(--sp-2)", alignItems: "center" }}>
            <span className="muted">Sharing from this computer</span>
            <button
              className={`btn ${relaySharing ? "secondary" : "ghost"} sm`}
              disabled={shareBusy}
              onClick={async () => {
                setShareBusy(true);
                await setRelaySharing(!relaySharing);
                setShareBusy(false);
              }}
            >
              {relaySharing ? "On" : "Off"}
            </button>
          </div>
          <p
            className={`hint ${tunnelStatus === "failed" ? "error-text" : ""}`}
            style={{ marginBottom: "var(--sp-3)" }}
          >
            {tunnelStatusMessage(tunnelStatus)}
          </p>
          <p className="hint" style={{ marginBottom: "var(--sp-3)", fontSize: "0.85em" }}>
            Your PC must stay awake while sharing. Tunnel URLs may change if you restart — toggle
            sharing off and on to republish.
          </p>
        </>
      ) : (
        <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
          Install the desktop app if you want to share a mailbox from your computer.
        </p>
      )}
      <Disclosure summary="Troubleshooting: manage relays">
        <ul className="list">
          {relays.map((r) => (
            <li key={r.url}>
              <span className="row" style={{ gap: "var(--sp-2)" }}>
                <span className={`dot ${r.status}`} />
                <span className="mono">{r.url}</span>
              </span>
              <button
                className="btn ghost sm"
                onClick={() => removeRelay(r.url)}
                aria-label={`Remove relay ${r.url}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="row" style={{ marginTop: "var(--sp-3)" }}>
          <input
            className="input"
            placeholder="wss://relay.example.org:8787"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={{ flex: 1 }}
          />
          <Button
            variant="secondary"
            disabled={!url.trim()}
            onClick={() => {
              const trimmed = url.trim();
              if (!isValidRelayUrl(trimmed)) {
                setRelayError("Enter a valid ws:// or wss:// relay address.");
                return;
              }
              setRelayError("");
              addRelay(trimmed);
              setUrl("");
            }}
          >
            Add relay
          </Button>
        </div>
        {relayError ? <p className="error-text">{relayError}</p> : null}
        <RelaySetupHelp />
      </Disclosure>
    </Card>
  );
}
