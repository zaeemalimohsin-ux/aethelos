/**

 * Dev/E2E-only bridge for Playwright to read pool state and drive the node

 * without scraping the DOM. Enabled when VITE_E2E=1.

 */

import {
  totalPoolPoints,
  requiredVouchLien,
  admissionProposalId,
  TIMESTAMP_FORWARD_SKEW_MS,
  formatPointsAmount,
  type GovernanceParameter,
  type PoolState,
  type ProposalKind,
} from "@aethelos/core";

import { useStore } from "./store.js";

function poolSummary(pool: PoolState) {
  return {
    namespaceId: pool.namespaceId,

    cellName: pool.cellName,

    memberCount: pool.members.length,

    members: pool.members,

    head: pool.head,

    epochNumber: pool.epochNumber,

    lastEpochTimestamp: pool.lastEpochTimestamp,

    lastRedistributionTimestamp: pool.lastRedistributionTimestamp,

    maxEventTimestamp: pool.maxEventTimestamp,

    eventsSinceEpoch: pool.eventsSinceEpoch,

    eventCount: pool.eventCount,

    totalPoints: formatPointsAmount(totalPoolPoints(pool)),

    balances: Object.fromEntries(
      Object.entries(pool.balances).map(([k, v]) => [k, formatPointsAmount(v)]),
    ),

    commons: formatPointsAmount(pool.commons),

    parameters: { ...pool.parameters },

    childCells: pool.childCells ?? [],

    parentSuperstructures: pool.parentSuperstructures,

    pendingInviteCount: Object.keys(pool.pendingInvites).length,

    proposalCount: Object.keys(pool.proposals).length,

    proposals: Object.values(pool.proposals).map((p) => ({
      id: p.id,

      kind: p.kind,

      closed: p.closed,

      executed: p.executed,

      votesFor: formatPointsAmount(p.votesFor),

      votesAgainst: formatPointsAmount(p.votesAgainst),
    })),
  };
}

export function installTestBridge(): void {
  const e2eEnabled = __PROOF_E2E__ === "1" || import.meta.env.VITE_E2E === "1";
  if (import.meta.env.PROD && !e2eEnabled) {
    throw new Error("Test bridge cannot run in production builds");
  }

  const bridge = {
    getPoolSummary() {
      const pool = useStore.getState().pool;

      return pool ? poolSummary(pool) : null;
    },

    getMyKey() {
      return useStore.getState().myKey;
    },

    isAdmissionApproved() {
      const pool = useStore.getState().pool;
      const myKey = useStore.getState().myKey;
      return Boolean(pool?.pendingInvites[myKey]?.admissionApproved);
    },

    getNamespaceId() {
      return useStore.getState().controller?.getNamespaceId() ?? null;
    },

    getConnectionStatus() {
      const { relaySharing, tunnelStatus } = useStore.getState();
      return { relaySharing, tunnelStatus };
    },

    getSyncStatus() {
      return useStore.getState().sync;
    },

    async setRelaySharing(on: boolean) {
      await useStore.getState().setRelaySharing(on);
    },

    async getLocalNodeStatus() {
      const { localNodeStatus } = await import("./local-node.js");
      return localNodeStatus();
    },

    async transfer(to: string, amount: string) {
      await useStore.getState().transfer(to, amount);
    },

    async transferWithTimestamp(to: string, amount: string, timestamp: number) {
      await useStore.getState().controller?.transfer(to, amount, undefined, timestamp);
    },

    async advanceCirculation(to: string) {
      const pool = useStore.getState().pool;
      if (!pool || pool.lastRedistributionTimestamp <= 0) throw new Error("no pool");

      const intervalMs = Math.round(pool.parameters.epoch_interval) * 60_000;
      const targetEpoch = pool.epochNumber + 1;
      const maxSteps = Math.ceil(intervalMs / TIMESTAMP_FORWARD_SKEW_MS) + 5;

      const waitForProgress = async (before: NonNullable<typeof pool>) => {
        const deadline = Date.now() + 15_000;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 100));
          const current = useStore.getState().pool;
          if (!current) return;
          if (current.epochNumber >= targetEpoch) return;
          if (current.maxEventTimestamp > before.maxEventTimestamp) return;
        }
      };

      for (let i = 0; i < maxSteps; i++) {
        const current = useStore.getState().pool;
        if (!current || current.epochNumber >= targetEpoch) return;

        const maxTs = current.maxEventTimestamp || current.lastRedistributionTimestamp;
        const timestamp = maxTs + TIMESTAMP_FORWARD_SKEW_MS;
        await useStore.getState().controller?.transfer(to, "1", undefined, timestamp);
        await waitForProgress(current);
      }

      const after = useStore.getState().pool;
      if (!after || after.epochNumber < targetEpoch) {
        throw new Error("advanceCirculation failed");
      }
    },

    async updateSlider(param: string, value: number, target?: string) {
      await useStore

        .getState()

        .updateSlider(param as GovernanceParameter | "redistribution", value, target);
    },

    async createProposal(kind: string, target: string) {
      await useStore.getState().createProposal(kind as ProposalKind, { target });
    },

    async voteProposal(id: string, approve: boolean) {
      await useStore.getState().voteProposal(id, approve);
    },

    async spawnSubCell(name: string) {
      await useStore.getState().spawnSubCell(name);
    },

    async linkSubcell(childId: string, bridgeKey?: string) {
      await useStore.getState().linkSubcell(childId, bridgeKey);
    },

    async joinSuperstructure(parentId: string) {
      await useStore.getState().joinSuperstructure(parentId);
    },

    async invite(invitee: string) {
      await useStore.getState().invite(invitee);
    },

    async acceptPendingInvite() {
      await useStore.getState().acceptPendingInvite();
    },

    async updateVouch(target: string, weight: number) {
      await useStore.getState().updateVouch(target, weight);
    },

    requiredVouchLien() {
      const pool = useStore.getState().pool;

      const myKey = useStore.getState().myKey;

      if (!pool || !myKey) return "500";

      return formatPointsAmount(requiredVouchLien(pool, myKey));
    },

    /** @deprecated use requiredVouchLien */
    requiredVouchBond() {
      const pool = useStore.getState().pool;
      const myKey = useStore.getState().myKey;
      if (!pool || !myKey) return "500";
      return formatPointsAmount(requiredVouchLien(pool, myKey));
    },

    async approveAdmission(invitee: string) {
      await useStore.getState().voteProposal(admissionProposalId(invitee), true);
    },

    async bridgeEscrow(remoteId: string, to: string, amount: string) {
      await useStore.getState().bridgeEscrow(remoteId, to, amount);
    },

    async leaveSuperstructure(parentId: string) {
      await useStore.getState().leaveSuperstructure(parentId);
    },

    async exportLog() {
      return (await useStore.getState().controller?.exportLog()) ?? "[]";
    },

    async importLog(json: string) {
      return (
        (await useStore.getState().controller?.importLog(json)) ?? {
          imported: 0,
          skipped: 0,
        }
      );
    },
  };

  (window as Window & { __aethelosTest?: typeof bridge }).__aethelosTest = bridge;
}
