import type { PoolState, GovernanceParameter, PublicKeyHex } from "@aethelos/core";
import {
  DEFAULT_PARAMETERS,
  MIN_EPOCH_INTERVAL_MINUTES,
  formatIntervalMinutes,
  formatPointsAmount,
  resolveVouchHead,
  votingWeight,
  livenessWindowMs,
  isLiveSoul,
  MS_PER_MINUTE,
} from "@aethelos/core";
import { useStore } from "../app/store.js";
import { useCirculationCountdown } from "../app/useCirculationCountdown.js";
import { CONCEPT, GOVERNANCE_HELP } from "../app/concept-help.js";
import { Card } from "../design/components/Card.js";
import { Slider } from "../design/components/Slider.js";
import { HelpTip } from "../design/components/HelpTip.js";
import { shortKey } from "../app/format.js";

const PARAM_LABELS: Record<GovernanceParameter, string> = {
  decay_rate: "Annual circulation (%)",
  approval_threshold: "Votes needed to pass a proposal",
  vouch_threshold: "Trust needed to elect the Head",
  epoch_interval: "Minutes between redistribution",
  vouch_bond_rate: "Default size of invite bonds",
};

function sliderMax(p: GovernanceParameter): number {
  if (p === "epoch_interval") return 10_080;
  if (p === "decay_rate") return 20;
  return 100;
}

function sliderStep(p: GovernanceParameter): number {
  if (p === "decay_rate") return 0.1;
  if (p === "epoch_interval") return MIN_EPOCH_INTERVAL_MINUTES;
  return 1;
}

function sliderValue(pool: PoolState, myKey: string, p: GovernanceParameter): number {
  const raw = pool.governanceSliders[myKey]?.[p] ?? pool.parameters[p];
  if (p === "decay_rate") return Math.round(raw * 10) / 10;
  if (p === "epoch_interval") {
    return Math.round(raw / MIN_EPOCH_INTERVAL_MINUTES) * MIN_EPOCH_INTERVAL_MINUTES;
  }
  return Math.round(raw);
}

function vouchScores(pool: PoolState): {
  scores: Map<PublicKeyHex, number>;
  totalWeight: number;
} {
  const members = pool.members.filter((m) => !pool.frozen.includes(m));
  const scores = new Map<PublicKeyHex, number>();
  let totalWeight = 0;
  for (const voter of members) {
    const voterWeight = Number(votingWeight(pool, voter));
    totalWeight += voterWeight;
    const sliders = pool.vouchSliders[voter] ?? {};
    for (const [target, weight] of Object.entries(sliders)) {
      if (target === voter) continue;
      scores.set(target, (scores.get(target) ?? 0) + weight * voterWeight);
    }
  }
  return { scores, totalWeight };
}

function headElectionSummary(pool: PoolState): {
  resolvedHead: PublicKeyHex | null;
  leaderScore: number;
  thresholdScore: number;
  maxPossible: number;
} {
  const { scores, totalWeight } = vouchScores(pool);
  const threshold = pool.parameters.vouch_threshold;
  const maxPossible = totalWeight * 100;
  const thresholdScore = maxPossible > 0 ? (threshold / 100) * maxPossible : 0;
  const resolvedHead = resolveVouchHead(pool);
  let leaderScore = 0;
  for (const score of scores.values()) {
    if (score > leaderScore) leaderScore = score;
  }
  if (resolvedHead) {
    leaderScore = Math.max(leaderScore, scores.get(resolvedHead) ?? 0);
  }
  return { resolvedHead, leaderScore, thresholdScore, maxPossible };
}

