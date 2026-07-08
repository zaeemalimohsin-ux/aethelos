import { useState, useEffect } from "react";
import { useStore } from "../app/store.js";
import { clearSession } from "../app/session.js";
import { Card } from "../design/components/Card.js";
import { Button } from "../design/components/Button.js";
import { Field } from "../design/components/Field.js";
import { isValidMnemonic } from "../storage/keystore.js";
import { isValidRelayUrl, defaultRelay } from "../app/session.js";
import { isDesktopApp } from "../app/local-node.js";
import { shortKey } from "../app/format.js";
import { Disclosure } from "../design/components/Disclosure.js";
import { parseInviteInput, type InvitePayload } from "../app/invite.js";
import { PwaInstallHint } from "../components/PwaInstallHint.js";

import { loadBootstrapRelay, saveBootstrapRelay } from "../app/session-storage.js";

type Step =
  | "welcome"
  | "create"
  | "restore"
  | "choose"
  | "start"
  | "joinPaste"
  | "join"
  | "lostDevice"
  | "recoverMethod"
  | "importLog";

export function Onboarding() {
  const phase = useStore((s) => s.phase);
  const newMnemonic = useStore((s) => s.newMnemonic);
  const pendingInvite = useStore((s) => s.pendingInvite);
  const myKey = useStore((s) => s.myKey);

  if (newMnemonic) return <BackupScreen mnemonic={newMnemonic} />;
  if (phase === "locked") return <UnlockScreen />;
  const initialStep: Step = pendingInvite ? "join" : myKey ? "choose" : "welcome";
  return <OnboardingWizard initialStep={initialStep} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-main" style={{ maxWidth: 520, paddingTop: "var(--sp-8)" }}>
      <div className="center" style={{ marginBottom: "var(--sp-5)" }}>
        <div className="brand" style={{ fontSize: "var(--fs-2xl)" }}>
          Aethel<span>OS</span>
        </div>
        <p className="muted">Community life, owned by its people.</p>
        <p className="hint" style={{ marginTop: "var(--sp-2)" }}>
          Beta software — back up your recovery phrase. We cannot reset lost keys.
        </p>
      </div>
      {children}
    </div>
  );
}

function BackButton({
  onClick,
  label = "Back",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <Button variant="ghost" block style={{ marginTop: "var(--sp-2)" }} onClick={onClick}>
      {label}
    </Button>
  );
}

function OnboardingWizard({ initialStep }: { initialStep: Step }) {
  const [step, setStep] = useState<Step>(initialStep);
  const myKey = useStore((s) => s.myKey);
  const pendingInvite = useStore((s) => s.pendingInvite);
  const hasIdentity = myKey.length > 0;

  useEffect(() => {
    if (
      step === "create" ||
      step === "restore" ||
      step === "start" ||
      step === "joinPaste" ||
      step === "lostDevice" ||
      step === "recoverMethod" ||
      step === "importLog"
    ) {
      return;
    }
    if (pendingInvite) setStep("join");
    else if (hasIdentity && step === "welcome") setStep("choose");
  }, [pendingInvite, hasIdentity, step]);

  const setInvite = (invite: InvitePayload | null) => {
    useStore.setState({ pendingInvite: invite });
  };

  const goToJoinAfterPaste = (invite: InvitePayload) => {
    setInvite(invite);
    setStep(hasIdentity ? "join" : "create");
  };

  return (
    <Shell>
      {step === "welcome" && (
        <Welcome
          onCreate={() => setStep("create")}
          onRestore={() => setStep("restore")}
          onJoinLink={() => setStep("joinPaste")}
          onLostDevice={() => setStep("lostDevice")}
        />
      )}
      {step === "create" && (
        <CreateIdentity
          invite={pendingInvite}
          onBack={() => setStep(pendingInvite ? "join" : "welcome")}
        />
      )}
      {step === "restore" && (
        <RestoreIdentity
          onDone={() => setStep(pendingInvite ? "join" : "recoverMethod")}
          onBack={() => setStep("welcome")}
        />
      )}
      {step === "choose" && (
        <ChooseAction
          onStart={() => setStep("start")}
          onJoin={() => setStep("joinPaste")}
        />
      )}
      {step === "start" && <StartCommunity onBack={() => setStep("choose")} />}
      {step === "joinPaste" && (
        <PasteInviteLink
          onBack={() => setStep(hasIdentity ? "choose" : "welcome")}
          onParsed={goToJoinAfterPaste}
        />
      )}
      {step === "join" && (
        <JoinCommunity
          hasIdentity={hasIdentity}
          onNeedIdentity={() => setStep("create")}
          onBack={() => {
            setInvite(null);
            setStep(hasIdentity ? "choose" : "welcome");
          }}
          onChangeLink={() => setStep("joinPaste")}
        />
      )}
      {step === "lostDevice" && (
        <LostDeviceIntro onContinue={() => setStep("restore")} onBack={() => setStep("welcome")} />
      )}
      {step === "recoverMethod" && (
        <RecoverMethod
          onInviteLink={() => setStep("joinPaste")}
          onEventLog={() => setStep("importLog")}
          onSkip={() => setStep("choose")}
        />
      )}
      {step === "importLog" && <ImportEventLog onBack={() => setStep("recoverMethod")} />}
    </Shell>
  );
}

