import { describe, it, expect, vi, afterEach } from "vitest";

describe("pilot-features", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("federation disabled when VITE_ENABLE_FEDERATION unset", async () => {
    vi.stubEnv("VITE_ENABLE_FEDERATION", "");
    const { isFederationEnabled } = await import("../src/app/pilot-features.js");
    expect(isFederationEnabled()).toBe(false);
  });

  it("federation enabled when VITE_ENABLE_FEDERATION is 1", async () => {
    vi.stubEnv("VITE_ENABLE_FEDERATION", "1");
    const { isFederationEnabled } = await import("../src/app/pilot-features.js");
    expect(isFederationEnabled()).toBe(true);
  });
});
