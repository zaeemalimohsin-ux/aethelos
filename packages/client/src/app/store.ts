import { create } from "zustand";
import type {
  KeyPair,
  PoolState,
  ProposalKind,
  GovernanceParameter,
} from "@aethelos/core";
import {
  getBalance,
  requiredVouchLien,
  availableToPledge,
  parsePointsAmount,
  formatPointsAmount,
  admissionProposalId,
  reduceWithSnapshot,
} from "@aethelos/core";
import { NodeController, generateNamespaceId } from "../node/controller.js";
import type { LinkedPools } from "../node/federation-reader.js";
import { resolvedGovernanceParameters } from "@aethelos/core";
import type { SyncStatus } from "../sync/engine.js";
import {
  createIdentity as ksCreate,
  restoreFromMnemonic,
  unlockIdentity,
  listIdentities,
  markBackedUp,
  type IdentitySummary,
} from "../storage/keystore.js";
import { isValidPublicKeyHex } from "./format.js";
import {
  loadSession,
  saveSession,
  clearSession,
  selectRelaysForCommunity,
  isValidRelayUrl,
  type Session,
} from "./session.js";
import {
  parseInviteFromUrl,
  clearInviteFromUrl,
  syncInviteToUrl,
  verifyInviteSignature,
  type InvitePayload,
} from "./invite.js";
import {
  signChildChapterAttach,
  signParentChapterJoin,
  verifyChapterLinkSignature,
  parseChapterLinkInput,
  buildChapterLinkUrl,
} from "./chapter-link.js";
import { saveSubCellParentContext, loadSubCellParentContext } from "./subcell-context.js";
import {
  isDesktopApp,
  startLocalNode,
  stopLocalNode,
  localNodeStatus,
  waitForPublicTunnel,
  writeShareUrlFile,
  type LocalNodeStatus,
} from "./local-node.js";
import { rejectionMessage } from "./rejection-messages.js";
import { trackEvent } from "./analytics.js";
import { mergeActiveRelays } from "./active-relays.js";
import {
  loadBootstrapRelay,
  saveBootstrapRelay,
  STORAGE_KEYS,
} from "./session-storage.js";
import {
  httpsToWssRelayUrl,
  tunnelStatusFromLocalNode,
  syncDesktopTunnelRelay,
  type TunnelStatus,
} from "./active-relays.js";
import { sameOriginRelayUrl, isPublishableRelayUrl } from "./bootstrap-relays.js";
import { ensureOnline } from "./connectivity.js";

const OUTBOX_FULL_TOAST =
  "Queue full — wait for your relay connection to catch up before sending more actions.";

function isOutboxFullError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("Outbox full") || msg.includes("Queue full");
}

async function runPublishAction(
  get: () => AppStore,
  action: () => Promise<void>,
): Promise<boolean> {
  try {
    await action();
    return true;
  } catch (err) {
    if (isOutboxFullError(err)) {
      get().toast(OUTBOX_FULL_TOAST, "error");
      return false;
    }
    throw err;
  }
}

export type Phase = "loading" | "onboarding" | "locked" | "ready";
export type View = "cell" | "governance" | "proposals" | "connection" | "identity";
export type Theme = "dark" | "light";

export interface Toast {
  id: string;
  message: string;
  kind: "info" | "success" | "error";
}

interface AppStore {
  theme: Theme;
  phase: Phase;
  view: View;
  session: Session | null;
  identities: IdentitySummary[];
  controller: NodeController | null;
  pool: PoolState | null;
  linkedPools: LinkedPools;
  sync: SyncStatus | null;
  toasts: Toast[];
  pendingInvite: InvitePayload | null;
  myKey: string;
  displayName: string;
  /** Set transiently after creating an identity so the UI can show the backup screen. */
  newMnemonic: string | null;
  /** Consumed once by onboarding wizard after backup confirmation. */
  onboardingAfterBackup: "start" | "join" | null;
  /** Desktop: local mailbox process is running on this machine. */
  relaySharing: boolean;
  /** Desktop: public tunnel readiness for remote friends. */
  tunnelStatus: TunnelStatus;
  /** Proposals tab: scroll/highlight admit row after vouch. */
  highlightProposalId: string | null;

  init(): Promise<void>;
  setTheme(t: Theme): void;
  setView(v: View): void;
  clearProposalHighlight(): void;
  highlightAdmissionVote(inviteePubkey: string): void;
  toast(message: string, kind?: Toast["kind"]): void;
  dismissToast(id: string): void;

  setPendingInvite(invite: InvitePayload | null): void;