function Welcome({
  onCreate,
  onRestore,
  onJoinLink,
  onLostDevice,
}: {
  onCreate: () => void;
  onRestore: () => void;
  onJoinLink: () => void;
  onLostDevice: () => void;
}) {
  const downloadUrl = import.meta.env.VITE_DOWNLOAD_URL?.trim();
  const showDownload = downloadUrl && !isDesktopApp();

  return (
    <Card>
      <PwaInstallHint />
      <p className="muted" style={{ marginBottom: "var(--sp-4)" }}>
        AethelOS runs on your device. Your identity is a key only you hold — no accounts,
        no company in the middle. Start by creating or restoring an identity.
      </p>
      <div className="stack">
        <Button block onClick={onCreate}>
          Create a new identity
        </Button>
        <Button block variant="ghost" onClick={onRestore}>
          Restore from recovery phrase
        </Button>
        <Button block variant="ghost" onClick={onJoinLink}>
          I have an invite link
        </Button>
        <Button block variant="ghost" onClick={onLostDevice}>
          I lost my device
        </Button>
        {showDownload ? (
          <a
            className="btn block ghost"
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textAlign: "center", textDecoration: "none" }}
          >
            Download desktop app (Windows)
          </a>
        ) : null}
      </div>
    </Card>
  );
}

function CreateIdentity({
  onBack,
  invite,
}: {
  onBack: () => void;
  invite: InvitePayload | null;
}) {
  const create = useStore((s) => s.createIdentity);
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  const pwError = pw && pw.length < 8 ? "Use at least 8 characters" : "";
  const matchError = pw2 && pw !== pw2 ? "Passphrases do not match" : "";
  const valid = name.trim() && pw.length >= 8 && pw === pw2;

  return (
    <Card title="Create your identity">
      {invite ? (
        <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
          Next you'll join <strong>{invite.cell || "a community"}</strong>.
        </p>
      ) : null}
      <Field
        label="Display name"
        placeholder="How others see you"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Field
        label="Passphrase"
        type="password"
        hint="Encrypts your key on this device."
        error={pwError}
        value={pw}
        onChange={(e) => setPw(e.target.value)}
      />
      <Field
        label="Confirm passphrase"
        type="password"
        error={matchError}
        value={pw2}
        onChange={(e) => setPw2(e.target.value)}
      />
      <div className="row" style={{ marginTop: "var(--sp-3)" }}>
        <Button
          disabled={!valid || busy}
          onClick={async () => {
            setBusy(true);
            await create(name.trim(), pw);
            setBusy(false);
          }}
        >
          Create identity
        </Button>
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
      </div>
    </Card>
  );
}

