import { useState, useEffect } from "react";
import { useStore } from "../app/store.js";
import { clearSession } from "../app/session.js";
import { Card } from "../design/components/Card.js";
import { Button } from "../design/components/Button.js";
import { Field } from "../design/components/Field.js";
import { isValidMnemonic } from "../storage/keystore.js";
import { defaultRelay } from "../app/session.js";
import { isDesktopApp } from "../app/local-node.js";
import { shortKey } from "../app/format.js";
import { Disclosure } from "../design/components/Disclosure.js";
import { parseInviteInput, type InvitePayload } from "../app/invite.js";

type Step = "welcome" | "create" | "restore" | "choose" | "start" | "joinPaste" | "join";

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
      </div>
      {children}
    </div>
  );
}

function BackButton({ onClick, label = "Back" }: { onClick: () => void; label?: string }) {
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
      step === "joinPaste"
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
          onDone={() => setStep(pendingInvite ? "join" : "choose")}
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
    </Shell>
  );
}

function Welcome({
  onCreate,
  onRestore,
}: {
  onCreate: () => void;
  onRestore: () => void;
}) {
  return (
    <Card>
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
          These 12 words are the ONLY way to recover your identity if you lose this device
          or forget your passphrase. Write them down and store them safely. Never share
          them.
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

function ChooseAction({
  onStart,
  onJoin,
}: {
  onStart: () => void;
  onJoin: () => void;
}) {
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
        hint="Looks like https://…/#/join?d=…"
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          setError("");
        }}
        className="mono"
      />
      {error ? <p className="error-text">{error}</p> : null}
      <Button block disabled={!raw.trim()} style={{ marginTop: "var(--sp-3)" }} onClick={tryParse}>
        Continue
      </Button>
      <BackButton onClick={onBack} />
    </Card>
  );
}

function StartCommunity({ onBack }: { onBack: () => void }) {
  const start = useStore((s) => s.startCommunity);
  const [cell, setCell] = useState("My Community");
  const [busy, setBusy] = useState(false);
  const desktop = isDesktopApp();
  return (
    <Card title="Start a community">
      <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
        You will hold all the starting stake. Share the invite link — friends connect
        automatically.
        {desktop
          ? " This desktop app will share a mailbox from your computer."
          : " Install the desktop app to invite friends far away (browser tabs cannot host a mailbox)."}
      </p>
      <Field
        label="Community name"
        value={cell}
        onChange={(e) => setCell(e.target.value)}
      />
      <Button
        block
        disabled={!cell.trim() || busy}
        style={{ marginTop: "var(--sp-3)" }}
        onClick={async () => {
          setBusy(true);
          await start(cell.trim());
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
        You'll connect to <strong>{invite.cell || "this community"}</strong>. After joining,
        copy your join code from the Community tab and send it to whoever invited you.
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
      <Disclosure summary="Technical details">
        <ul className="list">
          <li>
            <span className="muted">Relays</span>
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
          <Button variant="ghost" block style={{ marginTop: "var(--sp-1)" }} onClick={onChangeLink}>
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
