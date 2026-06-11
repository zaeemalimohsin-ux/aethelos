import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateKeyPair } from "@aethelos/core";
import {
  inviteCanonicalBody,
  signInvitePayload,
  verifyInviteSignature,
  decodeInvite,
  encodeInvite,
  buildInviteLink,
  inviteLinkBase,
  isLocalInviteOrigin,
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

describe("invite link base URL", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: { origin: "http://localhost:5173", pathname: "/" },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses VITE_INVITE_BASE_URL when configured", () => {
    vi.stubEnv("VITE_INVITE_BASE_URL", "https://app.example.org/");
    expect(inviteLinkBase()).toBe("https://app.example.org");
  });

  it("falls back to window.location when env unset", () => {
    vi.stubEnv("VITE_INVITE_BASE_URL", "");
    expect(inviteLinkBase()).toBe("http://localhost:5173");
  });

  it("buildInviteLink uses configured base", async () => {
    vi.stubEnv("VITE_INVITE_BASE_URL", "https://app.example.org");
    const kp = await generateKeyPair();
    const payload = await signInvitePayload(
      {
        v: 1,
        ns: "ns1",
        inviter: kp.publicKeyHex,
        cell: "Cell",
        relays: ["wss://relay.example"],
      },
      kp,
    );
    const link = buildInviteLink(payload);
    expect(link.startsWith("https://app.example.org#/join?d=")).toBe(true);
  });

  it("detects local invite origins", () => {
    expect(isLocalInviteOrigin("http://localhost:5173/#/join?d=abc")).toBe(true);
    expect(isLocalInviteOrigin("https://app.example.org/#/join?d=abc")).toBe(false);
  });
});
