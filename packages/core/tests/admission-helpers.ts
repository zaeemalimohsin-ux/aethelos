import type { KeyPair, EventPayload } from "../src/index.js";
import { admissionProposalId } from "../src/index.js";

/** Share-weighted vote to approve a pending admission (after invite event). */
export function admissionApprovalVote(
  voter: KeyPair,
  invitee: string,
): { author: KeyPair; payload: EventPayload } {
  return {
    author: voter,
    payload: {
      type: "proposal_vote",
      proposalId: admissionProposalId(invitee),
      approve: true,
    },
  };
}
