import { useState } from "react";
import { useStore } from "../app/store.js";
import { Button } from "../design/components/Button.js";
import { Disclosure } from "../design/components/Disclosure.js";
import { HelpTip } from "../design/components/HelpTip.js";
import { RelaySetupHelp } from "../design/components/RelaySetupHelp.js";
import { isValidRelayUrl } from "../app/session.js";
import { isDesktopApp } from "../app/local-node.js";
import { CONCEPT_NETWORK } from "../app/concept-help.js";
import { tunnelStatusMessage } from "../app/active-relays.js";
import { ShareLinkPanel } from "./ShareLinkPanel.js";

export function NetworkAdvancedPanel() {
  const controller = useStore((s) => s.controller);
  const sync = useStore((s) => s.sync);
  const pool = useStore((s) => s.pool);
  const relaySharing = useStore((s) => s.relaySharing);
  const tunnelStatus = useStore((s) => s.tunnelStatus);
  const setRelaySharing = useStore((s) => s.setRelaySharing);
  const addRelay = useStore((s) => s.addRelay);
  const removeRelay = useStore((s) => s.removeRelay);
  const setView = useStore((s) => s.setView);
  const [url, setUrl] = useState("");
  const [relayError, setRelayError] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const desktop = isDesktopApp();
  if (!controller) {
    return <p className="muted">Join or start a community to manage network settings.</p>;
  }
  const relays =
    sync?.relays ??
    controller?.getRelayUrls().map((u) => ({ url: u, status: "offline" as const })) ??
    [];
  const communityCount = pool?.communityRelays?.length ?? 0;
  const onlineCount = relays.filter((r) => r.status === "online").length;

  return (
    <div className="stack" data-testid="network-advanced-panel">
      <p className="hint">
        {CONCEPT_NETWORK} <HelpTip text={CONCEPT_NETWORK} />
      </p>
      <p className="hint">
        Community endpoints: {communityCount || "none published yet"} · connected to{" "}
        {onlineCount} of {relays.length}.
      </p>
      {sync?.relays.length ? (
        <p className="hint mono faint" style={{ fontSize: "var(--fs-xs)" }}>
          {sync.relays.map((r) => `${r.url}: ${r.status}`).join("\n")}
        </p>
      ) : null}
      {desktop ? (
        <>
          <ShareLinkPanel />
          <div
            className="row"
            style={{ marginBottom: "var(--sp-2)", alignItems: "center" }}
          >
            <span className="muted">Host from this computer</span>
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
          <Disclosure summary="Hosting details">
            <p className="hint" style={{ marginBottom: "var(--sp-2)" }}>
              Your PC must stay awake while hosting. Public addresses may change after
              restart — toggle hosting off and on to refresh.
            </p>
          </Disclosure>
        </>
      ) : null}
      <Disclosure summary="Manage connection endpoints">
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
                aria-label={`Remove endpoint ${r.url}`}
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
                setRelayError("Enter a valid ws:// or wss:// address.");
                return;
              }
              setRelayError("");
              addRelay(trimmed);
              setUrl("");
            }}
          >
            Add endpoint
          </Button>
        </div>
        {relayError ? <p className="error-text">{relayError}</p> : null}
        <RelaySetupHelp />
      </Disclosure>
      <Button variant="ghost" size="sm" onClick={() => setView("cell")}>
        Back to Community
      </Button>
    </div>
  );
}
