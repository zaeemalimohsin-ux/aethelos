import type { PoolState, GovernanceParameter } from "@aethelos/core";
import { DEFAULT_PARAMETERS, MIN_EPOCH_INTERVAL_MINUTES, formatIntervalMinutes, formatPointsAmount } from "@aethelos/core";
import { useStore } from "../app/store.js";
import { useCirculationCountdown } from "../app/useCirculationCountdown.js";
import { CONCEPT, GOVERNANCE_HELP } from "../app/concept-help.js";
import { Card } from "../design/components/Card.js";
import { Slider } from "../design/components/Slider.js";
import { HelpTip } from "../design/components/HelpTip.js";
import { Disclosure } from "../design/components/Disclosure.js";
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

export function GovernanceView({ pool }: { pool: PoolState }) {
  const myKey = useStore((s) => s.myKey);
  const updateSlider = useStore((s) => s.updateSlider);
  const updateVouch = useStore((s) => s.updateVouch);
  const params = Object.keys(DEFAULT_PARAMETERS) as GovernanceParameter[];
  const isMember = pool.members.includes(myKey);
  const countdown = useCirculationCountdown(pool);

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
      </Card>

      <Card eyebrow="Who leads?" title="Vouch for the Head">
        <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
          Point your trust at someone you want coordinating certain proposals. You cannot
          vouch for yourself. <HelpTip text={CONCEPT.head} />
        </p>
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

      <Disclosure summary="Advanced: redistribution sliders">
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
      </Disclosure>
    </div>
  );
}
