import type { PoolSummary } from "./helpers.js";

declare global {
  interface Window {
    __aethelosTest?: {
      getPoolSummary: () => PoolSummary | null;
      getMyKey: () => string;
      getNamespaceId: () => string | null;
      transfer: (to: string, amount: string) => Promise<void>;
      advanceCirculation: (to: string) => Promise<void>;
      transferWithTimestamp: (to: string, amount: string, timestamp: number) => Promise<void>;
      updateSlider: (param: string, value: number, target?: string) => Promise<void>;
      createProposal: (kind: string, target: string) => Promise<void>;
      voteProposal: (id: string, approve: boolean) => Promise<void>;
      spawnSubCell: (name: string) => Promise<void>;
      linkSubcell: (childId: string, bridgeKey?: string) => Promise<void>;
      joinSuperstructure: (parentId: string) => Promise<void>;
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
    };
  }
}

export {};
