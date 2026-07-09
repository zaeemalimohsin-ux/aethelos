import type { GovernanceParameter, ProposalKind } from "@aethelos/core";

/** Plain-language explanations — philosophy made legible, not dumbed down. */
export const CONCEPT = {
  stake:
    "Your stake is your share of the community pool. It grows and shrinks with trade, invites, and the passage of time.",
  points:
    "Points are the community's unit of value. Everyone can verify the same ledger on their own device.",
  vouch:
    "When you invite someone, you pledge a Vouch Lien — a forfeitable slice of your own Share that stays in your wallet. If they harm the community, that slice can be forfeit. The community must approve before they join.",
  head: "The Head is whoever the community currently trusts to propose certain actions. A challenger must reach the vouch threshold to take the role.",
  epoch:
    "Stake circulates continuously on activity — a time-proportional slice accrues to the commons. On a schedule the community sets, those commons are redistributed.",
  relay:
    "A relay is just a mailbox for messages. It cannot change your balances or rules; anyone can run one.",
  connection:
    "Your community stays in sync over the internet. The app picks connection points automatically.",
  proposal:
    "Big decisions go through proposals. Members vote with the weight of their stake until the community's approval threshold is met.",
  subCell:
    "When a community grows large, start a linked chapter that connects upward — scale by depth, not by cramming everyone into one room.",
} as const;

/** Advanced network panel — operator-facing relay explanation. */
export const CONCEPT_NETWORK = CONCEPT.relay;

export const GOVERNANCE_HELP: Record<GovernanceParameter, string> = {
  decay_rate:
    "Target share of your stake that accrues to the commons over a calendar year (365 days). Accrual is time-proportional on every signed activity — not a fixed slice per redistribution.",
  approval_threshold: "What share of vote-weight must approve a proposal for it to pass.",
  vouch_threshold: "How much vouching weight a candidate needs to become Head.",
  epoch_interval:
    "Minutes between redistribution flushes from the commons. Accrual runs continuously on activity; this slider sets how often pooled stake is shared out.",
  vouch_bond_rate:
    "Share of your stake pledged as a lien when vouching for a new member, computed automatically (super-linear per soul sustained).",
};

export const PROPOSAL_HELP: Record<ProposalKind, string> = {
  admit_member: "Approve admitting someone who has a pending invite and vouch lien.",
  resolve_fracture: "Unfreeze an account the community paused after suspicious activity.",
  expel_member: "Remove a member after the community agrees.",
  join_superstructure: "Link this community upward to a larger group (advanced).",
  leave_superstructure: "Delink from a parent group (advanced).",
  link_subcell: "Register a linked chapter that branched off this one (advanced).",
  bridge_transfer:
    "Approve sending Points to someone in a linked chapter. Bridge members mirror after approval.",
};

export const PROPOSAL_LABELS: Record<ProposalKind, string> = {
  admit_member: "Admit member",
  resolve_fracture: "Unfreeze account",
  expel_member: "Remove member",
  join_superstructure: "Link to a larger group",
  leave_superstructure: "Leave parent group",
  link_subcell: "Link a chapter",
  bridge_transfer: "Send to another chapter",
};

/** Proposal kinds shown in the simple picker. */
export const COMMON_PROPOSAL_KINDS: ProposalKind[] = ["expel_member", "resolve_fracture"];

export const ADVANCED_PROPOSAL_KINDS: ProposalKind[] = [
  "join_superstructure",
  "leave_superstructure",
  "link_subcell",
];
