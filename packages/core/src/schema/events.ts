import type { NamespaceId, PublicKeyHex } from "./primitives.js";

/** All state-changing event types in AethelOS v1. */
export type EventType =
  | "genesis"
  | "transaction"
  | "epoch_close"
  | "slider_update"
  | "vouch_update"
  | "invite"
  | "cancel_invite"
  | "accept_invite"
  | "expel"
  | "proposal_create"
  | "proposal_vote"
  | "proposal_close"
  | "join_superstructure"
  | "leave_superstructure"
  | "bridge_transaction"
  | "relay_cell_governance"
  | "relay_contribute"
  | "relay_revoke"
  | "freeze_resolve";

export type GovernanceParameter =
  | "decay_rate"
  | "approval_threshold"
  | "vouch_threshold"
  | "epoch_interval"
  | "vouch_bond_rate";

export type ProposalKind =
  | "admit_member"
  | "resolve_fracture"
  | "expel_member"
  | "join_superstructure"
  | "leave_superstructure"
  | "link_subcell"
  | "bridge_transfer";

export interface GenesisPayload {
  type: "genesis";
  cellName: string;
  initialPoints: string;
  /** Serialized governance defaults at genesis. */
  parameters: Record<GovernanceParameter, number>;
}

export interface TransactionPayload {
  type: "transaction";
  to: PublicKeyHex;
  amount: string;
  memo?: string;
}

/**
 * Retired in favor of deterministic, log-derived Epoch checkpoints. Retained for wire
 * back-compat; the Reducer treats it as an idempotent no-op (cannot force decay).
 */
export interface EpochClosePayload {
  type: "epoch_close";
  epochNumber: number;
}

export interface SliderUpdatePayload {
  type: "slider_update";
  parameter: GovernanceParameter | "redistribution";
  /** Target member for redistribution sliders; omitted for governance params. */
  target?: PublicKeyHex;
  value: number;
}

export interface VouchUpdatePayload {
  type: "vouch_update";
  target: PublicKeyHex;
  weight: number;
}

export interface InvitePayload {
  type: "invite";
  invitee: PublicKeyHex;
  /**
   * Legacy/advisory. The binding lien is always derived by the reducer via
   * requiredVouchLien(); this wire field is ignored for economics and is optional.
   */
  vouchBondAmount?: string;
  parameters: Record<GovernanceParameter, number>;
}

export interface CancelInvitePayload {
  type: "cancel_invite";
  invitee: PublicKeyHex;
}

export interface AcceptInvitePayload {
  type: "accept_invite";
  inviter: PublicKeyHex;
}

export interface ExpelPayload {
  type: "expel";
  target: PublicKeyHex;
  reason?: string;
}

export interface ProposalCreatePayload {
  type: "proposal_create";
  proposalId: string;
  kind: ProposalKind;
  /** Kind-specific data (e.g. target pubkey, superstructure id). */
  data: Record<string, string>;
}

export interface ProposalVotePayload {
  type: "proposal_vote";
  proposalId: string;
  approve: boolean;
}

export interface ProposalClosePayload {
  type: "proposal_close";
  proposalId: string;
}

export interface JoinSuperstructurePayload {
  type: "join_superstructure";
  superstructureId: NamespaceId;
}

export interface LeaveSuperstructurePayload {
  type: "leave_superstructure";
  superstructureId: NamespaceId;
}

export interface BridgeTransactionPayload {
  type: "bridge_transaction";
  superstructureId: NamespaceId;
  localProposalId: string;
  to: PublicKeyHex;
  amount: string;
}

/** Head relays a child Cell's share-weighted governance averages upward to a parent Pool. */
export interface RelayCellGovernancePayload {
  type: "relay_cell_governance";
  cellId: NamespaceId;
  parameters: Record<GovernanceParameter, number>;
  population: number;
}

/** Member publishes a community mailbox URL (powerless relay) for peers to connect. */
export interface RelayContributePayload {
  type: "relay_contribute";
  url: string;
}

/** Member removes a community mailbox URL they previously published. */
export interface RelayRevokePayload {
  type: "relay_revoke";
  url: string;
}

export interface FreezeResolvePayload {
  type: "freeze_resolve";
  target: PublicKeyHex;
  action: "unfreeze" | "confirm_expel";
}

export type EventPayload =
  | GenesisPayload
  | TransactionPayload
  | EpochClosePayload
  | SliderUpdatePayload
  | VouchUpdatePayload
  | InvitePayload
  | CancelInvitePayload
  | AcceptInvitePayload
  | ExpelPayload
  | ProposalCreatePayload
  | ProposalVotePayload
  | ProposalClosePayload
  | JoinSuperstructurePayload
  | LeaveSuperstructurePayload
  | BridgeTransactionPayload
  | RelayCellGovernancePayload
  | RelayContributePayload
  | RelayRevokePayload
  | FreezeResolvePayload;