function BackupScreen({ mnemonic }: { mnemonic: string }) {
  const confirmBackup = useStore((s) => s.confirmBackup);
  const pendingInvite = useStore((s) => s.pendingInvite);
  const toast = useStore((s) => s.toast);
  const [confirmed, setConfirmed] = useState(false);
  const words = mnemonic.split(" ");

  return (
    <Shell>
      <Card title="Save your recovery phrase">
        <div className="alert warning">
          These 12 words restore your <strong>identity only</strong> — not your community
          membership. To get back into a community you also need an invite link or an event
          log export from another device. Write them down safely. Never share them.
        </div>
        <div className="recovery-grid">
          {words.map((w, i) => (
            <div className="recovery-word" key={i}>
              <span className="idx">{i + 1}</span>
              <span>{w}</span>
            </div>
          ))}
        </div>
        <div className="row">
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(mnemonic);
              toast("Recovery phrase copied", "success");
            }}
          >
            Copy
          </Button>
        </div>
        <p className="hint" style={{ marginTop: "var(--sp-2)" }}>
          Prefer writing on paper; clipboard may be visible to other apps.
        </p>
        <label className="row" style={{ margin: "var(--sp-4) 0", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span className="muted">I have safely saved my recovery phrase.</span>
        </label>
        <Button block disabled={!confirmed} onClick={() => void confirmBackup()}>
          {pendingInvite ? "Continue to join" : "Continue"}
        </Button>
      </Card>
    </Shell>
  );
}

function RestoreIdentity({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const restore = useStore((s) => s.restoreIdentity);
  const [phrase, setPhrase] = useState("");
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const phraseValid = phrase.trim().split(/\s+/).length >= 12 && isValidMnemonic(phrase);
  const valid = phraseValid && name.trim() && pw.length >= 8;

  return (
    <Card title="Restore identity">
      <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
        Your recovery phrase restores your cryptographic identity. Community history syncs
        from a mailbox after you rejoin with an invite link or import an event log backup.
      </p>
      <div className="field">
        <label htmlFor="phrase">Recovery phrase</label>
        <textarea
          id="phrase"
          className="textarea"
          rows={3}
          placeholder="Enter your 12-word recovery phrase"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
        />
        {phrase && !phraseValid ? (
          <span className="error-text">Not a valid 12-word phrase</span>
        ) : null}
      </div>
      <Field
        label="Display name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Field
        label="New passphrase (this device)"
        type="password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
      />
      <div className="row" style={{ marginTop: "var(--sp-3)" }}>
        <Button
          disabled={!valid || busy}
          onClick={async () => {
            setBusy(true);
            const ok = await restore(phrase, name.trim(), pw);
            setBusy(false);
            if (ok) onDone();
          }}
        >
          Restore
        </Button>
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
      </div>
    </Card>
  );
}

function ChooseAction({ onStart, onJoin }: { onStart: () => void; onJoin: () => void }) {
  return (
    <Card title="What would you like to do?">
      <div className="stack">
        <Button block onClick={onStart}>
          Start a new community
        </Button>
        <Button block variant="secondary" onClick={onJoin}>
          Join a community
        </Button>
        <p className="hint">
          Joining needs an invite link from someone already in the community.
        </p>
      </div>
    </Card>
  );
}

function PasteInviteLink({
  onBack,
  onParsed,
}: {
  onBack: () => void;
  onParsed: (invite: InvitePayload) => void;
}) {
  const toast = useStore((s) => s.toast);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState("");

  const tryParse = () => {
    const invite = parseInviteInput(raw);
    if (!invite) {
      setError("Could not read that link. Paste the full invite URL from your inviter.");
      return;
    }
    setError("");
    onParsed(invite);
    toast(`Invite loaded — ${invite.cell || "community"}`, "success");
  };

  return (
    <Card title="Join with invite link">
      <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
        Paste the link someone shared with you (or open it in your browser — it fills in
        automatically).
      </p>
      <Field
        label="Invite link"
        hint="Paste the full link here"
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          setError("");
        }}
        className="mono"
      />
      {error ? <p className="error-text">{error}</p> : null}
      <Button
        block
        disabled={!raw.trim()}
        style={{ marginTop: "var(--sp-3)" }}
        onClick={tryParse}
      >
        Continue
      </Button>
      <BackButton onClick={onBack} />
    </Card>
  );
}

