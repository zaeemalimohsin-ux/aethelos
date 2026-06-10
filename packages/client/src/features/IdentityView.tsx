import { useEffect, useState } from "react";
import { useStore } from "../app/store.js";
import { Card } from "../design/components/Card.js";
import { Button } from "../design/components/Button.js";
import {
  exportIdentityFile,
  importIdentityFile,
  getIdentity,
} from "../storage/keystore.js";
import { collectDiagnostics } from "../app/diagnostics.js";
import { WIRE_VERSION } from "@aethelos/core";

function download(filename: string, content: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function IdentityView() {
  const myKey = useStore((s) => s.myKey);
  const displayName = useStore((s) => s.displayName);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const lock = useStore((s) => s.lock);
  const controller = useStore((s) => s.controller);
  const toast = useStore((s) => s.toast);
  const [backedUp, setBackedUp] = useState<boolean | null>(null);

  useEffect(() => {
    void getIdentity(myKey).then((i) => setBackedUp(i?.backedUp ?? null));
  }, [myKey]);

  return (
    <div className="stack">
      <Card eyebrow="Identity">
        <ul className="list">
          <li>
            <span className="muted">Display name</span>
            <span>{displayName || "—"}</span>
          </li>
          <li>
            <span className="muted">Public key</span>
            <span className="mono">{myKey}</span>
          </li>
          <li>
            <span className="muted">Recovery phrase</span>
            <span>
              {backedUp === false ? (
                <span className="badge warning">Not confirmed</span>
              ) : (
                <span className="badge success">Backed up</span>
              )}
            </span>
          </li>
        </ul>
        <div className="row" style={{ marginTop: "var(--sp-3)" }}>
          <Button
            variant="secondary"
            onClick={async () => {
              const data = await exportIdentityFile(myKey);
              if (data) {
                download(`aethelos-identity-${myKey.slice(0, 8)}.json`, data);
                toast("Identity exported (encrypted)", "success");
              }
            }}
          >
            Export identity
          </Button>
          <label className="btn ghost" style={{ cursor: "pointer" }}>
            Import identity
            <input
              type="file"
              accept="application/json"
              style={{ display: "none" }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const text = await file.text();
                const res = await importIdentityFile(text);
                toast(
                  res ? "Identity imported" : "Invalid identity file",
                  res ? "success" : "error",
                );
              }}
            />
          </label>
        </div>
      </Card>

      <Card eyebrow="Data & diagnostics">
        <div className="row">
          <Button
            variant="secondary"
            disabled={!controller}
            onClick={async () => {
              const log = await controller!.exportLog();
              download(
                `aethelos-eventlog-${controller!.getNamespaceId().slice(0, 8)}.json`,
                log,
              );
              toast("Event log exported", "success");
            }}
          >
            Export event log
          </Button>
          <label className="btn ghost" style={{ cursor: controller ? "pointer" : "not-allowed" }}>
            Import event log
            <input
              type="file"
              accept="application/json"
              disabled={!controller}
              style={{ display: "none" }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file || !controller) return;
                try {
                  const text = await file.text();
                  const { imported, skipped } = await controller.importLog(text);
                  const detail =
                    skipped > 0
                      ? `${imported} imported, ${skipped} skipped`
                      : `${imported} events imported`;
                  toast(detail, imported > 0 ? "success" : "error");
                } catch (err) {
                  toast(err instanceof Error ? err.message : "Import failed", "error");
                }
              }}
            />
          </label>
          <Button
            variant="ghost"
            onClick={() => {
              download(
                "aethelos-diagnostics.json",
                JSON.stringify(collectDiagnostics(), null, 2),
              );
            }}
          >
            Export diagnostics
          </Button>
        </div>
        <p className="hint" style={{ marginTop: "var(--sp-3)" }}>
          Your full event log lives on this device. Exporting it lets you reconstitute
          your community on any relay — capturing one node achieves nothing.
        </p>
      </Card>

      <Card eyebrow="Preferences">
        <div className="row between">
          <span>Theme</span>
          <div className="row">
            <button
              className={`tab ${theme === "dark" ? "active" : ""}`}
              onClick={() => setTheme("dark")}
            >
              Dark
            </button>
            <button
              className={`tab ${theme === "light" ? "active" : ""}`}
              onClick={() => setTheme("light")}
            >
              Light
            </button>
          </div>
        </div>
        <div className="row" style={{ marginTop: "var(--sp-4)" }}>
          <Button variant="danger" onClick={lock}>
            Lock session
          </Button>
        </div>
      </Card>

      <Card eyebrow="Help & about">
        <p className="muted" style={{ marginBottom: "var(--sp-2)" }}>
          New here? The User Guide walks through identities, invites, governance, and
          staying resilient.
        </p>
        <ul className="list">
          <li>
            <span className="muted">User guide</span>
            <a
              href="https://github.com/aethelos/aethelos/blob/main/docs/USER_GUIDE.md"
              target="_blank"
              rel="noreferrer"
            >
              Open
            </a>
          </li>
          <li>
            <span className="muted">Recovery phrase</span>
            <span>Your only backup — keep it safe and never share it.</span>
          </li>
          <li>
            <span className="muted">App / wire version</span>
            <span className="mono">0.1.0 / wire {WIRE_VERSION}</span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
