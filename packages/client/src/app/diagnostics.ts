import { WIRE_VERSION } from "@aethelos/core";
import { getAnalyticsEvents, type AnalyticsEvent } from "./analytics.js";

export interface Diagnostics {
  generatedAt: string;
  appVersion: string;
  wireVersion: number;
  userAgent: string;
  language: string;
  online: boolean;
  serviceWorker: boolean;
  storageEstimate?: { usage?: number; quota?: number };
  analyticsEvents: readonly AnalyticsEvent[];
}

/**
 * Privacy-preserving diagnostics: environment + capability info only. Contains no
 * keys, balances, event contents, or personal data.
 */
export function collectDiagnostics(): Diagnostics {
  return {
    generatedAt: new Date().toISOString(),
    appVersion: typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "unknown",
    wireVersion: WIRE_VERSION,
    userAgent: navigator.userAgent,
    language: navigator.language,
    online: navigator.onLine,
    serviceWorker: "serviceWorker" in navigator,
    analyticsEvents: getAnalyticsEvents(),
  };
}
