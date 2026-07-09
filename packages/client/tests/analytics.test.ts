import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const navigatorStub = {
  userAgent: "vitest",
  language: "en-US",
  onLine: true,
  serviceWorker: false,
};

describe("analytics", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("navigator", navigatorStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("records event name, ISO timestamp, and optional props", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-09T12:00:00.000Z"));

    const { trackEvent, getAnalyticsEvents } = await import("../src/app/analytics.js");
    trackEvent("onboarding_step", { step: "welcome" });

    const [event] = getAnalyticsEvents();
    expect(event).toEqual({
      name: "onboarding_step",
      at: "2026-07-09T12:00:00.000Z",
      props: { step: "welcome" },
    });

    vi.useRealTimers();
  });

  it("omits props when not provided", async () => {
    const { trackEvent, getAnalyticsEvents } = await import("../src/app/analytics.js");
    trackEvent("genesis_success");

    const [event] = getAnalyticsEvents();
    expect(event.name).toBe("genesis_success");
    expect(event.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(event).not.toHaveProperty("props");
  });

  it("keeps at most 50 events, dropping the oldest", async () => {
    const { trackEvent, getAnalyticsEvents } = await import("../src/app/analytics.js");

    for (let i = 0; i < 52; i++) {
      trackEvent(`event-${i}`);
    }

    const events = getAnalyticsEvents();
    expect(events).toHaveLength(50);
    expect(events[0]?.name).toBe("event-2");
    expect(events.at(-1)?.name).toBe("event-51");
  });
});

describe("collectDiagnostics analytics integration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("navigator", navigatorStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("includes buffered analytics events in diagnostics export", async () => {
    const { trackEvent } = await import("../src/app/analytics.js");
    const { collectDiagnostics } = await import("../src/app/diagnostics.js");

    trackEvent("join_failed", { reason: "connection_unreachable" });
    trackEvent("genesis_success", { cellName: "Alpha" });

    const diagnostics = collectDiagnostics();

    expect(diagnostics.analyticsEvents).toHaveLength(2);
    expect(diagnostics.analyticsEvents[0]).toMatchObject({
      name: "join_failed",
      props: { reason: "connection_unreachable" },
    });
    expect(diagnostics.analyticsEvents[1]).toMatchObject({
      name: "genesis_success",
      props: { cellName: "Alpha" },
    });
    expect(diagnostics.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(diagnostics.userAgent).toBe("vitest");
    expect(diagnostics.online).toBe(true);
  });

  it("reflects ring buffer cap in diagnostics export", async () => {
    const { trackEvent } = await import("../src/app/analytics.js");
    const { collectDiagnostics } = await import("../src/app/diagnostics.js");

    for (let i = 0; i < 55; i++) {
      trackEvent(`diag-event-${i}`);
    }

    const { analyticsEvents } = collectDiagnostics();
    expect(analyticsEvents).toHaveLength(50);
    expect(analyticsEvents[0]?.name).toBe("diag-event-5");
    expect(analyticsEvents.at(-1)?.name).toBe("diag-event-54");
  });
});
