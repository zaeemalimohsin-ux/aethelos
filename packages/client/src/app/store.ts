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
import {
  loadSession,
  saveSession,
  clearSession,
  selectRelaysForCommunity,
  resolveRelaysForCommunity,
  isValidRelayUrl,
  isBootstrapPoolConfigured,
  type Session,
} from "./session.js";
import {
  parseInviteFromUrl,
  clearInviteFromUrl,
  verifyInviteSignature,
  type InvitePayload,
} from "./invite.js";
import { saveSubCellParentContext } from "./subcell-context.js";
import {
  isDesktopApp,
  startLocalNode,
  stopLocalNode,
  localNodeStatus,
  waitForPublicTunnel,
} from "./local-node.js";
import { rejectionMessage } from "./rejection-messages.js";
import {
  httpsToWssRelayUrl,
  tunnelStatusFromLocalNode,
  type TunnelStatus,
} from "./active-relays.js";

export type Phase = "loading" | "onboarding" | "locked" | "ready";
export type View = "cell" | "governance" | "proposals" | "identity";
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
  /** Desktop: local mailbox process is running on this machine. */
  relaySharing: boolean;
  /** Desktop: public tunnel readiness for remote friends. */
  tunnelStatus: TunnelStatus;

  init(): Promise<void>;
  setTheme(t: Theme): void;
  setView(v: View): void;
  toast(message: string, kind?: Toast["kind"]): void;
  dismissToast(id: string): void;

  createIdentity(displayName: string, password: string): Promise<boolean>;
  confirmBackup(): Promise<void>;
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

  invite(pubkey: string): Promise<void>;
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
  linkSubcell(childNamespaceId: string, bridgeKey?: string): Promise<void>;
  bridgeEscrow(remoteId: string, to: string, amount: string): Promise<void>;
  addRelay(url: string): void;
  removeRelay(url: string): void;
  setRelaySharing(on: boolean): Promise<void>;
}

let keyPair: KeyPair | null = null;

