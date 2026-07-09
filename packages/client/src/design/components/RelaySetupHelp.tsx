import { relayOperatorGuideUrl } from "../../app/bootstrap-relays.js";

export function RelaySetupHelp({ compact = false }: { compact?: boolean }) {
  const guideUrl = relayOperatorGuideUrl();
  return (
    <div className="hint" style={{ marginTop: compact ? 0 : "var(--sp-2)" }}>
      <p style={{ margin: compact ? 0 : "0 0 var(--sp-2)" }}>
        Connection points only carry messages — they cannot change balances or rules.
        Communities use several for resilience. The desktop app can share yours
        automatically.
      </p>
      <a href={guideUrl} target="_blank" rel="noopener noreferrer">
        Run your own connection point (5‑minute guide)
      </a>
    </div>
  );
}