  createIdentity(displayName: string, password: string): Promise<boolean>;
  confirmBackup(): Promise<void>;
  clearOnboardingAfterBackup(): void;
  restoreIdentity(
    mnemonic: string,
    displayName: string,
    password: string,
  ): Promise<boolean>;
  unlock(publicKeyHex: string, password: string): Promise<boolean>;
  lock(): void;

  startCommunity(cellName: string, options?: { customRelay?: string }): Promise<void>;
  joinCommunity(invite: InvitePayload): Promise<void>;
  acceptPendingInvite(): Promise<void>;

  invite(pubkey: string, parameters?: Record<GovernanceParameter, number>): Promise<void>;
  cancelInvite(pubkey: string): Promise<void>;
  transfer(to: string, amount: string, memo?: string): Promise<void>;
  updateSlider(
    p: GovernanceParameter | "redistribution",
    v: number,
    target?: string,
  ): Promise<void>;
  updateVouch(target: string, weight: number): Promise<void>;
  createProposal(kind: ProposalKind, data: Record<string, string>): Promise<void>;
  voteProposal(id: string, approve: boolean): Promise<void>;
  joinSuperstructure(id: string): Promise<void>;
  leaveSuperstructure(id: string): Promise<void>;
  spawnSubCell(name: string): Promise<void>;
  returnToParentChapter(): Promise<void>;
  linkSubcell(childNamespaceId: string, bridgeKey?: string): Promise<void>;
  createChildChapterLink(): Promise<string | null>;
  createParentChapterLink(): Promise<string | null>;
  applyChapterLink(raw: string): Promise<void>;
  bridgeEscrow(remoteId: string, to: string, amount: string): Promise<void>;
  addRelay(url: string): void;
  removeRelay(url: string): void;
  /** Desktop: public app URL for phone founding (Connection tab). */
  shareUrl: string | null;
  ensureDesktopShare(): Promise<void>;
  syncDesktopRelayContribution(publicHttpsUrl?: string): Promise<void>;
  setRelaySharing(on: boolean): Promise<void>;
  recoverCommunityFromEventLog(json: string): Promise<{
    ok: boolean;
    namespaceId?: string;
    imported: number;
    skipped?: number;
    error?: string;
  }>;
}

let keyPair: KeyPair | null = null;
let forceJoinProbeForTests = false;

/** E2E-only: run join-time relay probe even in Vite dev. */
export function setForceJoinProbeForTests(value: boolean): void {
  forceJoinProbeForTests = value;
}

function desktopStartupErrorMessage(node: LocalNodeStatus | null): string | null {
  const detail = node?.startupError?.trim();
  if (detail) {
    return `Can't connect from this computer: ${detail}`;
  }
  return null;
}

function syncShareUrlFile(shareUrl: string | null): void {
  if (!isDesktopApp()) return;
  void writeShareUrlFile(shareUrl);
}

async function applyDesktopShareFromNode(
  get: () => AppStore,
  set: (partial: Partial<AppStore>) => void,
  status: LocalNodeStatus | null,
  onlinePublicUrl?: string | null,
): Promise<void> {
  const publicUrl = onlinePublicUrl ?? status?.publicUrl ?? null;
  const tunnelStatus = tunnelStatusFromLocalNode(
    status?.running ?? false,
    publicUrl ?? undefined,
    status?.cloudflaredAvailable,
  );
  if (publicUrl) {
    set({ shareUrl: publicUrl, tunnelStatus });
    syncShareUrlFile(publicUrl);
  } else {
    set({ tunnelStatus });
  }
  if (get().relaySharing && publicUrl && get().controller && get().pool && get().myKey) {
    await get().syncDesktopRelayContribution(publicUrl);
  }
}

function resolveInviteRelays(invite: InvitePayload): string[] {
  let relays =
    invite.relays.length > 0 ? [...invite.relays] : selectRelaysForCommunity(invite.ns);
  if (forceJoinProbeForTests) {
    return relays.length > 0 ? relays : selectRelaysForCommunity(invite.ns);
  }
  const sameOrigin = sameOriginRelayUrl();
  if (sameOrigin && isPublishableRelayUrl(sameOrigin)) {
    const pageHost = typeof window !== "undefined" ? window.location.host : "";
    const inviteUsesThisHost =
      relays.length === 0 ||
      relays.some((u) => {
        try {
          const normalized = u.replace(/^ws:/, "http:").replace(/^wss:/, "https:");
          return new URL(normalized).host === pageHost;
        } catch {
          return false;
        }
      });
    if (inviteUsesThisHost) {
      relays = relays.filter((u) => isPublishableRelayUrl(u));
      if (!relays.includes(sameOrigin)) relays.unshift(sameOrigin);
    }
  }
  return relays.length > 0 ? relays : selectRelaysForCommunity(invite.ns);
}

