/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_DEFAULT_RELAY_URL?: string;
  readonly VITE_BOOTSTRAP_RELAYS?: string;
  readonly VITE_RELAY_OPERATOR_GUIDE_URL?: string;
  readonly VITE_E2E?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