export const useStore = create<AppStore>((set, get) => ({
  theme: (localStorage.getItem("aethelos-theme") as Theme) ?? "dark",
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
  relaySharing: false,
  tunnelStatus: "idle",

  async init() {
    document.documentElement.setAttribute("data-theme", get().theme);
    const identities = await listIdentities();
    const session = loadSession();
    const pendingInvite = parseInviteFromUrl();
    set({ identities, session, pendingInvite });

    if (session && identities.some((i) => i.publicKeyHex === session.publicKeyHex)) {
      set({ phase: "locked", displayName: session.displayName });
    } else {
      set({ phase: "onboarding" });
    }
  },

  setTheme(t) {
    localStorage.setItem("aethelos-theme", t);
    document.documentElement.setAttribute("data-theme", t);
    set({ theme: t });
  },

  setView(v) {
    set({ view: v });
  },

  toast(message, kind = "info") {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
    setTimeout(() => get().dismissToast(id), 4500);
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
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
    if (key) await markBackedUp(key);
    set({ newMnemonic: null, identities: await listIdentities() });
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
    set({ myKey: kp.publicKeyHex });
    if (session && session.publicKeyHex === publicKeyHex) {
      await startNode(set, get, session.namespaceId, session.relayUrls);
    } else {
      set({ phase: "onboarding" });
    }
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
      phase: "locked",
    });
  },

  async startCommunity(cellName, options) {
    if (!keyPair) return;
    const namespaceId = generateNamespaceId();
    let relays: string[] = [];
    let publicRelayUrl: string | undefined;
    let tunnelStatus: TunnelStatus = "idle";

    if (isDesktopApp()) {
      const node = await startLocalNode();
      if (node?.localUrl) {
        relays = [node.localUrl];
        const withTunnel = node.publicUrl ? node : await waitForPublicTunnel(120_000);
        publicRelayUrl = withTunnel?.publicUrl;
        tunnelStatus = tunnelStatusFromLocalNode(
          true,
          publicRelayUrl,
          withTunnel?.cloudflaredAvailable ?? node.cloudflaredAvailable,
        );
      }
    }

    if (relays.length === 0) {
      relays = await resolveRelaysForCommunity(namespaceId, {
        ...(options?.customRelay ? { customRelay: options.customRelay } : {}),
        probe: !import.meta.env.DEV,
      });
    }

    if (relays.length === 0) {
      get().toast(
        isDesktopApp()
          ? "Could not start a mailbox. Build the relay (pnpm --filter @aethelos/relay build) and install cloudflared for friends abroad."
          : "No mailboxes available. Use the desktop app to share, or configure VITE_BOOTSTRAP_RELAYS before building.",
        "error",
      );
      return;
    }

    await startNode(set, get, namespaceId, relays);
    await get().controller?.genesis(cellName);

    if (publicRelayUrl) {
      await get().controller?.contributeRelay(httpsToWssRelayUrl(publicRelayUrl));
    } else if (isDesktopApp() && tunnelStatus === "failed") {
      get().toast(
        "Community created locally. Install cloudflared to invite friends far away.",
        "info",
      );
    } else if (!isDesktopApp() && !isBootstrapPoolConfigured()) {
      get().toast(
        "Community created, but no public mailboxes are configured for remote friends.",
        "info",
      );
    }

    persistSession(get);
    set({
      relaySharing: isDesktopApp() && Boolean(relays.length),
      tunnelStatus: isDesktopApp() ? tunnelStatus : "idle",
    });
    get().toast(`Community "${cellName}" created`, "success");
  },

  async joinCommunity(invite) {
    if (!keyPair) return;
    if (invite.sig && !verifyInviteSignature(invite)) {
      get().toast("Invite link signature is invalid — do not join", "error");
      return;
    }
    if (!invite.sig) {
      get().toast("Unsigned invite link — use a signed link from your inviter", "error");
      return;
    }
    const relays =
      invite.relays.length > 0 ? invite.relays : selectRelaysForCommunity(invite.ns);
    await startNode(set, get, invite.ns, relays);
    persistSession(get);
    clearInviteFromUrl();
    set({ pendingInvite: null });
    get().toast("Joined. Waiting for your invite to sync...", "info");
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
    await controller.acceptInvite(invite.inviter);
    get().toast("Invite accepted", "success");
  },

  async invite(pubkey) {
    const trimmed = pubkey.trim();
    const { pool, myKey, controller } = get();
    if (!controller || !pool || !myKey) return;
    const lienAmount = requiredVouchLien(pool, myKey);
    if (lienAmount <= 0n) {
      get().toast("Cannot compute vouch lien", "error");
      return;
    }
    if (availableToPledge(pool, myKey) < lienAmount) {
      get().toast(
        `Not enough unpledged Share (need ${formatPointsAmount(lienAmount)} pts available to pledge)`,
        "error",
      );
      return;
    }
    await controller.invite(trimmed);
    get().toast("Invite sent — community must approve admission", "success");
  },
  async cancelInvite(pubkey) {
    await get().controller?.cancelInvite(pubkey);
    get().toast("Invite cancelled — lien released", "success");
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
    await controller.transfer(recipient, formatPointsAmount(transferAmount), memo);
    get().toast("Transaction sent", "success");
  },
  async updateSlider(p, v, target) {
    await get().controller?.updateSlider(p, v, target);
  },
  async updateVouch(target, weight) {
    await get().controller?.updateVouch(target, weight);
  },
  async createProposal(kind, data) {
    await get().controller?.createProposal(crypto.randomUUID(), kind, data);
    get().toast("Proposal created", "success");
  },
  async voteProposal(id, approve) {
    await get().controller?.voteProposal(id, approve);
  },
  async joinSuperstructure(id) {
    const pool = get().pool;
    const myKey = get().myKey;
    const controller = get().controller;
    if (pool?.head !== myKey) {
      get().toast("Only the Head can propose joining a superstructure", "error");
      return;
    }
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
    await controller?.createProposal(crypto.randomUUID(), "join_superstructure", data);
    get().toast("Join superstructure proposal created", "success");
  },
  async leaveSuperstructure(id) {
    await get().controller?.createProposal(crypto.randomUUID(), "leave_superstructure", {
      target: id,
    });
    get().toast("Leave superstructure proposal created", "success");
  },
  async spawnSubCell(name) {
    if (!keyPair) return;
    const pool = get().pool;
    const controller = get().controller;
    if (!pool || !controller) return;
    if (pool.head !== get().myKey) {
      get().toast("Only the Head can spawn a sub-Cell", "error");
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) return;
    saveSubCellParentContext({
      parentNamespaceId: pool.namespaceId,
      parentCellName: pool.cellName,
      parentRelayUrls: controller.getRelayUrls(),
    });
    const namespaceId = generateNamespaceId();
    const relays = controller.getRelayUrls();
    await startNode(set, get, namespaceId, relays);
    await get().controller?.genesis(trimmed);
    persistSession(get);
    get().toast(
      `Sub-Cell "${trimmed}" created. Link it to "${pool.cellName}" from Proposals.`,
      "success",
    );
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
    await get().controller?.createProposal(crypto.randomUUID(), "link_subcell", data);
    get().toast("Link sub-Cell proposal created", "success");
  },
  async bridgeEscrow(remoteId, to, amount) {
    await get().controller?.createProposal(crypto.randomUUID(), "bridge_transfer", {
      target: remoteId.trim(),
      to: to.trim(),
      amount: amount.trim(),
    });
    get().toast("Bridge transfer proposed — vote to approve", "success");
  },
  addRelay(url) {
    const trimmed = url.trim();
    if (!isValidRelayUrl(trimmed)) {
      get().toast("Enter a valid ws:// or wss:// relay address.", "error");
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
      get().toast("Keep at least one relay connected.", "error");
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
      get().toast(
        "Install the desktop app to share a mailbox from your computer.",
        "info",
      );
      return;
    }
    const controller = get().controller;
    const pool = get().pool;
    const myKey = get().myKey;
    if (!controller) return;

    if (on) {
      const node = await startLocalNode();
      if (!node?.localUrl) {
        get().toast("Could not start a mailbox on this computer.", "error");
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
      set({ relaySharing: true, tunnelStatus });
      persistSession(get);
      if (tunnelStatus === "ready") {
        get().toast("Ready for friends abroad", "success");
      } else if (tunnelStatus === "failed") {
        get().toast(
          "Sharing locally only — install cloudflared for friends far away.",
          "info",
        );
      } else {
        get().toast("Sharing from this computer (local network only)", "info");
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
    set({ relaySharing: false, tunnelStatus: "idle" });
    get().toast("Stopped sharing from this computer", "info");
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
        if (msg) get().toast(msg, "error");
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
