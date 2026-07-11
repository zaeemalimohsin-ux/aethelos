/** Map reducer rejection reasons to plain-language toasts (production-safe subset). */
import { isFederationEnabled } from "./federation-features.js";

const USER_MESSAGES: Record<string, string> = {
  author_frozen:
    "That action was blocked — your account is frozen. See Proposals to unfreeze.",
  not_eligible_voter: "You cannot vote while frozen or before joining.",
  not_eligible_member: "You must be a member to do that.",
  not_member: "You must be a member to do that.",
  insufficient_balance: "Not enough Points for that transfer.",
  invalid_amount: "Enter a valid amount.",
  head_only: "Only the Head can propose that action.",
  proposal_not_open:
    "That proposal is closed or still syncing — refresh Proposals and try again.",
  proposal_closed:
    "That proposal is closed or still syncing — refresh Proposals and try again.",
  invite_pending: "That person already has a pending invite.",
  lien_exceeds_self: "You cannot pledge more lien than your available stake.",
  invalid_lien_amount: "That vouch amount is not valid.",
  use_proposal: "Use a proposal for that action instead.",
  self_vouch_forbidden: "You cannot vouch for yourself.",
  missing_target: "Choose a member for that action.",
  invalid_relay_url: "That connection point URL is not valid.",
  relay_cap_reached: "This community has reached its connection point limit.",
  already_initialized: "This community is already set up.",
  not_author: "Only the author can do that.",
  invalid_signature: "An event failed verification and was skipped.",
  namespace_mismatch: "A message for another community was ignored.",
  no_pending_invite: "No pending invite matches that action.",
  admission_not_approved: "The community has not approved your admission yet.",
  already_member: "You are already a member.",
  not_bridge: "Only bridge members can move value across linked chapters.",
  unknown_cell: "That linked chapter is not registered here.",
};

export function rejectionMessage(reason: string): string {
  if (reason === "cell_cap_reached") {
    return isFederationEnabled()
      ? "This community is at capacity — use a linked chapter for new members."
      : "This community has reached the member limit (50).";
  }
  return (
    USER_MESSAGES[reason] ?? `That action was blocked (${reason.replace(/_/g, " ")}).`
  );
}
