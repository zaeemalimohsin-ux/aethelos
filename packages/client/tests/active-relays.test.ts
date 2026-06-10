import { describe, it, expect } from "vitest";
import {
  mergeActiveRelays,
  httpsToWssRelayUrl,
  isLocalOnlyRelayUrl,
  relayUrlsForInvite,
} from "../src/app/active-relays.js";

describe("mergeActiveRelays", () => {
  it("merges session and community relays when community has entries", () => {
    const merged = mergeActiveRelays(
      ["ws://localhost:8787"],
      ["wss://friend.example.org", "ws://localhost:8787"],
      "ns-1",
    );
    expect(merged).toEqual(["ws://localhost:8787", "wss://friend.example.org"]);
  });

  it("uses session relays when community list is empty", () => {
    const merged = mergeActiveRelays(["wss://mine.example.org"], [], "ns-2");
    expect(merged).toEqual(["wss://mine.example.org"]);
  });

  it("falls back to bootstrap selection when both are empty", () => {
    const merged = mergeActiveRelays([], [], "ns-3");
    expect(merged.length).toBeGreaterThan(0);
  });

  it("honors ignored community mailbox URLs", () => {
    const merged = mergeActiveRelays(
      ["ws://localhost:8787"],
      ["wss://bad.example.org", "wss://good.example.org"],
      "ns-4",
      { ignoredCommunityRelays: ["wss://bad.example.org"] },
    );
    expect(merged).toEqual(["ws://localhost:8787", "wss://good.example.org"]);
    expect(merged).not.toContain("wss://bad.example.org");
  });
});

describe("isLocalOnlyRelayUrl", () => {
  it("detects localhost and loopback URLs", () => {
    expect(isLocalOnlyRelayUrl("ws://127.0.0.1:8787")).toBe(true);
    expect(isLocalOnlyRelayUrl("ws://localhost:8787")).toBe(true);
    expect(isLocalOnlyRelayUrl("wss://relay.example.org")).toBe(false);
  });
});

describe("relayUrlsForInvite", () => {
  it("excludes localhost-only URLs from invite payloads", () => {
    const invite = relayUrlsForInvite(
      ["ws://127.0.0.1:8787", "wss://public.example.org"],
      "ns-invite",
    );
    expect(invite).toEqual(["wss://public.example.org"]);
  });
});

describe("httpsToWssRelayUrl", () => {
  it("maps quick tunnel https URL to wss", () => {
    expect(httpsToWssRelayUrl("https://abc.trycloudflare.com/path")).toBe(
      "wss://abc.trycloudflare.com/",
    );
  });
});
