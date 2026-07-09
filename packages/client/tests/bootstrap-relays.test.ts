import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  pickBootstrapRelaysFromPool,
  sameOriginRelayUrl,
  relayHealthUrl,
  getBootstrapRelayPool,
  isLocalAppHost,
  hasExplicitBootstrapRelays,
  isBootstrapPoolConfigured,
  canAttemptCommunityGenesis,
  probeAnyRelay,
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

  it("hasExplicitBootstrapRelays is false without env overrides despite same-origin", () => {
    vi.stubEnv("VITE_BOOTSTRAP_RELAYS", "");
    vi.stubEnv("VITE_DEFAULT_RELAY_URL", "");
    vi.stubGlobal("window", {
      location: {
        protocol: "https:",
        host: "app.example.com",
        pathname: "/",
        origin: "https://app.example.com",
      },
    });
    expect(hasExplicitBootstrapRelays()).toBe(false);
    expect(getBootstrapRelayPool()).toContain("wss://app.example.com/ws");
    expect(canAttemptCommunityGenesis()).toBe(true);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("canAttemptCommunityGenesis true for docker-style same-origin host", () => {
    vi.stubEnv("VITE_BOOTSTRAP_RELAYS", "");
    vi.stubEnv("VITE_DEFAULT_RELAY_URL", "");
    vi.stubGlobal("window", {
      location: {
        protocol: "http:",
        host: "localhost:8080",
        hostname: "localhost",
        pathname: "/",
        origin: "http://localhost:8080",
      },
    });
    expect(hasExplicitBootstrapRelays()).toBe(false);
    expect(canAttemptCommunityGenesis()).toBe(true);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("probeAnyRelay returns true when one relay is live", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const result = await probeAnyRelay([
      "wss://live.example.com/ws",
      "wss://dead.example.com/ws",
    ]);
    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("probeAnyRelay returns false when all relays fail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(
      await probeAnyRelay(["wss://dead1.example.com/ws", "wss://dead2.example.com/ws"]),
    ).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("bootstrap relay pool (production)", () => {
  const originalDev = import.meta.env.DEV;
  const originalProd = import.meta.env.PROD;

  beforeEach(() => {
    // @ts-expect-error vitest runtime override
    import.meta.env.DEV = false;
    // @ts-expect-error vitest runtime override
    import.meta.env.PROD = true;
  });

  afterEach(() => {
    // @ts-expect-error vitest runtime override
    import.meta.env.DEV = originalDev;
    // @ts-expect-error vitest runtime override
    import.meta.env.PROD = originalProd;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("localhost co-hosted publish (docker) → canAttemptCommunityGenesis true in prod", () => {
    vi.stubEnv("VITE_BOOTSTRAP_RELAYS", "");
    vi.stubEnv("VITE_DEFAULT_RELAY_URL", "");
    vi.stubGlobal("window", {
      location: {
        protocol: "http:",
        host: "localhost:8080",
        hostname: "localhost",
        pathname: "/",
        origin: "http://localhost:8080",
      },
    });
    expect(canAttemptCommunityGenesis()).toBe(true);
  });

  it("public host same-origin → canAttemptCommunityGenesis true in prod", () => {
    vi.stubEnv("VITE_BOOTSTRAP_RELAYS", "");
    vi.stubEnv("VITE_DEFAULT_RELAY_URL", "");
    vi.stubGlobal("window", {
      location: {
        protocol: "https:",
        host: "app.example.com",
        hostname: "app.example.com",
        pathname: "/",
        origin: "https://app.example.com",
      },
    });
    expect(canAttemptCommunityGenesis()).toBe(true);
  });

  it("explicit env relays → canAttemptCommunityGenesis true in prod", () => {
    vi.stubEnv("VITE_BOOTSTRAP_RELAYS", "wss://relay.example.com/ws");
    vi.stubEnv("VITE_DEFAULT_RELAY_URL", "");
    vi.stubGlobal("window", {
      location: {
        protocol: "http:",
        host: "localhost:5173",
        hostname: "localhost",
        pathname: "/",
        origin: "http://localhost:5173",
      },
    });
    expect(canAttemptCommunityGenesis()).toBe(true);
  });

  it("isBootstrapPoolConfigured vs canAttemptCommunityGenesis divergence on bundled host", () => {
    vi.stubEnv("VITE_BOOTSTRAP_RELAYS", "");
    vi.stubEnv("VITE_DEFAULT_RELAY_URL", "");
    vi.stubGlobal("window", {
      location: {
        protocol: "https:",
        host: "deploy.example.com",
        hostname: "deploy.example.com",
        pathname: "/",
        origin: "https://deploy.example.com",
      },
    });
    expect(isBootstrapPoolConfigured()).toBe(false);
    expect(canAttemptCommunityGenesis()).toBe(true);
  });
});
