import { useState } from "react";
import { useStore } from "../app/store.js";
import { Button } from "../design/components/Button.js";
import { QRCode } from "../components/QRCode.js";
import { isDesktopApp } from "../app/local-node.js";

export function ShareLinkPanel({ compact = false }: { compact?: boolean }) {
  const shareUrl = useStore((s) => s.shareUrl);
  const ensureDesktopShare = useStore((s) => s.ensureDesktopShare);
  const toast = useStore((s) => s.toast);
  const [shareBusy, setShareBusy] = useState(false);

  if (!isDesktopApp()) return null;

  return (
    <div
      data-testid="share-link-panel"
      style={{ marginBottom: compact ? "var(--sp-3)" : "var(--sp-3)" }}
    >
      <p className="hint" style={{ marginBottom: "var(--sp-2)" }}>
        <strong>Public app address (for operators)</strong> — open on another device to
        reach this host.
      </p>
      {shareUrl ? (
        <>
          <div className="center" style={{ marginBottom: "var(--sp-2)" }}>
            <QRCode value={shareUrl} size={compact ? 140 : 160} />
          </div>
          <textarea
            className="textarea mono"
            rows={2}
            readOnly
            value={shareUrl}
            data-testid="share-url"
          />
          <Button
            block
            style={{ marginTop: "var(--sp-2)" }}
            onClick={async () => {
              await navigator.clipboard.writeText(shareUrl);
              toast("Public address copied", "success");
            }}
          >
            Copy public address
          </Button>
        </>
      ) : (
        <Button
          block
          disabled={shareBusy}
          onClick={async () => {
            setShareBusy(true);
            await ensureDesktopShare();
            setShareBusy(false);
          }}
        >
          {shareBusy ? "Getting public address…" : "Get public address"}
        </Button>
      )}
    </div>
  );
}
