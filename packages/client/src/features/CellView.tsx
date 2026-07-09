import { useEffect, useState } from "react";
import type { PoolState, GovernanceParameter } from "@aethelos/core";
import {
  SOFT_CELL_CAP,
  requiredVouchLien,
  pledgedLienTotal,
  availableToPledge,
  admissionProposalId,
  totalPoolPoints,
  votingWeight,
  MIN_EPOCH_INTERVAL_MINUTES,
} from "@aethelos/core";
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
import { Slider } from "../design/components/Slider.js";
import { MemberSelect } from "../design/components/MemberSelect.js";
import { useCirculationCountdown } from "../app/useCirculationCountdown.js";
import { connectionStatusMessage } from "../app/active-relays.js";

export function CellView({ pool }: { pool: PoolState }) {
  const controller = useStore((s) => s.controller)!;
  const myKey = useStore((s) => s.myKey);
  const transfer = useStore((s) => s.transfer);
  const invite = useStore((s) => s.invite);

  const myBalance = pool.balances[myKey] ?? 0n;
  const myPercent = controller.getSharePercent(myKey);
  const pledged = pledgedLienTotal(pool, myKey);
  const poolTotal = totalPoolPoints(pool);
  const isHead = pool.head === myKey;
  const isFrozen = pool.frozen.includes(myKey);
  const pendingInvite = pool.pendingInvites[myKey];
  const hasPendingInvite = !!pendingInvite && !pool.members.includes(myKey);
  const isGuest = !pool.members.includes(myKey);
  const waitingToJoin = isGuest;
  const countdown = useCirculationCountdown(pool);
  const sync = useStore((s) => s.sync);

  return (
    <div className="stack">
      <PhilosophyCard />
      {sync?.overall === "offline" ? (
        <div className="alert warning">
          Offline — actions queue on this device until a connection point is reachable.
          Others won't see them yet.
        </div>
      ) : null}
      {waitingToJoin ? (
        <JoinProgressCard pool={pool} myKey={myKey} hasPendingInvite={hasPendingInvite} />
      ) : null}
      {isFrozen && (
        <div className="alert danger">
          Your account is frozen after suspicious activity. Open{" "}
          <strong>Proposals</strong> to request an unfreeze vote.
        </div>
      )}
      <SubCellCapBanner pool={pool} isHead={isHead} />
      <SubCellLinkageBanner pool={pool} />
      <div className="grid">
        <Card eyebrow="Your stake">
          <div className="stat-value">{myPercent.toFixed(1)}%</div>
          <div className="stat-label">{formatPts(myBalance)} Value</div>
          {pledged > 0n && (
            <div className="hint" style={{ marginTop: "var(--sp-2)" }}>
              {formatPts(pledged)} Value pledged behind others (lien on your Share)
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

      {pool.members.includes(myKey) && !isFrozen && <InviteCard onInvite={invite} />}

      <Members pool={pool} />

      {(pool.childCells?.length ?? 0) > 0 ||
      (pool.parentSuperstructures?.length ?? 0) > 0 ||
      Object.values(pool.superstructureEscrow ?? {}).some((v) => v > 0n) ||
      Object.values(pool.childCellEscrow ?? {}).some((v) => v > 0n) ? (
        <Disclosure summary="Linked chapters & bridges">
          {(pool.childCells?.length ?? 0) > 0 && <ChildCellsCard pool={pool} />}
          <FederationCard pool={pool} />
          <BridgeEscrowCard pool={pool} myKey={myKey} />
        </Disclosure>
      ) : null}

      {pool.members.includes(myKey) && !isFrozen && (
        <>
          {pool.members.length > 1 && (
            <TransferCard onTransfer={transfer} pool={pool} myKey={myKey} />
          )}
          <ActiveVouchLiensCard pool={pool} myKey={myKey} />
          <PendingInvitesCard pool={pool} myKey={myKey} />
        </>
      )}
    </div>
  );
}

function PhilosophyCard() {
  return (
    <Disclosure summary="How your community works">
      <div className="concept-card">
        <p>
          <strong>Your stake</strong> — {CONCEPT.stake}
        </p>
        <p>
          <strong>Vouch for people</strong> — {CONCEPT.vouch}
        </p>
        <p>
          <strong>We decide together</strong> — {CONCEPT.proposal}
        </p>
        <p>
          <strong>The Head</strong> — {CONCEPT.head}
        </p>
        <p>
          <strong>Stake circulation</strong> — {CONCEPT.epoch}
        </p>
        <p>
          <strong>Scaling up</strong> — {CONCEPT.subCell}
        </p>
      </div>
    </Disclosure>
  );
}

function JoinProgressCard({
  pool,
  myKey,
  hasPendingInvite,
}: {
  pool: PoolState;
  myKey: string;
  hasPendingInvite: boolean;
}) {
  const pendingInvite = pool.pendingInvites[myKey];
  const proposalId = admissionProposalId(myKey);
  const proposal = pool.proposals[proposalId];
  const totalStake = pool.members.reduce((sum, m) => sum + votingWeight(pool, m), 0n);
  const approvalPct =
    proposal && totalStake > 0n ? Number((proposal.votesFor * 100n) / totalStake) : 0;

  let step = 1;
  let label = "Connected — share your join code with your inviter";
  if (hasPendingInvite && pendingInvite && !proposal) {
    step = 2;
    label = "Inviter vouched for you — admission vote syncing";
  } else if (
    pendingInvite &&
    proposal &&
    !proposal.executed &&
    !pendingInvite.admissionApproved
  ) {
    step = 3;
    label = `Community voting (${approvalPct.toFixed(0)}% of stake)`;
  } else if (pendingInvite?.admissionApproved) {
    step = 4;
    label = "Approved — accept your invitation";
  }

  const acceptPendingInvite = useStore((s) => s.acceptPendingInvite);

  return (
    <div className="alert info">
      <strong>Waiting to join</strong> — step {step} of 4: {label}
      {step === 1 ? (
        <div className="join-code-box" style={{ marginTop: "var(--sp-2)" }}>
          <code className="mono">{myKey}</code>
          <JoinCodeActions joinCode={myKey} />
        </div>
      ) : null}
      {step === 4 ? (
        <Button
          style={{ marginTop: "var(--sp-2)" }}
          block
          onClick={() => void acceptPendingInvite()}
        >
          Accept invitation
        </Button>
      ) : null}
    </div>
  );
}

function JoinCodeActions({ joinCode }: { joinCode: string }) {
  const toast = useStore((s) => s.toast);
  const copyCode = async () => {
    await navigator.clipboard.writeText(joinCode);
    toast("Copied — send this to your inviter", "success");
  };
  return (
    <div className="join-code-actions">
      <Button
        block
        onClick={async () => {
          if (typeof navigator.share === "function") {
            try {
              await navigator.share({ title: "My join code", text: joinCode });
              return;
            } catch (err) {
              if (err instanceof DOMException && err.name === "AbortError") return;
            }
          }
          await copyCode();
        }}
      >
        Share code with inviter
      </Button>
      <Button variant="secondary" block onClick={() => void copyCode()}>
        Copy code
      </Button>
    </div>
  );
}

function Members({ pool }: { pool: PoolState }) {
  const myKey = useStore((s) => s.myKey);
  const displayName = useStore((s) => s.displayName);
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
                {m === myKey ? `${displayName || "You"} (You)` : shortKey(m, 12)}{" "}
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
    <Card eyebrow="Send Value">
      <p className="hint" style={{ marginBottom: "var(--sp-4)" }}>
        Move Value to another member. Everyone sees the same result.{" "}
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
        label="Amount (Value)"
        type="number"
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

function ActiveVouchLiensCard({ pool, myKey }: { pool: PoolState; myKey: string }) {
  const displayName = useStore((s) => s.displayName);
  const liens = Object.entries(pool.vouchLiens).filter(
    ([invitee, lien]) => lien.inviter === myKey && pool.members.includes(invitee),
  );
  if (liens.length === 0) return null;
  return (
    <Card eyebrow="Active vouch liens">
      <ul className="list">
        {liens.map(([invitee, lien]) => (
          <li key={invitee}>
            <span className="mono">
              {invitee === myKey
                ? `${displayName || "You"} (You)`
                : shortKey(invitee, 12)}
            </span>
            <span>{formatPts(lien.amount)} Value pledged (forfeitable if expelled)</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PendingInvitesCard({ pool, myKey }: { pool: PoolState; myKey: string }) {
  const cancelInvite = useStore((s) => s.cancelInvite);
  const highlightAdmissionVote = useStore((s) => s.highlightAdmissionVote);
  const displayName = useStore((s) => s.displayName);
  const pending = Object.entries(pool.pendingInvites).filter(
    ([, inv]) => inv.inviter === myKey,
  );
  const totalStake = pool.members.reduce((sum, m) => sum + votingWeight(pool, m), 0n);
  const threshold = pool.parameters.approval_threshold;
  if (pending.length === 0) return null;
  return (
    <Card eyebrow="People waiting to join">
      <ul className="list">
        {pending.map(([invitee, inv]) => {
          const proposalId = admissionProposalId(invitee);
          const proposal = pool.proposals[proposalId];
          const approvalPct =
            proposal && totalStake > 0n
              ? Number((proposal.votesFor * 100n) / totalStake)
              : 0;
          const status = inv.admissionApproved
            ? "Approved — waiting for them to accept"
            : proposal?.executed
              ? "Approved"
              : `Admission vote ${approvalPct.toFixed(0)}% of stake (need ${threshold}%)`;
          return (
            <li key={invitee}>
              <span className="mono">
                {invitee === myKey
                  ? `${displayName || "You"} (You)`
                  : shortKey(invitee, 12)}
              </span>
              <span>{formatPts(inv.lienAmount)} Value pledged (lien)</span>
              <span className="muted">{status}</span>
              {!inv.admissionApproved && !proposal?.executed ? (
                <button
                  className="btn sm"
                  type="button"
                  onClick={() => highlightAdmissionVote(invitee)}
                >
                  Vote to admit
                </button>
              ) : null}
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
  onInvite: (
    pubkey: string,
    parameters?: Record<GovernanceParameter, number>,
  ) => Promise<void>;
}) {
  const controller = useStore((s) => s.controller)!;
  const pool = useStore((s) => s.pool)!;
  const sync = useStore((s) => s.sync);
  const myKey = useStore((s) => s.myKey);
  const displayName = useStore((s) => s.displayName);
  const shareUrl = useStore((s) => s.shareUrl);
  const toast = useStore((s) => s.toast);
  const [pubkey, setPubkey] = useState("");
  const lienAmount = requiredVouchLien(pool, myKey);
  const myBalance = pool.balances[myKey] ?? 0n;
  const lienPercent =
    myBalance > 0n ? Number((lienAmount * 10000n) / myBalance) / 100 : 0;
  const pledgeCapacity = availableToPledge(pool, myKey);
  const [showLink, setShowLink] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [inviteSignError, setInviteSignError] = useState(false);
  const [inviteDecay, setInviteDecay] = useState(pool.parameters.decay_rate);
  const [inviteInterval, setInviteInterval] = useState(pool.parameters.epoch_interval);
  const atCap = pool.members.length >= SOFT_CELL_CAP;
  const nearCap = pool.members.length >= SOFT_CELL_CAP - 10;

  useEffect(() => {
    if (!showLink) return;
    setInviteLink("");
    setInviteSignError(false);
    let cancelled = false;
    void controller
      .buildSignedInvitePayload(pool.cellName, controller.getInviteRelayUrls())
      .then((payload) => {
        if (!cancelled) {
          setInviteLink(buildInviteLink(payload, shareUrl ?? undefined));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setInviteSignError(true);
          toast("Could not sign invite link", "error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [showLink, controller, pool.cellName, toast, shareUrl]);

  const statusLine = connectionStatusMessage(sync?.overall, sync?.pendingOutbox ?? 0);

  return (
    <Card eyebrow="Invite people">
      {atCap ? (
        <div className="alert warning" style={{ marginBottom: "var(--sp-3)" }}>
          At capacity ({SOFT_CELL_CAP} members). New people join through linked chapters —
          start one from the banner above if you are Head.
        </div>
      ) : nearCap ? (
        <div className="alert info" style={{ marginBottom: "var(--sp-3)" }}>
          {pool.members.length} / {SOFT_CELL_CAP} members — plan a linked chapter soon.
        </div>
      ) : null}
      <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
        Send a link or QR. When they open it, tell you they're waiting — then vouch for
        them here. <HelpTip text={CONCEPT.vouch} />
      </p>
      <Button
        variant="secondary"
        block
        onClick={() => {
          setShowLink(true);
        }}
      >
        Invite people
      </Button>
      <p
        className="hint"
        style={{ marginTop: "var(--sp-4)", marginBottom: "var(--sp-2)" }}
      >
        <strong>Step 2:</strong> Someone opened your link? Paste their join code and
        vouch.
      </p>
      <Field
        label="Join code"
        hint="Paste the code from their Community tab."
        value={pubkey}
        onChange={(e) => setPubkey(e.target.value)}
        className="mono"
      />
      <p className="hint">
        This vouch pledges <strong>{lienPercent.toFixed(1)}%</strong> of your Share (
        {formatPts(lienAmount)} Value) as a forfeitable lien. Value stays in your wallet;
        you just can't spend or transfer it while the invite is pending.{" "}
        {formatPts(pledgeCapacity)} Value still available to pledge.
      </p>
      <Slider
        label="Invitee default annual circulation (%)"
        value={Math.round(inviteDecay * 10) / 10}
        min={0}
        max={20}
        step={0.1}
        onCommit={setInviteDecay}
      />
      <Slider
        label="Invitee default redistribution interval (minutes)"
        value={inviteInterval}
        min={MIN_EPOCH_INTERVAL_MINUTES}
        max={10_080}
        step={MIN_EPOCH_INTERVAL_MINUTES}
        onCommit={setInviteInterval}
      />
      <Button
        block
        disabled={!pubkey.trim() || atCap || lienAmount > pledgeCapacity}
        onClick={() => {
          void onInvite(pubkey.trim(), {
            ...pool.parameters,
            decay_rate: inviteDecay,
            epoch_interval: inviteInterval,
          });
          setPubkey("");
        }}
      >
        Vouch and send invite
      </Button>
      <p className="hint" style={{ marginTop: "var(--sp-3)" }}>
        {statusLine}
      </p>

      {showLink ? (
        <Modal title="Invite people" onClose={() => setShowLink(false)}>
          {inviteSignError ? (
            <p className="error-text" style={{ marginBottom: "var(--sp-3)" }}>
              Could not prepare invite link. Check your connection and try again.
            </p>
          ) : inviteLink ? (
            <>
              <p className="muted" style={{ marginBottom: "var(--sp-3)" }}>
                {displayName ? `${displayName} invites you to ` : "Join "}
                <strong>{pool.cellName}</strong>. Share this link or QR:
              </p>
              <div className="center" style={{ marginBottom: "var(--sp-3)" }}>
                <QRCode value={inviteLink} />
              </div>
              <div className="field">
                <textarea
                  className="textarea mono"
                  rows={3}
                  readOnly
                  value={inviteLink}
                />
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
            </>
          ) : (
            <p className="muted" role="status">
              Preparing invite link…
            </p>
          )}
        </Modal>
      ) : null}
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
            At capacity ({SOFT_CELL_CAP} members). New people join through linked chapters
            — start one if you are Head.
          </>
        ) : (
          <>
            {count} / {SOFT_CELL_CAP} members — AethelOS scales by linked chapters, not
            width.
          </>
        )}
        {isHead && (
          <button
            className="btn sm"
            style={{ marginLeft: "var(--sp-2)" }}
            onClick={() => setOpen(true)}
          >
            Spawn a chapter
          </button>
        )}
      </div>
      {open && (
        <Modal title="Start a linked chapter" onClose={() => setOpen(false)}>
          <p className="muted" style={{ marginBottom: "var(--sp-3)" }}>
            Creates a new community with you as founder. Link it back here when ready.
          </p>
          <Field
            label="Chapter name"
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
            Create chapter
          </Button>
        </Modal>
      )}
    </>
  );
}

function SubCellLinkageBanner({ pool }: { pool: PoolState }) {
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
      <strong>Link to parent:</strong> {parent.parentCellName}. In this sub-Cell, any
      member can propose joining the parent namespace. In the parent Cell, create a{" "}
      <em>Link a chapter</em> proposal with this community ID:
      <div
        className="mono faint"
        style={{ margin: "var(--sp-2) 0", wordBreak: "break-all" }}
      >
        {pool.namespaceId}
      </div>
      <div className="row">
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(pool.namespaceId);
            toast("Community ID copied", "success");
          }}
        >
          Copy this Community ID
        </Button>
        <Button
          size="sm"
          onClick={() => void joinSuperstructure(parent.parentNamespaceId)}
        >
          Propose join to parent
        </Button>
        <button className="btn ghost sm" onClick={() => clearSubCellParentContext()}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

function ChildCellsCard({ pool }: { pool: PoolState }) {
  const myKey = useStore((s) => s.myKey);
  const displayName = useStore((s) => s.displayName);
  const linkSubcell = useStore((s) => s.linkSubcell);
  const [childId, setChildId] = useState("");
  const children = pool.childCells ?? [];
  return (
    <Card eyebrow="Sub-Cells">
      <ul className="list">
        {children.map((id) => (
          <li key={id}>
            <span className="mono">
              {id === myKey ? `${displayName || "You"} (You)` : shortKey(id, 16)}
            </span>
          </li>
        ))}
      </ul>
      <p className="hint" style={{ margin: "var(--sp-3) 0" }}>
        Register a child community after its Head has genesis'd it:
      </p>
      <div className="row">
        <Field
          label="Propose linking a chapter"
          placeholder="Child community ID"
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
  const myKey = useStore((s) => s.myKey);
  const displayName = useStore((s) => s.displayName);
  const linkedPools = useStore((s) => s.linkedPools);
  const ids = [...pool.parentSuperstructures, ...(pool.childCells ?? [])];
  if (ids.length === 0) return null;

  return (
    <Card eyebrow="Linked communities">
      <ul className="list">
        {ids.map((id) => {
          const linked = linkedPools[id];
          const role = pool.parentSuperstructures.includes(id) ? "Parent" : "Child";
          const relayedPop = pool.childPopulation?.[id];
          const verifiedPop = linked?.members.length;
          const popMismatch =
            role === "Child" &&
            relayedPop !== undefined &&
            verifiedPop !== undefined &&
            relayedPop !== verifiedPop;
          return (
            <li key={id}>
              <span className="badge neutral">{role}</span>
              <span className="mono">
                {id === myKey ? `${displayName || "You"} (You)` : shortKey(id, 16)}
              </span>
              {linked ? (
                <span className="muted">
                  {linked.cellName || "—"} · {linked.members.length} members
                  {popMismatch ? (
                    <span className="warning"> (reported {relayedPop} — mismatch)</span>
                  ) : null}
                  {" · "}
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
  const displayName = useStore((s) => s.displayName);
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
              <span className="mono">
                {id === myKey ? `${displayName || "You"} (You)` : shortKey(id, 12)}
              </span>
              <span>{formatPts(pts)} Value held for bridge delivery</span>
            </li>
          ))}
        </ul>
      )}
      {isBridgeRole && linked ? (
        <>
          <p className="hint" style={{ marginBottom: "var(--sp-2)" }}>
            Propose a cross-community transfer. After stake-weighted approval, bridge
            members mirror it automatically on the linked namespace.
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
              label="Bridge amount (Value)"
              type="number"
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
        <p className="muted">
          Only bridge members can initiate cross-community transfers.
        </p>
      )}
    </Card>
  );
}
