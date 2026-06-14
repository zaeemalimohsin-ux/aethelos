import { useEffect, useState } from "react";
import { isDesktopApp } from "../app/local-node.js";
import { Button } from "../design/components/Button.js";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallHint() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isDesktopApp()) return;
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (isDesktopApp() || !deferred || dismissed) return null;

  return (
    <div className="alert info" style={{ marginBottom: "var(--sp-3)" }}>
      <p className="hint" style={{ marginBottom: "var(--sp-2)" }}>
        Install AethelOS on this device for quick access from your home screen.
      </p>
      <div className="row">
        <Button
          size="sm"
          onClick={async () => {
            await deferred.prompt();
            setDismissed(true);
          }}
        >
          Install app
        </Button>
        <button className="btn ghost sm" type="button" onClick={() => setDismissed(true)}>
          Not now
        </button>
      </div>
    </div>
  );
}
