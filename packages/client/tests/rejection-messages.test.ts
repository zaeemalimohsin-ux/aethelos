import { describe, it, expect } from "vitest";
import { rejectionMessage } from "../src/app/rejection-messages.js";

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

  it("does not surface raw snake_case for unknown reasons", () => {
    const msg = rejectionMessage("some_unknown_reason");
    expect(msg).toMatch(/blocked/i);
    expect(msg).not.toContain("some_unknown_reason");
  });
});
