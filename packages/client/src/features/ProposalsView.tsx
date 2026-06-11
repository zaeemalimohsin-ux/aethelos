import { useState } from "react";
import type { PoolState, ProposalKind } from "@aethelos/core";
import { resolveGovernanceParameter, votingWeight } from "@aethelos/core";
import { useStore } from "../app/store.js";
import {
  ADVANCED_PROPOSAL_KINDS,
  COMMON_PROPOSAL_KINDS,
  PROPOSAL_HELP,
  PROPOSAL_LABELS,
} from "../app/concept-help.js";
import { Card } from "../design/components/Card.js";
import { Button } from "../design/components/Button.js";
import { Field } from "../design/components/Field.js";
import { MemberSelect } from "../design/components/MemberSelect.js";
import { Disclosure } from "../design/components/Disclosure.js";
import { HelpTip } from "../design/components/HelpTip.js";
import { shortKey } from "../app/format.js";

const MEMBER_KINDS = new Set<ProposalKind>([
  "admit_member",
  "resolve_fracture",
  "expel_member",
]);

export function ProposalsView({ pool }: { pool: PoolState }) {
  const myKey = useStore((s) => s.myKey);
  const isMember = pool.members.includes(myKey);
  const proposals = Object.values(pool.proposals);

  if (!isMember) {
    return (
      <Card eyebrow="Decisions">
        <p className="muted">Join the community to propose and vote.</p>
      </Card>
    );
  }

  return (
    <div className="stack">
      {pool.fractures.length > 0 && (
        <div className="alert danger">
          {pool.fractures.length} account(s) paused after suspicious activity. Propose to
          unfreeze or remove them.
        </div>
      )}
      <CreateProposal pool={pool} />
      <Disclosure summary="Advanced: parent & sub-communities">
        <SuperstructureCard pool={pool} />
      </Disclosure>
      <Card eyebrow="Open decisions">
        {proposals.length === 0 ? (
          <p className="muted">Nothing open yet — create a proposal above.</p>
        ) : (
          <div className="stack">
            {proposals.map((p) => (
              <ProposalRow key={p.id} proposal={p} pool={pool} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function CreateProposal({ pool }: { pool: PoolState }) {
  const create = useStore((s) => s.createProposal);
  const [kind, setKind] = useState<ProposalKind>("resolve_fracture");
  const [memberTarget, setMemberTarget] = useState("");
  const [idTarget, setIdTarget] = useState("");
  const needsMember = MEMBER_KINDS.has(kind);

  return (
    <Card eyebrow="Propose something">
      <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
        One-off community decisions. Votes use stake weight until enough approve.{" "}
        <HelpTip text={PROPOSAL_HELP[kind]} />
      </p>
      <div className="field">
        <label htmlFor="kind">What kind?</label>
        <select
          id="kind"
          className="select"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as ProposalKind);
            setMemberTarget("");
            setIdTarget("");
          }}
        >
          {COMMON_PROPOSAL_KINDS.map((k) => (
            <option key={k} value={k}>
              {PROPOSAL_LABELS[k]}
            </option>
          ))}
          {ADVANCED_PROPOSAL_KINDS.map((k) => (
            <option key={k} value={k}>
              {PROPOSAL_LABELS[k]} (advanced)
            </option>
          ))}
        </select>
      </div>
      {needsMember ? (
        <MemberSelect
          label="About who?"
          members={pool.members}
          value={memberTarget}
          onChange={setMemberTarget}
        />
      ) : (
        <Field
          label="Community ID"
          hint="Paste the ID from the other community's screen."
          value={idTarget}
          onChange={(e) => setIdTarget(e.target.value)}
          className="mono"
        />
      )}
      <Button
        disabled={needsMember ? !memberTarget : !idTarget.trim()}
        onClick={() => {
          void create(kind, { target: (needsMember ? memberTarget : idTarget).trim() });
          setMemberTarget("");
          setIdTarget("");
        }}
      >
        Start proposal
      </Button>
    </Card>
  );
}

function ProposalRow({
  proposal,
  pool,
}: {
  proposal: PoolState["proposals"][string];
  pool: PoolState;
}) {
  const myKey = useStore((s) => s.myKey);
  const vote = useStore((s) => s.voteProposal);
  const controller = useStore((s) => s.controller);
  const totalStake = pool.members.reduce((sum, m) => sum + votingWeight(pool, m), 0n);
  const approvalPct =
    totalStake > 0n ? Number((proposal.votesFor * 100n) / totalStake) : 0;
  const threshold = resolveGovernanceParameter(pool, "approval_threshold");
  const isHead = pool.head === myKey;

  return (
    <div className="card" style={{ background: "var(--bg)" }}>
      <div className="row between">
        <strong>{PROPOSAL_LABELS[proposal.kind]}</strong>
        <span className="row" style={{ gap: "var(--sp-2)" }}>
          {proposal.executed && <span className="badge success">Done</span>}
          {proposal.closed && !proposal.executed && (
            <span className="badge neutral">Closed</span>
          )}
          {!proposal.closed && <span className="badge warning">Voting</span>}
        </span>
      </div>
      <p className="mono faint" style={{ margin: "var(--sp-2) 0" }}>
        {proposal.kind === "bridge_transfer" ? (
          <>
            {shortKey(proposal.data["target"] ?? "", 12)} →{" "}
            {shortKey(proposal.data["to"] ?? "", 12)} · {proposal.data["amount"] ?? "0"}{" "}
            pts
          </>
        ) : proposal.data["target"] ? (
          shortKey(proposal.data["target"], 12)
        ) : (
          "—"
        )}
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.round(approvalPct))}
        aria-label="Stake-weighted approval"
        style={{
          height: 6,
          background: "var(--surface-2)",
          borderRadius: 3,
          overflow: "hidden",
          marginBottom: "var(--sp-2)",
        }}
      >
        <div
          style={{
            width: `${Math.min(100, approvalPct)}%`,
            height: "100%",
            background:
              approvalPct >= threshold ? "var(--color-success)" : "var(--color-accent)",
          }}
        />
      </div>
      <p className="hint">
        {approvalPct.toFixed(0)}% of stake approves (need {threshold.toFixed(0)}%) · by{" "}
        {shortKey(proposal.author, 8)}
      </p>
      {!proposal.closed && (
        <div className="row" style={{ marginTop: "var(--sp-3)" }}>
          <Button size="sm" onClick={() => void vote(proposal.id, true)}>
            Approve
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void vote(proposal.id, false)}
          >
            Reject
          </Button>
          {isHead && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void controller?.closeProposal(proposal.id)}
            >
              Close
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function SuperstructureCard({ pool }: { pool: PoolState }) {
  const myKey = useStore((s) => s.myKey);
  const join = useStore((s) => s.joinSuperstructure);
  const leave = useStore((s) => s.leaveSuperstructure);
  const isHead = pool.head === myKey;
  const [id, setId] = useState("");
  return (
    <>
      {pool.parentSuperstructures.length > 0 ? (
        <ul className="list">
          {pool.parentSuperstructures.map((s) => (
            <li key={s}>
              <span className="mono">{shortKey(s, 12)}</span>
              <button className="btn ghost sm" onClick={() => void leave(s)}>
                Propose leave
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted" style={{ marginBottom: "var(--sp-3)" }}>
          Link upward to a parent community, or register sub-communities you spawn. Linked
          pools sync in the background when connected.
        </p>
      )}
      <Field
        label="Parent community ID"
        hint="Only the Head can propose joining."
        value={id}
        onChange={(e) => setId(e.target.value)}
        className="mono"
        disabled={!isHead}
      />
      <Button
        variant="secondary"
        disabled={!isHead || !id.trim()}
        onClick={() => {
          void join(id.trim());
          setId("");
        }}
      >
        Propose join to parent
      </Button>
      {!isHead && (
        <p className="hint" style={{ marginTop: "var(--sp-2)" }}>
          Only the Head can start this proposal.
        </p>
      )}
    </>
  );
}
