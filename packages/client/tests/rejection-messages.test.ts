import { describe, it, expect } from "vitest";
import { rejectionMessage } from "../src/app/rejection-messages.js";

const USER_MESSAGE_KEYS = [
  "author_frozen",
  "not_eligible_voter",
  "not_eligible_member",
  "cell_cap_reached",
  "not_member",
  "insufficient_balance",
  "invalid_amount",
  "head_only",
  "proposal_not_open",
  "proposal_closed",
  "invite_pending",
  "lien_exceeds_self",
  "invalid_lien_amount",
  "use_proposal",
  "self_vouch_forbidden",
  "missing_target",
  "invalid_relay_url",
  "relay_cap_reached",
  "already_initialized",
  "not_author",
  "invalid_signature",
  "namespace_mismatch",
  "no_pending_invite",
  "admission_not_approved",
  "already_member",
] as const;

describe("rejectionMessage", () => {
  it("maps proposal_not_open to user-facing copy", () => {
    const msg = rejectionMessage("proposal_not_open");
    expect(msg).not.toMatch(/proposal not open/i);
    expect(msg).toMatch(/closed or still syncing/i);
  });

  it("maps pilot-critical invite and vouch reasons", () => {
    expect(rejectionMessage("invite_pending")).toMatch(/pending invite/i);
    expect(rejectionMessage("lien_exceeds_self")).toMatch(/stake/i);
    expect(rejectionMessage("self_vouch_forbidden")).toMatch(/yourself/i);
    expect(rejectionMessage("invalid_relay_url")).toMatch(/connection point/i);
  });

  it("maps crypto and namespace rejection reasons", () => {
    expect(rejectionMessage("invalid_signature")).toMatch(/failed verification/i);
    expect(rejectionMessage("namespace_mismatch")).toMatch(/another community/i);
    expect(rejectionMessage("admission_not_approved")).toMatch(/not approved/i);
    expect(rejectionMessage("author_frozen")).toMatch(/frozen/i);
  });

  it.each(USER_MESSAGE_KEYS)("maps %s without raw snake_case", (reason) => {
    const msg = rejectionMessage(reason);
    expect(msg).not.toContain(reason);
    expect(msg.length).toBeGreaterThan(10);
  });

  it("does not surface raw snake_case for unknown reasons", () => {
    const msg = rejectionMessage("some_unknown_reason");
    expect(msg).toMatch(/blocked/i);
    expect(msg).not.toContain("some_unknown_reason");
  });
});
