import { useStore } from "../app/store.js";

export function SyncIndicator() {
  const sync = useStore((s) => s.sync);
  const status = sync?.overall ?? "offline";
  const online = sync?.relays.filter((r) => r.status === "online").length ?? 0;
  const total = sync?.relays.length ?? 0;
  const label =
    status === "online"
      ? `Online (${online}/${total} relays)`
      : status === "connecting"
        ? "Connecting…"
        : "Offline";
  return (
    <span
      className="row"
      style={{ gap: "var(--sp-2)", fontSize: "var(--fs-xs)" }}
      title={sync?.relays.map((r) => `${r.url}: ${r.status}`).join("\n") ?? "No relays"}
    >
      <span className={`dot ${status}`} aria-hidden="true" />
      <span className="muted">{label}</span>
      {sync && sync.pendingOutbox > 0 ? (
        <span className="badge warning">{sync.pendingOutbox} queued</span>
      ) : null}
    </span>
  );
}