export function GovernanceView({ pool }: { pool: PoolState }) {
  const myKey = useStore((s) => s.myKey);
  const updateSlider = useStore((s) => s.updateSlider);
  const updateVouch = useStore((s) => s.updateVouch);
  const params = Object.keys(DEFAULT_PARAMETERS) as GovernanceParameter[];
  const isMember = pool.members.includes(myKey);
  const countdown = useCirculationCountdown(pool);
  const livenessMinutes = Math.round(livenessWindowMs(pool) / MS_PER_MINUTE);
  const liveCount = pool.members.filter((m) =>
    isLiveSoul(pool, m, Date.now()),
  ).length;

  if (!isMember) {
    return (
      <Card eyebrow="Governance">
        <p className="muted">Join the community to help shape the rules.</p>
      </Card>
    );
  }

  const annualCirculation = pool.parameters.decay_rate;
  const intervalMinutes = pool.parameters.epoch_interval;
  const intervalLabel = formatIntervalMinutes(intervalMinutes);
  const headSummary = headElectionSummary(pool);
  const headProgress =
    headSummary.maxPossible > 0
      ? Math.min(100, (headSummary.leaderScore / headSummary.thresholdScore) * 100)
      : 0;

  return (
    <div className="stack">
      <Card eyebrow="Community rules" title="Your voice shapes the average">
        <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
          Move a slider to where you think the rule should sit. The community's actual
          rule is the stake-weighted average of everyone's choice.{" "}
          <HelpTip text={CONCEPT.proposal} />
        </p>
        {params.map((p) => (
          <Slider
            key={p}
            label={PARAM_LABELS[p]}
            help={GOVERNANCE_HELP[p]}
            value={sliderValue(pool, myKey, p)}
            min={p === "epoch_interval" ? MIN_EPOCH_INTERVAL_MINUTES : 0}
            max={sliderMax(p)}
            step={sliderStep(p)}
            onCommit={(v) => void updateSlider(p, v)}
          />
        ))}
        <p className="hint" style={{ marginTop: "var(--sp-3)" }}>
          Right now: {annualCirculation.toFixed(1)}% per year accrues continuously on
          activity · redistribution every {intervalLabel} ·{" "}
          {pool.parameters.approval_threshold.toFixed(0)}% to pass proposals. Commons
          pool: {formatPointsAmount(pool.commons)} pts. <HelpTip text={CONCEPT.epoch} />
        </p>
        {countdown.label ? (
          <p className={`hint${countdown.due ? " warning" : ""}`}>{countdown.label}</p>
        ) : null}
        <p className="hint" style={{ marginTop: "var(--sp-2)" }}>
          Liveness: stay active within {livenessMinutes} minutes to keep your equal share
          of redistribution ({liveCount} of {pool.members.length} members live now).{" "}
          <HelpTip text={CONCEPT.epoch} />
        </p>
      </Card>

      <Card eyebrow="Direct your flow" title="Redistribution targets">
        <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
          Each redistribution flush shares out accumulated commons. Direct where your
          share should go — one person, one equal weight in the average.{" "}
          <HelpTip text={CONCEPT.epoch} />
        </p>
        {pool.members.map((m) => (
          <Slider
            key={m}
            label={m === myKey ? "Myself" : `Member ${shortKey(m, 8)}`}
            value={pool.redistributionSliders[myKey]?.[m] ?? 0}
            onCommit={(v) => void updateSlider("redistribution", v, m)}
          />
        ))}
      </Card>

      <Card eyebrow="Who leads?" title="Vouch for the Head">
        <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
          Point your trust at someone you want coordinating certain proposals. You cannot
          vouch for yourself. <HelpTip text={CONCEPT.head} />
        </p>
        {headSummary.resolvedHead ? (
          <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
            Current Head:{" "}
            <span className="mono">
              {headSummary.resolvedHead === myKey
                ? "You"
                : shortKey(headSummary.resolvedHead, 12)}
            </span>
            {" · "}
            Trust toward election: {Math.round(headProgress)}% of{" "}
            {pool.parameters.vouch_threshold.toFixed(0)}% needed
          </p>
        ) : (
          <p className="hint warning" style={{ marginBottom: "var(--sp-3)" }}>
            No Head currently holds enough trust — proposals still run; only Head-only
            close actions wait until support re-forms.
          </p>
        )}
        {pool.members
          .filter((m) => m !== myKey)
          .map((m) => (
            <Slider
              key={m}
              label={`Member ${shortKey(m, 8)}`}
              value={pool.vouchSliders[myKey]?.[m] ?? 0}
              onCommit={(v) => void updateVouch(m, v)}
            />
          ))}
        {pool.members.length <= 1 && <p className="muted">No other members yet.</p>}
      </Card>
    </div>
  );
}
