import { WIRE_VERSION } from "@aethelos/core";

export interface Diagnostics {
  generatedAt: string;
  wireVersion: number;
  userAgent: string;
  language: string;
  online: boolean;
  serviceWorker: boolean;
  storageEstimate?: { usage?: number; quota?: number };
}

/**
 * Privacy-preserving diagnostics: environment + capability info only. Contains no
 * keys, balances, event contents, or personal data.
 */
export function collectDiagnostics(): Diagnostics {
  return {
    generatedAt: new Date().toISOString(),
    wireVersion: WIRE_VERSION,
    userAgent: navigator.userAgent,
    language: navigator.language,
    online: navigator.onLine,
    serviceWorker: "serviceWorker" in navigator,
  };
}
