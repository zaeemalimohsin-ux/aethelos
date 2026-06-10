import "./crypto-init.js";
import "./design/base.css";
import "./design/components.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { registerSW } from "virtual:pwa-register";
import { installTestBridge } from "./app/test-bridge.js";

if (import.meta.env["VITE_E2E"] === "1") {
  installTestBridge();
}

const container = document.getElementById("app");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

// Service worker with an update prompt (Phase 9). Skip in E2E — confirm() flakes tests.
if (import.meta.env["VITE_E2E"] !== "1") {
  const updateSW = registerSW({
    onNeedRefresh() {
      if (confirm("A new version of AethelOS is available. Reload now?")) {
        void updateSW(true);
      }
    },
  });
}
