import { relayOperatorGuideUrl } from "../../app/bootstrap-relays.js";

export function RelaySetupHelp({ compact = false }: { compact?: boolean }) {
  const guideUrl = relayOperatorGuideUrl();
  return (
    <div className="hint" style={{ marginTop: compact ? 0 : "var(--sp-2)" }}>
      <p style={{ margin: compact ? 0 : "0 0 var(--sp-2)" }}>
        Mailboxes are powerless — anyone can run one. Communities connect to several
        member-shared mailboxes for resilience. The desktop app can share yours
        automatically.
      </p>
      <a href={guideUrl} target="_blank" rel="noopener noreferrer">
        Run your own relay (5‑minute guide)
      </a>
    </div>
  );
}
