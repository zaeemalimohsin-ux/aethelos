import { useStore } from "../app/store.js";

export function SyncIndicator() {
  const sync = useStore((s) => s.sync);
  const status = sync?.overall ?? "offline";
  const label =
    status === "online" ? "Connected" : status === "connecting" ? "Syncing…" : "Offline";
  return (
    <span
      className="row"
      style={{ gap: "var(--sp-2)", fontSize: "var(--fs-xs)" }}
      role="status"
      aria-live="polite"
    >
      <span className={`dot ${status}`} aria-hidden="true" />
      <span className="muted">{label}</span>
      {sync && sync.pendingOutbox > 0 ? (
        <span className="badge warning">{sync.pendingOutbox} queued</span>
      ) : null}
    </span>
  );
}
