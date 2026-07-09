import { useEffect, useState, Component, type ErrorInfo, type ReactNode } from "react";
import { useStore, type View } from "./app/store.js";
import { applySwUpdate, onSwUpdateReady } from "./app/sw-update.js";
import { Onboarding } from "./features/Onboarding.js";
import { CellView } from "./features/CellView.js";
import { GovernanceView } from "./features/GovernanceView.js";
import { ProposalsView } from "./features/ProposalsView.js";
import { IdentityView } from "./features/IdentityView.js";
import { ToastHost } from "./components/ToastHost.js";
import { SyncIndicator } from "./components/SyncIndicator.js";

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[aethelos] UI error", error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="app-main center" style={{ padding: "var(--sp-6)" }}>
          <h1>Something went wrong</h1>
          <p className="muted">
            Reload the page. Your community data is stored locally and should be safe.
          </p>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
          <p className="muted" role="status">
            Loading…
          </p>
        </div>
      ) : phase === "ready" ? (
        <AppErrorBoundary>
          <MainApp />
        </AppErrorBoundary>
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
  const session = useStore((s) => s.session);
  const myKey = useStore((s) => s.myKey);
  const isWaitingMember = pool && myKey && !pool.members.includes(myKey);

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="brand">
          Aethel<span>OS</span>
          {pool?.cellName ? <span className="muted"> · {pool.cellName}</span> : null}
          {isWaitingMember ? (
            <span className="badge neutral" style={{ marginLeft: "var(--sp-2)" }}>
              Waiting to join
            </span>
          ) : null}
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
          <p className="muted" role="status">
            {session
              ? `Loading ${session.displayName}'s community…`
              : "Loading your community…"}
          </p>
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
