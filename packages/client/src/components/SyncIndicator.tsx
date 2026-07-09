import { useStore } from "../app/store.js";

export function SyncIndicator() {
  const sync = useStore((s) => s.sync);
  const setView = useStore((s) => s.setView);
  const status = sync?.overall ?? "offline";
  const label =
    status === "online"
      ? "Connected"
      : status === "connecting"
        ? "Connecting…"
        : "Offline";
  return (
    <button
      type="button"
      className="btn ghost sm sync-indicator-btn"
      style={{ gap: "var(--sp-2)", fontSize: "var(--fs-xs)" }}
      onClick={() => setView("connection")}
      aria-label={`${label}. Open connection settings.`}
    >
      <span className={`dot ${status}`} aria-hidden="true" />
      <span className="muted">{label}</span>
      {sync && sync.pendingOutbox > 0 ? (
        <span className="badge warning">{sync.pendingOutbox} queued</span>
      ) : null}
    </button>
  );
}
