import type { PoolSummary } from "./helpers.js";

declare global {
  interface Window {
    __aethelosTest?: {
      getPoolSummary: () => PoolSummary | null;
      getMyKey: () => string;
      getNamespaceId: () => string | null;
      getConnectionStatus: () => {
        relaySharing: boolean;
        tunnelStatus: string;
        shareUrl?: string | null;
      };
      getShareUrl: () => string | null;
      getSyncStatus: () => {
        overall: "online" | "connecting" | "offline";
        relays: { url: string; status: string }[];
        pendingOutbox: number;
        outboxAtCap?: boolean;
      } | null;
      disconnectSyncForTests: () => void;
      setRelaySharing: (on: boolean) => Promise<void>;
      ensureDesktopShare: () => Promise<void>;
      syncDesktopRelayContribution: (publicHttpsUrl?: string) => Promise<void>;
      getCommunityRelays: () => string[];
      rotateDesktopTunnelUrlForTests: (newHttpsUrl: string) => Promise<void>;
      decodeInviteFromLink: (link: string) => { relays?: string[]; ns?: string } | null;
      getLocalNodeStatus: () => Promise<{
        localUrl: string;
        publicUrl?: string;
        running: boolean;
        cloudflaredAvailable?: boolean;
      } | null>;
      transfer: (to: string, amount: string) => Promise<void>;
      advanceCirculation: (to: string) => Promise<void>;
      transferWithTimestamp: (
        to: string,
        amount: string,
        timestamp: number,
      ) => Promise<void>;
      updateSlider: (param: string, value: number, target?: string) => Promise<void>;
      createProposal: (kind: string, target: string) => Promise<void>;
      voteProposal: (id: string, approve: boolean) => Promise<void>;
      spawnSubCell: (name: string) => Promise<void>;
      linkSubcell: (childId: string, bridgeKey?: string) => Promise<void>;
      joinSuperstructure: (parentId: string) => Promise<void>;
      createChildChapterLink: () => Promise<string | null>;
      createParentChapterLink: () => Promise<string | null>;
      applyChapterLink: (raw: string) => Promise<void>;
      invite: (invitee: string) => Promise<void>;
      acceptPendingInvite: () => Promise<void>;
      updateVouch: (target: string, weight: number) => Promise<void>;
      requiredVouchLien: () => string;
      requiredVouchBond: () => string;
      approveAdmission: (invitee: string) => Promise<void>;
      bridgeEscrow: (remoteId: string, to: string, amount: string) => Promise<void>;
      leaveSuperstructure: (parentId: string) => Promise<void>;
      exportLog: () => Promise<string>;
      importLog: (json: string) => Promise<{ imported: number; skipped: number }>;
      dispatchDoubleSpend?: (to: string, amount: string) => Promise<void>;
      dispatchSiblingDoubleSpend?: (to: string, amount: string) => Promise<void>;
    };
  }
}

export {};
