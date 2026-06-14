import { describe, it, expect, vi } from "vitest";
import {
  pickBootstrapRelaysFromPool,
  sameOriginRelayUrl,
  relayHealthUrl,
  getBootstrapRelayPool,
  isLocalAppHost,
} from "../src/app/bootstrap-relays.js";

describe("bootstrap relay pool", () => {
  it("returns empty when prod pool has no configured relays", () => {
    const picked = pickBootstrapRelaysFromPool("ns-empty", [], 3);
    expect(picked).toEqual([]);
  });

  it("sameOriginRelayUrl uses wss on https pages", () => {
    vi.stubGlobal("window", {
      location: {
        protocol: "https:",
        host: "app.example.com",
        pathname: "/",
        origin: "https://app.example.com",
      },
    });
    expect(sameOriginRelayUrl()).toBe("wss://app.example.com/ws");
    vi.unstubAllGlobals();
  });

  it("sameOriginRelayUrl uses ws on http pages", () => {
    vi.stubGlobal("window", {
      location: {
        protocol: "http:",
        host: "192.168.1.10:8080",
        pathname: "/",
        origin: "http://192.168.1.10:8080",
      },
    });
    expect(sameOriginRelayUrl()).toBe("ws://192.168.1.10:8080/ws");
    vi.unstubAllGlobals();
  });

  it("relayHealthUrl maps same-origin ws to /healthz on app host", () => {
    expect(relayHealthUrl("wss://app.example.com/ws")).toBe(
      "https://app.example.com/healthz",
    );
  });

  it("pickBootstrapRelaysFromPool selects same-origin relay", () => {
    const pool = ["wss://share.example.com/ws"];
    expect(pickBootstrapRelaysFromPool("ns1", pool, 1)).toEqual([
      "wss://share.example.com/ws",
    ]);
  });

  it("isLocalAppHost detects localhost shells", () => {
    vi.stubGlobal("window", { location: { hostname: "localhost" } });
    expect(isLocalAppHost()).toBe(true);
    vi.unstubAllGlobals();
  });

  it("getBootstrapRelayPool uses same-origin relay on trycloudflare in DEV", () => {
    vi.stubGlobal("window", {
      location: {
        protocol: "https:",
        host: "abc.trycloudflare.com",
        hostname: "abc.trycloudflare.com",
      },
    });
    expect(getBootstrapRelayPool()).toEqual(["wss://abc.trycloudflare.com/ws"]);
    vi.unstubAllGlobals();
  });
});
