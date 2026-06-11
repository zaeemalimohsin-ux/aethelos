import { describe, expect, it } from "vitest";
import { filterRemoteRelayUrls, isLocalOnlyRelayUrl } from "../src/relay/url-utils.js";

describe("relay url utils", () => {
  it("flags localhost-only relay URLs", () => {
    expect(isLocalOnlyRelayUrl("ws://127.0.0.1:8787/ws")).toBe(true);
    expect(isLocalOnlyRelayUrl("wss://relay.example.org/ws")).toBe(false);
  });

  it("filters local relays from invite lists", () => {
    const local = "ws://127.0.0.1:8787/ws";
    const remote = "wss://tunnel.trycloudflare.com/ws";
    expect(filterRemoteRelayUrls([local, remote, local])).toEqual([remote]);
  });
});
