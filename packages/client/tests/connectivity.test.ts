import { describe, it, expect, vi, beforeEach } from "vitest";

const startLocalNode = vi.fn();
const waitForPublicTunnel = vi.fn();
const isDesktopApp = vi.fn(() => false);
const resolveRelaysForCommunity = vi.fn();

vi.mock("../src/app/local-node.js", () => ({
  isDesktopApp,
  startLocalNode,
  waitForPublicTunnel,
}));

vi.mock("../src/app/session.js", () => ({
  resolveRelaysForCommunity,
}));

vi.mock("../src/node/controller.js", () => ({
  generateNamespaceId: vi.fn(() => "generated-ns"),
}));

describe("ensureOnline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isDesktopApp.mockReturnValue(false);
    resolveRelaysForCommunity.mockResolvedValue(["ws://localhost:8787"]);
  });

  it("resolves bootstrap relays when not on desktop", async () => {
    const { ensureOnline } = await import("../src/app/connectivity.js");
    const result = await ensureOnline({ namespaceId: "ns-1" });

    expect(resolveRelaysForCommunity).toHaveBeenCalledWith("ns-1", { probe: false });
    expect(result).toEqual({
      ok: true,
      relays: ["ws://localhost:8787"],
      tunnelStatus: "idle",
    });
  });

  it("passes customRelay and probe options to resolveRelaysForCommunity", async () => {
    const { ensureOnline } = await import("../src/app/connectivity.js");
    await ensureOnline({
      namespaceId: "ns-2",
      customRelay: "wss://friend.example.org/ws",
      probe: true,
    });

    expect(resolveRelaysForCommunity).toHaveBeenCalledWith("ns-2", {
      customRelay: "wss://friend.example.org/ws",
      probe: true,
    });
  });

  it("uses desktop sidecar relays when available", async () => {
    isDesktopApp.mockReturnValue(true);
    startLocalNode.mockResolvedValue({
      localUrl: "ws://127.0.0.1:8787",
      publicUrl: "https://abc.trycloudflare.com",
      cloudflaredAvailable: true,
    });
    waitForPublicTunnel.mockResolvedValue({
      localUrl: "ws://127.0.0.1:8787",
      publicUrl: "https://abc.trycloudflare.com",
      cloudflaredAvailable: true,
    });

    const { ensureOnline } = await import("../src/app/connectivity.js");
    const result = await ensureOnline({ desktopOnly: true });

    expect(startLocalNode).toHaveBeenCalled();
    expect(waitForPublicTunnel).toHaveBeenCalledWith(120_000);
    expect(resolveRelaysForCommunity).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.relays).toEqual(["ws://127.0.0.1:8787"]);
    expect(result.publicUrl).toBe("https://abc.trycloudflare.com");
    expect(result.tunnelStatus).toBe("ready");
  });

  it("waits for public tunnel when sidecar has no public URL yet", async () => {
    isDesktopApp.mockReturnValue(true);
    startLocalNode.mockResolvedValue({
      localUrl: "ws://127.0.0.1:8787",
      cloudflaredAvailable: true,
    });
    waitForPublicTunnel.mockResolvedValue({
      localUrl: "ws://127.0.0.1:8787",
      publicUrl: "https://tunnel.trycloudflare.com",
      cloudflaredAvailable: true,
    });

    const { ensureOnline } = await import("../src/app/connectivity.js");
    const result = await ensureOnline({ desktopOnly: true });

    expect(waitForPublicTunnel).toHaveBeenCalledWith(120_000);
    expect(result.publicUrl).toBe("https://tunnel.trycloudflare.com");
    expect(result.tunnelStatus).toBe("ready");
  });

  it("returns ok=false for desktopOnly when sidecar fails to start", async () => {
    isDesktopApp.mockReturnValue(true);
    startLocalNode.mockResolvedValue(null);

    const { ensureOnline } = await import("../src/app/connectivity.js");
    const result = await ensureOnline({ desktopOnly: true });

    expect(result.ok).toBe(false);
    expect(result.relays).toEqual([]);
    expect(resolveRelaysForCommunity).not.toHaveBeenCalled();
  });

  it("omits publicUrl from result when tunnel never becomes ready", async () => {
    isDesktopApp.mockReturnValue(true);
    startLocalNode.mockResolvedValue({
      localUrl: "ws://127.0.0.1:8787",
      cloudflaredAvailable: false,
    });
    waitForPublicTunnel.mockResolvedValue({
      localUrl: "ws://127.0.0.1:8787",
      cloudflaredAvailable: false,
    });

    const { ensureOnline } = await import("../src/app/connectivity.js");
    const result = await ensureOnline({ desktopOnly: true });

    expect(result.publicUrl).toBeUndefined();
    expect(result.tunnelStatus).toBe("failed");
  });
});
