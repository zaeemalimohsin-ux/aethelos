import { describe, it, expect } from "vitest";
import { generateKeyPair } from "@aethelos/core";
import {
  inviteCanonicalBody,
  signInvitePayload,
  verifyInviteSignature,
  decodeInvite,
  encodeInvite,
} from "../src/app/invite.js";

describe("invite signatures", () => {
  it("validates a signed invite payload", async () => {
    const kp = await generateKeyPair();
    const payload = await signInvitePayload(
      {
        v: 1,
        ns: "test-ns",
        inviter: kp.publicKeyHex,
        cell: "Test Cell",
        relays: ["ws://localhost:8787"],
      },
      kp,
    );
    expect(verifyInviteSignature(payload)).toBe(true);
  });

  it("rejects tampered relay URLs", async () => {
    const kp = await generateKeyPair();
    const payload = await signInvitePayload(
      {
        v: 1,
        ns: "test-ns",
        inviter: kp.publicKeyHex,
        cell: "Test Cell",
        relays: ["ws://localhost:8787"],
      },
      kp,
    );
    const tampered = { ...payload, relays: ["ws://evil.example"] };
    expect(verifyInviteSignature(tampered)).toBe(false);
  });

  it("round-trips encode/decode", async () => {
    const kp = await generateKeyPair();
    const payload = await signInvitePayload(
      {
        v: 1,
        ns: "roundtrip",
        inviter: kp.publicKeyHex,
        cell: "Round",
        relays: ["ws://a", "ws://b"],
      },
      kp,
    );
    const encoded = encodeInvite(payload);
    const decoded = decodeInvite(encoded);
    expect(decoded?.ns).toBe("roundtrip");
    expect(decoded?.sig).toBe(payload.sig);
    expect(inviteCanonicalBody(decoded!)).toBe(
      inviteCanonicalBody({ ...payload, sig: undefined }),
    );
  });
});
