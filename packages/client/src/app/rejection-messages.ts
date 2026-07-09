/** Map reducer rejection reasons to plain-language toasts (production-safe subset). */
const USER_MESSAGES: Record<string, string> = {
  author_frozen:
    "That action was blocked — your account is frozen. See Proposals to unfreeze.",
  not_eligible_voter: "You cannot vote while frozen or before joining.",
  not_eligible_member: "You must be a member to do that.",
  cell_cap_reached:
    "This community is at capacity — use a sub-community for new members.",
  not_member: "You must be a member to do that.",
  insufficient_balance: "Not enough Points for that transfer.",
  invalid_amount: "Enter a valid amount.",
  head_only: "Only the Head can propose that action.",
  proposal_closed: "That proposal is already closed.",
  invalid_signature: "An event failed verification and was skipped.",
  namespace_mismatch: "A message for another community was ignored.",
  no_pending_invite: "No pending invite matches that action.",
  admission_not_approved: "The community has not approved your admission yet.",
  already_member: "You are already a member.",
};

export function rejectionMessage(reason: string): string {
  return (
    USER_MESSAGES[reason] ?? `That action was blocked (${reason.replace(/_/g, " ")}).`
  );
}
