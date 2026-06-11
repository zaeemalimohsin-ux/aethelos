import { useEffect, useState } from "react";
import { useStore, type View } from "./app/store.js";
import { applySwUpdate, onSwUpdateReady } from "./app/sw-update.js";
import { Onboarding } from "./features/Onboarding.js";
import { CellView } from "./features/CellView.js";
import { GovernanceView } from "./features/GovernanceView.js";
import { ProposalsView } from "./features/ProposalsView.js";
import { IdentityView } from "./features/IdentityView.js";
import { ToastHost } from "./components/ToastHost.js";
import { SyncIndicator } from "./components/SyncIndicator.js";

const NAV: { id: View; label: string }[] = [
  { id: "cell", label: "Community" },
  { id: "governance", label: "Governance" },
  { id: "proposals", label: "Proposals" },
  { id: "identity", label: "Identity" },
];

export function App() {
  const init = useStore((s) => s.init);
  const phase = useStore((s) => s.phase);
  const [swUpdateReady, setSwUpdateReady] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => onSwUpdateReady(() => setSwUpdateReady(true)), []);

  return (
    <>
      {swUpdateReady ? (
        <div className="alert info" style={{ margin: 0, borderRadius: 0 }}>
          A new version is available.{" "}
          <button type="button" className="btn sm" onClick={() => applySwUpdate()}>
            Reload now
          </button>
        </div>
      ) : null}
      {phase === "loading" ? (
        <div className="app-main center" style={{ paddingTop: "var(--sp-8)" }}>
          <p className="muted">Loading…</p>
        </div>
      ) : phase === "ready" ? (
        <MainApp />
      ) : (
        <Onboarding />
      )}
      <ToastHost />
    </>
  );
}

function MainApp() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const pool = useStore((s) => s.pool);

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="brand">
          Aethel<span>OS</span>
          {pool?.cellName ? <span className="muted"> · {pool.cellName}</span> : null}
        </span>
        <SyncIndicator />
      </header>
      <main className="app-main">
        <nav className="app-nav" aria-label="Sections">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`tab ${view === n.id ? "active" : ""}`}
              aria-current={view === n.id ? "page" : undefined}
              onClick={() => setView(n.id)}
            >
              {n.label}
            </button>
          ))}
        </nav>
        {!pool ? (
          <p className="muted">Syncing community state…</p>
        ) : view === "cell" ? (
          <CellView pool={pool} />
        ) : view === "governance" ? (
          <GovernanceView pool={pool} />
        ) : view === "proposals" ? (
          <ProposalsView pool={pool} />
        ) : (
          <IdentityView />
        )}
      </main>
    </div>
  );
}