export const useStore = create<AppStore>((set, get) => ({
  theme: (localStorage.getItem(STORAGE_KEYS.theme) as Theme) ?? "dark",
  phase: "loading",
  view: "cell",
  session: null,
  identities: [],
  controller: null,
  pool: null,
  linkedPools: {},
  sync: null,
  toasts: [],
  pendingInvite: null,
  myKey: "",
  displayName: "",
  newMnemonic: null,
  onboardingAfterBackup: null,
  relaySharing: false,
  tunnelStatus: "idle",
  shareUrl: null,
  highlightProposalId: null,

  async ensureDesktopShare() {
    if (!isDesktopApp()) return;
    const status = await localNodeStatus();
    const cached = get().shareUrl;
    if (cached && status?.publicUrl && cached === status.publicUrl) {
      if (get().relaySharing) {
        await get().syncDesktopRelayContribution(status.publicUrl);
      }
      return;
    }
    const online = await ensureOnline({ desktopOnly: true });
    if (!online.ok) {
      const startupMsg = desktopStartupErrorMessage(status);
      get().toast(
        startupMsg ??
          "Can't connect from this computer. Open the Connection tab for details.",
        "error",
      );
      set({ tunnelStatus: "failed" });
      return;
    }
    await applyDesktopShareFromNode(get, set, status, online.publicUrl);
  },

  async syncDesktopRelayContribution(publicHttpsUrl) {
    if (!isDesktopApp()) return;
    const controller = get().controller;
    const pool = get().pool;
    const myKey = get().myKey;
    if (!controller || !pool || !myKey || !get().relaySharing) return;

    let httpsUrl = publicHttpsUrl?.trim();
    if (!httpsUrl) {
      const status = await localNodeStatus();
      httpsUrl = status?.publicUrl ?? get().shareUrl ?? undefined;
    }
    if (!httpsUrl) return;

    await syncDesktopTunnelRelay(
      {
        revokeRelay: (url) => controller.revokeRelay(url),
        contributeRelay: (url) => controller.contributeRelay(url),
        getCommunityRelays: () => controller.state?.communityRelays ?? [],
      },
      myKey,
      httpsUrl,
      pool.communityRelayAuthors ?? {},
    );
    persistSession(get);
  },

  async init() {
    document.documentElement.setAttribute("data-theme", get().theme);
    const identities = await listIdentities();
    const session = loadSession();
    const pendingInvite = parseInviteFromUrl();
    set({ identities, session, pendingInvite });

    if (isDesktopApp()) {
      void get()
        .ensureDesktopShare()
        .then(async () => {
          if (get().shareUrl || get().tunnelStatus !== "idle") return;
          const status = await localNodeStatus();
          const msg = desktopStartupErrorMessage(status);
          if (msg) get().toast(msg, "error");
        });
    }

    if (session && identities.some((i) => i.publicKeyHex === session.publicKeyHex)) {
      set({ phase: "locked", displayName: session.displayName });
    } else {
      set({ phase: "onboarding" });
    }
  },

  setTheme(t) {
    localStorage.setItem(STORAGE_KEYS.theme, t);
    document.documentElement.setAttribute("data-theme", t);
    set({ theme: t });
  },

  setView(v) {
    const prev = get().view;
    if (v !== "proposals" && prev === "proposals") {
      set({ view: v, highlightProposalId: null });
      return;
    }
    set({ view: v });
  },

  clearProposalHighlight() {
    set({ highlightProposalId: null });
  },

  highlightAdmissionVote(inviteePubkey) {
    const id = admissionProposalId(inviteePubkey.trim());
    set({ view: "proposals", highlightProposalId: id });
  },

  toast(message, kind = "info") {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
    setTimeout(() => get().dismissToast(id), 4500);
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  setPendingInvite(invite) {
    if (invite) syncInviteToUrl(invite);
    else clearInviteFromUrl();
    set({ pendingInvite: invite });
  },

  async createIdentity(displayName, password) {
    try {
      const { keyPair: kp, mnemonic } = await ksCreate(password, displayName);
      keyPair = kp;
      set({
        myKey: kp.publicKeyHex,
        displayName,
        newMnemonic: mnemonic,
        identities: await listIdentities(),
      });
      return true;
    } catch {
      get().toast("Could not create identity", "error");
      return false;
    }
  },

  async confirmBackup() {
    const key = get().myKey;
    const pendingInvite = get().pendingInvite;
    if (key) await markBackedUp(key);
    set({
      newMnemonic: null,
      identities: await listIdentities(),
      onboardingAfterBackup: pendingInvite ? "join" : "start",
    });
  },

  clearOnboardingAfterBackup() {
    set({ onboardingAfterBackup: null });
  },

  async restoreIdentity(mnemonic, displayName, password) {
    const kp = await restoreFromMnemonic(mnemonic, password, displayName);
    if (!kp) {
      get().toast("Invalid recovery phrase", "error");
      return false;
    }
    keyPair = kp;
    set({
      myKey: kp.publicKeyHex,
      displayName,
      identities: await listIdentities(),
    });
    return true;
  },

  async unlock(publicKeyHex, password) {
    const kp = await unlockIdentity(publicKeyHex, password);
    if (!kp) {
      get().toast("Wrong passphrase", "error");
      return false;
    }
    keyPair = kp;
    const session = get().session;
    const pendingInvite = get().pendingInvite;
    const identityName = get().identities.find(
      (i) => i.publicKeyHex === publicKeyHex,
    )?.displayName;
    const displayName = session?.displayName ?? get().displayName ?? identityName ?? "";
    set({ myKey: kp.publicKeyHex, displayName });

    if (pendingInvite && (!session || pendingInvite.ns !== session.namespaceId)) {
      set({ phase: "onboarding" });
      return true;
    }

    if (session && session.publicKeyHex === publicKeyHex) {
      await startNode(set, get, session.namespaceId, session.relayUrls);
      return true;
    }
    set({ phase: "onboarding" });
    return true;
  },

  lock() {
    keyPair = null;
    get().controller?.stop();
    set({
      controller: null,
      pool: null,
      sync: null,
      relaySharing: false,
      tunnelStatus: "idle",
      shareUrl: null,
      phase: "locked",
    });
    syncShareUrlFile(null);
  },

  async startCommunity(cellName, options) {
    if (!keyPair) return;

    const customRelay = options?.customRelay?.trim() || loadBootstrapRelay() || undefined;
    const { canAttemptCommunityGenesis } = await import("./bootstrap-relays.js");
    if (!isDesktopApp() && !customRelay && !canAttemptCommunityGenesis()) {
      get().toast(
        "This copy has no automatic connection point. Use the desktop app, a hosted install, or enter a connection point on this screen.",
        "error",
      );
      trackEvent("genesis_blocked", { reason: "no_connection_point" });
      return;
    }

    const namespaceId = generateNamespaceId();
    const online = await ensureOnline({
      namespaceId,
      ...(customRelay ? { customRelay } : {}),
      probe: !import.meta.env.DEV,
    });

    if (!online.ok || online.relays.length === 0) {
      get().toast(
        "Can't reach that connection point. Check the address or try a hosted install.",
        "error",
      );
      trackEvent("genesis_failed", { reason: "connection_unreachable" });
      return;
    }

    if (customRelay) saveBootstrapRelay(customRelay);

    const { relays, publicUrl: publicRelayUrl, tunnelStatus } = online;

    await startNode(set, get, namespaceId, relays);
    await get().controller?.genesis(cellName);

    if (publicRelayUrl) {
      await get().controller?.contributeRelay(httpsToWssRelayUrl(publicRelayUrl));
    } else if (!isDesktopApp()) {
      const sameOrigin = sameOriginRelayUrl();
      if (sameOrigin && isPublishableRelayUrl(sameOrigin)) {
        await get().controller?.contributeRelay(sameOrigin);
      }
    }

    persistSession(get);
    set({
      relaySharing: isDesktopApp() && Boolean(relays.length),
      tunnelStatus: isDesktopApp() ? tunnelStatus : "idle",
      shareUrl: publicRelayUrl ?? get().shareUrl,
    });
    const finalShareUrl = publicRelayUrl ?? get().shareUrl;
    if (finalShareUrl) syncShareUrlFile(finalShareUrl);
    get().toast(`Community "${cellName}" created`, "success");
    trackEvent("genesis_success");
  },

  async joinCommunity(invite) {
    if (!keyPair) return;
    if (invite.sig && !verifyInviteSignature(invite)) {
      get().toast("Invite link signature is invalid — do not join", "error");
      return;
    }
    if (!invite.sig) {
      get().toast(
        "Unsigned invite link — ask your inviter to send a fresh invite from the app",
        "error",
      );
      return;
    }
    const relays = resolveInviteRelays(invite);
    if (!import.meta.env.DEV || forceJoinProbeForTests) {
      const { probeAnyRelay } = await import("./bootstrap-relays.js");
      const live = await probeAnyRelay(relays);
      if (!live) {
        get().toast(
          "Can't reach the community connection point. Check the invite link or ask your inviter for a fresh link.",
          "error",
        );
        trackEvent("join_failed", { reason: "connection_unreachable" });
        return;
      }
    }
    await startNode(set, get, invite.ns, relays);
    persistSession(get);
    get().setPendingInvite(null);
    get().toast(
      "Connected — send your join code to your inviter so they can vouch for you",
      "success",
    );
  },

  async acceptPendingInvite() {
    const { controller, pool, myKey } = get();
    if (!controller || !pool) return;
    const invite = pool.pendingInvites[myKey];
    if (!invite) {
      get().toast("No pending invite found yet — wait for sync", "info");
      return;
    }
    if (!invite.admissionApproved) {
      get().toast("Waiting for community approval before you can join", "info");
      return;
    }
    const published = await runPublishAction(get, () =>
      controller.acceptInvite(invite.inviter),
    );
    if (!published) return;
    const ok = await controller.waitForConfirmedState((p) => p.members.includes(myKey));
    if (ok) {
      get().toast("Invite accepted", "success");
    } else {
      get().toast("Didn't sync yet — check your connection", "error");
    }
  },

  async invite(pubkey, parameters) {
    const trimmed = pubkey.trim();
    const { pool, myKey, controller } = get();
    if (!controller || !pool || !myKey) return;
    if (!isValidPublicKeyHex(trimmed)) {
      get().toast(
        "That join code doesn't look valid — paste the full 64-character code",
        "error",
      );
      return;
    }
    if (trimmed === myKey) {
      get().toast("You can't vouch for yourself", "error");
      return;
    }
    const lienAmount = requiredVouchLien(pool, myKey);
    if (lienAmount <= 0n) {
      get().toast("Cannot compute vouch lien", "error");
      return;
    }
    if (availableToPledge(pool, myKey) < lienAmount) {
      get().toast(
        `Not enough unpledged stake (need ${formatPointsAmount(lienAmount)} Points available to pledge)`,
        "error",
      );
      return;
    }
    const published = await runPublishAction(get, () =>
      controller.invite(trimmed, parameters),
    );
    if (!published) return;
    const ok = await controller.waitForConfirmedState((p) => !!p.pendingInvites[trimmed]);
    if (!ok) {
      get().toast("Didn't sync yet — check your connection", "error");
      return;
    }
    get().toast(
      "Vouch sent — open Proposals to vote Approve on their admission",
      "success",
    );
    set({
      view: "proposals",
      highlightProposalId: admissionProposalId(trimmed),
    });
  },
  async cancelInvite(pubkey) {
    const trimmed = pubkey.trim();
    const controller = get().controller;
    if (!controller) return;
    const published = await runPublishAction(get, () => controller.cancelInvite(trimmed));
    if (!published) return;
    const ok = await controller.waitForConfirmedState((p) => !p.pendingInvites[trimmed]);
    if (ok) {
      get().toast("Invite cancelled — lien released", "success");
    } else {
      get().toast("Didn't sync yet — check your connection", "error");
    }
  },
  async transfer(to, amount, memo) {
    const { pool, myKey, controller } = get();
    if (!controller || !pool || !myKey) return;
    const recipient = to.trim();
    if (!pool.members.includes(recipient)) {
      get().toast("Recipient is not a community member", "error");
      return;
    }
    let transferAmount: bigint;
    try {
      transferAmount = parsePointsAmount(amount.trim());
    } catch {
      get().toast("Invalid amount (up to 9 decimal places)", "error");
      return;
    }
    if (getBalance(pool, myKey) < transferAmount) {
      get().toast("Not enough Points for this transfer", "error");
      return;
    }
    const beforeRecipient = getBalance(pool, recipient);
    const published = await runPublishAction(get, () =>
      controller.transfer(recipient, formatPointsAmount(transferAmount), memo),
    );
    if (!published) return;
    const ok = await controller.waitForConfirmedState(
      (p) => getBalance(p, recipient) > beforeRecipient,
    );
    if (ok) {
      get().toast("Transaction sent", "success");
    } else {
      get().toast("Didn't sync yet — check your connection", "error");
    }
  },
  async updateSlider(p, v, target) {
    const controller = get().controller;
    if (!controller) return;
    await runPublishAction(get, () => controller.updateSlider(p, v, target));
  },
  async updateVouch(target, weight) {
    const controller = get().controller;
    if (!controller) return;
    await runPublishAction(get, () => controller.updateVouch(target, weight));
  },
  async createProposal(kind, data) {
    const controller = get().controller;
    if (!controller) return;
    const id = crypto.randomUUID();
    const published = await runPublishAction(get, () =>
      controller.createProposal(id, kind, data),
    );
    if (!published) return;
    const ok = await controller.waitForConfirmedState((p) => !!p.proposals[id]);
    if (ok) {
      get().toast("Proposal created", "success");
    } else {
      get().toast("Didn't sync yet — check your connection", "error");
    }
  },
  async voteProposal(id, approve) {
    const controller = get().controller;
    if (!controller) return;
    const published = await runPublishAction(get, () =>
      controller.voteProposal(id, approve),
    );
    if (!published) return;
    if (get().highlightProposalId === id) {
      get().clearProposalHighlight();
    }
  },
  async joinSuperstructure(id) {
    const controller = get().controller;
    const parentId = id.trim();
    let parentPool = get().linkedPools[parentId];
    if (!parentPool && controller) {
      parentPool = await controller.ensureLinkedNamespace(parentId);
      if (parentPool) set({ linkedPools: controller.getLinkedPools() });
    }
    const data: Record<string, string> = { target: parentId };
    if (parentPool) {
      data["parameters"] = JSON.stringify(resolvedGovernanceParameters(parentPool));
    }
    const proposalId = crypto.randomUUID();
    const published = await runPublishAction(get, () =>
      controller!.createProposal(proposalId, "join_superstructure", data),
    );
    if (!published) return;
    const ok = await controller?.waitForConfirmedState((p) => !!p.proposals[proposalId]);
    if (ok) {
      get().toast("Link to parent group proposed — vote in Proposals", "success");
    } else {
      get().toast("Didn't sync yet — check your connection", "error");
    }
  },
  async leaveSuperstructure(id) {
    const controller = get().controller;
    const parentId = id.trim();
    const proposalId = crypto.randomUUID();
    const published = await runPublishAction(get, () =>
      controller!.createProposal(proposalId, "leave_superstructure", {
        target: parentId,
      }),
    );
    if (!published) return;
    const ok = await controller?.waitForConfirmedState((p) => !!p.proposals[proposalId]);
    if (ok) {
      get().toast("Leave parent group proposed — vote in Proposals", "success");
    } else {
      get().toast("Didn't sync yet — check your connection", "error");
    }
  },
  async spawnSubCell(name) {
    if (!keyPair) return;
    const pool = get().pool;
    const controller = get().controller;
    if (!pool || !controller) return;
    if (pool.head !== get().myKey) {
      get().toast("Only the Head can start a linked chapter", "error");
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) return;
    const parentCellName = pool.cellName;
    saveSubCellParentContext({
      parentNamespaceId: pool.namespaceId,
      parentCellName,
      parentRelayUrls: controller.getRelayUrls(),
    });
    const namespaceId = generateNamespaceId();
    const relays = controller.getRelayUrls();
    await startNode(set, get, namespaceId, relays);
    const genesisOk = await runPublishAction(get, () =>
      get().controller!.genesis(trimmed),
    );
    if (!genesisOk) return;
    persistSession(get);
    get().toast(
      `Linked chapter "${trimmed}" created. Link it to "${parentCellName}" from Proposals.`,
      "success",
    );
  },
  async returnToParentChapter() {
    if (!keyPair) return;
    const parent = loadSubCellParentContext();
    if (!parent) return;
    const pool = get().pool;
    if (pool?.namespaceId === parent.parentNamespaceId) return;
    await startNode(set, get, parent.parentNamespaceId, parent.parentRelayUrls);
    persistSession(get);
    get().toast(`Returned to ${parent.parentCellName}`, "success");
  },
  async linkSubcell(childNamespaceId, bridgeKey) {
    const id = childNamespaceId.trim();
    if (!id) return;
    const childPool = get().linkedPools[id];
    const data: Record<string, string> = { target: id };
    if (childPool) {
      data["population"] = String(childPool.members.length);
    }
    const bridge = bridgeKey?.trim() || childPool?.head;
    if (bridge) {
      data["bridge"] = bridge;
    }
    const proposalId = crypto.randomUUID();
    const published = await runPublishAction(get, () =>
      get().controller!.createProposal(proposalId, "link_subcell", data),
    );
    if (!published) return;
    const ok = await get().controller?.waitForConfirmedState(
      (p) => !!p.proposals[proposalId],
    );
    if (ok) {
      get().toast("Link chapter proposed — vote in Proposals", "success");
    } else {
      get().toast("Didn't sync yet — check your connection", "error");
    }
  },
  async createChildChapterLink() {
    if (!keyPair) return null;
    const pool = get().pool;
    const controller = get().controller;
    if (!pool || !controller) return null;
    if (pool.head !== get().myKey) {
      get().toast("Only the Head can sign a chapter link", "error");
      return null;
    }
    const signed = await signChildChapterAttach(
      {
        childNs: pool.namespaceId,
        childCell: pool.cellName,
        bridge: pool.head,
        relays: controller.getRelayUrls(),
      },
      keyPair,
    );
    return buildChapterLinkUrl(signed);
  },
  async createParentChapterLink() {
    if (!keyPair) return null;
    const pool = get().pool;
    const controller = get().controller;
    if (!pool || !controller) return null;
    if (pool.head !== get().myKey) {
      get().toast("Only the Head can sign a parent chapter link", "error");
      return null;
    }
    const signed = await signParentChapterJoin(
      {
        parentNs: pool.namespaceId,
        parentCell: pool.cellName,
        relays: controller.getRelayUrls(),
      },
      keyPair,
    );
    return buildChapterLinkUrl(signed);
  },
  async applyChapterLink(raw) {
    const payload = parseChapterLinkInput(raw);
    if (!payload) {
      get().toast("Invalid chapter link", "error");
      return;
    }
    if (!verifyChapterLinkSignature(payload)) {
      get().toast("Chapter link signature invalid or missing", "error");
      return;
    }
    if (payload.kind === "child_attach") {
      await get().linkSubcell(payload.childNs, payload.bridge);
      return;
    }
    await get().joinSuperstructure(payload.parentNs);
  },
  async bridgeEscrow(remoteId, to, amount) {
    const proposalId = crypto.randomUUID();
    const published = await runPublishAction(get, () =>
      get().controller!.createProposal(proposalId, "bridge_transfer", {
        target: remoteId.trim(),
        to: to.trim(),
        amount: amount.trim(),
      }),
    );
    if (!published) return;
    const ok = await get().controller?.waitForConfirmedState(
      (p) => !!p.proposals[proposalId],
    );
    if (ok) {
      get().toast("Bridge transfer proposed — vote to approve", "success");
    } else {
      get().toast("Didn't sync yet — check your connection", "error");
    }
  },
  addRelay(url) {
    const trimmed = url.trim();
    if (!isValidRelayUrl(trimmed)) {
      get().toast("Enter a valid ws:// or wss:// address.", "error");
      return;
    }
    get().controller?.addRelay(trimmed);
    persistSession(get);
  },
  removeRelay(url) {
    const trimmed = url.trim();
    const controller = get().controller;
    const pool = get().pool;
    const relays = controller?.getRelayUrls() ?? [];
    if (relays.length <= 1) {
      get().toast("Keep at least one connection point.", "error");
      return;
    }
    if (pool?.communityRelays?.includes(trimmed)) {
      controller?.ignoreCommunityRelay(trimmed);
    } else {
      controller?.removeRelay(trimmed);
    }
    persistSession(get);
  },

  async setRelaySharing(on) {
    if (!isDesktopApp()) {
      get().toast("Install the desktop app to host from your computer.", "info");
      return;
    }
    const controller = get().controller;
    const pool = get().pool;
    const myKey = get().myKey;
    if (!controller) return;

    if (on) {
      const node = await startLocalNode();
      if (!node?.localUrl) {
        get().toast("Can't connect from this computer.", "error");
        return;
      }
      if (!controller.getSessionRelays().includes(node.localUrl)) {
        controller.addRelay(node.localUrl);
      }
      const withTunnel = node.publicUrl ? node : await waitForPublicTunnel(120_000);
      const publicUrl = withTunnel?.publicUrl;
      if (publicUrl) {
        await controller.contributeRelay(httpsToWssRelayUrl(publicUrl));
      }
      const tunnelStatus = tunnelStatusFromLocalNode(
        true,
        publicUrl,
        withTunnel?.cloudflaredAvailable ?? node.cloudflaredAvailable,
      );
      set({ relaySharing: true, tunnelStatus, shareUrl: publicUrl ?? get().shareUrl });
      const shareUrl = publicUrl ?? get().shareUrl;
      if (shareUrl) syncShareUrlFile(shareUrl);
      persistSession(get);
      if (tunnelStatus === "ready") {
        get().toast("You're online — invite people from Community", "success");
      } else if (tunnelStatus === "failed") {
        get().toast(
          "Online on this network only. Open the Connection tab for a public address.",
          "info",
        );
      } else {
        get().toast("Hosting on this network only", "info");
      }
      return;
    }

    if (pool && myKey) {
      const authors = pool.communityRelayAuthors ?? {};
      for (const relayUrl of pool.communityRelays ?? []) {
        if (authors[relayUrl] === myKey) {
          await controller.revokeRelay(relayUrl);
        }
      }
    }
    await stopLocalNode();
    set({ relaySharing: false, tunnelStatus: "idle", shareUrl: null });
    syncShareUrlFile(null);
    get().toast("Stopped hosting from this computer", "info");
  },

  async recoverCommunityFromEventLog(json) {
    const state = get();
    if (!state.myKey) {
      return { ok: false, imported: 0, error: "no_identity" };
    }
    try {
      const parsed = JSON.parse(json) as Array<{ namespaceId?: string }>;
      if (!Array.isArray(parsed) || !parsed.length || !parsed[0]?.namespaceId) {
        return { ok: false, imported: 0, error: "no_valid_entries" };
      }
      const ns = parsed[0].namespaceId;
      const { importEventLog, loadEvents } = await import("../storage/event-log.js");
      const result = await importEventLog(json, ns);
      const events = await loadEvents(ns);
      const { state: importedPool } = reduceWithSnapshot(ns, events);
      const relayUrls = mergeActiveRelays([], importedPool.communityRelays, ns);
      const ignored = state.session?.ignoredCommunityRelays ?? [];
      saveSession({
        publicKeyHex: state.myKey,
        displayName: state.displayName,
        namespaceId: ns,
        relayUrls,
        ...(ignored.length ? { ignoredCommunityRelays: ignored } : {}),
      });
      set({
        session: {
          publicKeyHex: state.myKey,
          displayName: state.displayName,
          namespaceId: ns,
          relayUrls,
          ...(ignored.length ? { ignoredCommunityRelays: ignored } : {}),
        },
      });
      return {
        ok: true,
        namespaceId: ns,
        imported: result.imported,
        skipped: result.skipped,
      };
    } catch (err) {
      const code = err instanceof Error ? err.message : "invalid_json";
      if (
        code === "invalid_json" ||
        code === "invalid_log_format" ||
        code === "empty_log" ||
        code === "no_valid_entries" ||
        code === "causal_orphan_log"
      ) {
        return {
          ok: false,
          imported: 0,
          error: code === "invalid_log_format" ? "invalid_json" : code,
        };
      }
      return { ok: false, imported: 0, error: "invalid_json" };
    }
  },
}));

async function startNode(
  set: (partial: Partial<AppStore>) => void,
  get: () => AppStore,
  namespaceId: string,
  relayUrls: string[],
): Promise<void> {
  if (!keyPair) return;
  get().controller?.stop();
  const session = get().session;
  const controller = new NodeController({
    relayUrls,
    namespaceId,
    keyPair,
    onRejected: (rejected) => {
      const seen = new Set<string>();
      for (const r of rejected) {
        if (seen.has(r.reason)) continue;
        seen.add(r.reason);
        const msg = rejectionMessage(r.reason);
        get().toast(msg, "error");
      }
    },
    ...(session?.ignoredCommunityRelays?.length
      ? { ignoredCommunityRelays: session.ignoredCommunityRelays }
      : {}),
  });
  controller.subscribe((pool) => set({ pool }));
  controller.onLinkedPools((linkedPools) => set({ linkedPools }));
  controller.onSyncStatus((sync) => set({ sync }));
  await controller.start();
  let relaySharing = false;
  let tunnelStatus: TunnelStatus = "idle";
  if (isDesktopApp()) {
    const status = await localNodeStatus();
    relaySharing = status?.running ?? false;
    tunnelStatus = tunnelStatusFromLocalNode(
      status?.running ?? false,
      status?.publicUrl,
      status?.cloudflaredAvailable,
    );
    if (status?.publicUrl) {
      set({
        controller,
        pool: controller.state,
        linkedPools: controller.getLinkedPools(),
        sync: controller.getSyncStatus(),
        relaySharing,
        tunnelStatus,
        shareUrl: status.publicUrl,
        phase: "ready",
      });
      syncShareUrlFile(status.publicUrl);
      if (relaySharing) {
        await get().syncDesktopRelayContribution(status.publicUrl);
      }
      return;
    }
  }
  set({
    controller,
    pool: controller.state,
    linkedPools: controller.getLinkedPools(),
    sync: controller.getSyncStatus(),
    relaySharing,
    tunnelStatus,
    phase: "ready",
  });
}

function persistSession(get: () => AppStore): void {
  const { controller, myKey, displayName } = get();
  if (!controller) return;
  const session: Session = {
    publicKeyHex: myKey,
    displayName,
    namespaceId: controller.getNamespaceId(),
    relayUrls: controller.getSessionRelays(),
    ignoredCommunityRelays: controller.getIgnoredCommunityRelays(),
  };
  saveSession(session);
}

export { clearSession };
