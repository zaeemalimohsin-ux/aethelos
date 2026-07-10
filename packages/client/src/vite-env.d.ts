/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string;
declare const __PROOF_E2E__: "0" | "1";

interface ImportMetaEnv {
  readonly VITE_DEFAULT_RELAY_URL?: string;
  readonly VITE_BOOTSTRAP_RELAYS?: string;
  readonly VITE_INVITE_BASE_URL?: string;
  readonly VITE_DOWNLOAD_URL?: string;
  readonly VITE_RELAY_OPERATOR_GUIDE_URL?: string;
  readonly VITE_E2E?: string;
  readonly VITE_ENABLE_FEDERATION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