function StartCommunity({ onBack }: { onBack: () => void }) {
  const start = useStore((s) => s.startCommunity);
  const toast = useStore((s) => s.toast);
  const [cell, setCell] = useState("My Community");
  const [busy, setBusy] = useState(false);
  const [mailboxReady, setMailboxReady] = useState(false);
  const [customRelay, setCustomRelay] = useState(() => loadBootstrapRelay() ?? "");
  const [probeBusy, setProbeBusy] = useState(false);
  const [relayProbed, setRelayProbed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void import("../app/bootstrap-relays.js").then((m) => {
      if (cancelled) return;
      const ready = isDesktopApp() || m.canAttemptCommunityGenesis();
      setMailboxReady(ready);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const relayValid = !customRelay.trim() || isValidRelayUrl(customRelay.trim());
  const canCreate =
    cell.trim() &&
    !busy &&
    (mailboxReady || (customRelay.trim() && relayValid && relayProbed));

  const probeRelay = async () => {
    const url = customRelay.trim();
    if (!isValidRelayUrl(url)) {
      toast("Enter a valid ws:// or wss:// mailbox URL", "error");
      return;
    }
    setProbeBusy(true);
    const { probeRelay: probe } = await import("../app/bootstrap-relays.js");
    const ok = await probe(url);
    setProbeBusy(false);
    setRelayProbed(ok);
    saveBootstrapRelay(url);
    toast(
      ok ? "Connection point reachable" : "Can't reach that mailbox — check the URL",
      ok ? "success" : "error",
    );
  };

  return (
    <Card title="Start a community">
      <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
        You will hold all the starting stake. When it's created, invite people from the
        Community tab.
      </p>
      {mailboxReady ? (
        <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
          This install can use its built-in mailbox automatically.
        </p>
      ) : (
        <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
          This copy has no automatic mailbox. Enter a reachable{" "}
          <code className="mono">wss://</code> connection point below, or use the desktop
          app / a hosted install.
        </p>
      )}
      {!mailboxReady ? (
        <>
          <Field
            label="Connection point (mailbox)"
            hint="ws:// or wss:// URL where your community syncs"
            value={customRelay}
            onChange={(e) => {
              setCustomRelay(e.target.value);
              setRelayProbed(false);
            }}
            className="mono"
            {...(customRelay.trim() && !relayValid
              ? { error: "Invalid relay URL" }
              : {})}
          />
          <Button
            variant="secondary"
            block
            disabled={!customRelay.trim() || !relayValid || probeBusy}
            style={{ marginTop: "var(--sp-2)" }}
            onClick={() => void probeRelay()}
          >
            Test connection
          </Button>
        </>
      ) : null}
      <Field
        label="Community name"
        value={cell}
        onChange={(e) => setCell(e.target.value)}
      />
      <Button
        block
        disabled={!canCreate}
        style={{ marginTop: "var(--sp-3)" }}
        onClick={async () => {
          setBusy(true);
          const relay = customRelay.trim() || undefined;
          await start(cell.trim(), relay ? { customRelay: relay } : undefined);
          setBusy(false);
        }}
      >
        Create community
      </Button>
      <BackButton onClick={onBack} />
    </Card>
  );
}

function JoinCommunity({
  hasIdentity,
  onNeedIdentity,
  onBack,
  onChangeLink,
}: {
  hasIdentity: boolean;
  onNeedIdentity: () => void;
  onBack: () => void;
  onChangeLink: () => void;
}) {
  const invite = useStore((s) => s.pendingInvite);
  const join = useStore((s) => s.joinCommunity);
  const [busy, setBusy] = useState(false);

  if (!invite) {
    return (
      <PasteInviteLink
        onBack={onBack}
        onParsed={(parsed) => useStore.setState({ pendingInvite: parsed })}
      />
    );
  }

  return (
    <Card title="You've been invited">
      <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
        You'll connect to <strong>{invite.cell || "this community"}</strong>. After
        joining, tell whoever invited you that you're waiting — they'll vouch for you.
      </p>
      <ul className="list">
        <li>
          <span className="muted">Community</span>
          <span>{invite.cell || "(unnamed)"}</span>
        </li>
        <li>
          <span className="muted">Invited by</span>
          <span className="mono">{shortKey(invite.inviter)}</span>
        </li>
      </ul>
      <Disclosure summary="Advanced details">
        <ul className="list">
          <li>
            <span className="muted">Connection points</span>
            <span className="mono">{invite.relays.join(", ") || defaultRelay()}</span>
          </li>
        </ul>
      </Disclosure>
      {hasIdentity ? (
        <>
          <Button
            block
            disabled={busy}
            style={{ marginTop: "var(--sp-4)" }}
            onClick={async () => {
              setBusy(true);
              await join(invite);
              setBusy(false);
            }}
          >
            Join this community
          </Button>
          <BackButton onClick={onBack} label="Back to choices" />
          <Button
            variant="ghost"
            block
            style={{ marginTop: "var(--sp-1)" }}
            onClick={onChangeLink}
          >
            Use a different invite link
          </Button>
        </>
      ) : (
        <div style={{ marginTop: "var(--sp-4)" }}>
          <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
            First, create an identity to join.
          </p>
          <Button block onClick={onNeedIdentity}>
            Create identity
          </Button>
          <BackButton onClick={onBack} />
        </div>
      )}
    </Card>
  );
}

function LostDeviceIntro({
  onContinue,
  onBack,
}: {
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <Card title="I lost my device">
      <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
        Your <strong>recovery phrase</strong> brings back your identity on a new device.
        Your <strong>community</strong> comes back when you either paste your invite link
        again (the mailbox syncs history) or import an event log file you exported earlier.
      </p>
      <Button block onClick={onContinue}>
        Continue with recovery phrase
      </Button>
      <BackButton onClick={onBack} />
    </Card>
  );
}

function RecoverMethod({
  onInviteLink,
  onEventLog,
  onSkip,
}: {
  onInviteLink: () => void;
  onEventLog: () => void;
  onSkip: () => void;
}) {
  return (
    <Card title="Reconnect to your community">
      <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
        Identity restored. How do you want to load your community?
      </p>
      <div className="stack">
        <Button block onClick={onInviteLink}>
          I have my invite link
        </Button>
        <Button block variant="secondary" onClick={onEventLog}>
          I have an event log export (.json)
        </Button>
        <Button block variant="ghost" onClick={onSkip}>
          Skip for now
        </Button>
      </div>
      <p className="hint" style={{ marginTop: "var(--sp-3)" }}>
        Without an invite or backup file, ask a member for a fresh invite link.
      </p>
    </Card>
  );
}

function ImportEventLog({ onBack }: { onBack: () => void }) {
  const recover = useStore((s) => s.recoverCommunityFromEventLog);
  const unlock = useStore((s) => s.unlock);
  const toast = useStore((s) => s.toast);
  const myKey = useStore((s) => s.myKey);
  const session = useStore((s) => s.session);
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState("");
  const [imported, setImported] = useState(false);

  const onFile = async (file: File) => {
    setBusy(true);
    const text = await file.text();
    const result = await recover(text);
    setBusy(false);
    if (!result.ok) {
      toast("Could not import that file — check the export and try again", "error");
      return;
    }
    setImported(true);
    toast(`Imported ${result.imported} events — enter your passphrase to open`, "success");
  };

  return (
    <Card title="Import community backup">
      <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
        Choose an event log JSON you exported from Identity → Data on a device that was
        still in the community.
      </p>
      <input
        type="file"
        accept="application/json,.json"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFile(file);
        }}
      />
      {imported && session ? (
        <div style={{ marginTop: "var(--sp-3)" }}>
          <Field
            label="Passphrase"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
          <Button
            block
            disabled={!pw || busy}
            style={{ marginTop: "var(--sp-3)" }}
            onClick={async () => {
              setBusy(true);
              await unlock(myKey, pw);
              setBusy(false);
            }}
          >
            Unlock community
          </Button>
        </div>
      ) : null}
      <BackButton onClick={onBack} />
    </Card>
  );
}

function UnlockScreen() {
  const session = useStore((s) => s.session);
  const unlock = useStore((s) => s.unlock);
  const lock = useStore((s) => s.lock);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  if (!session) return null;
  return (
    <Shell>
      <Card title={`Welcome back, ${session.displayName || "friend"}`}>
        <Field
          label="Passphrase"
          type="password"
          value={pw}
          autoFocus
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && pw) void unlock(session.publicKeyHex, pw);
          }}
        />
        <Button
          block
          disabled={!pw || busy}
          onClick={async () => {
            setBusy(true);
            await unlock(session.publicKeyHex, pw);
            setBusy(false);
          }}
        >
          Unlock
        </Button>
        <button
          className="btn ghost block"
          style={{ marginTop: "var(--sp-3)" }}
          onClick={() => {
            clearSession();
            useStore.setState({ session: null, phase: "onboarding" });
            lock();
          }}
        >
          Use a different identity
        </button>
      </Card>
    </Shell>
  );
}
