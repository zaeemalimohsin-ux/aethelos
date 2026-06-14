import "./crypto-init.js";
import "./design/base.css";
import "./design/components.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { registerSW } from "virtual:pwa-register";
import { installTestBridge } from "./app/test-bridge.js";
import { notifySwUpdateReady, setSwUpdateHandler } from "./app/sw-update.js";

const e2eEnabled = __PROOF_E2E__ === "1" || import.meta.env.VITE_E2E === "1";

if (e2eEnabled) {
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

// Service worker with an in-app update prompt (Pass 4). Skip in E2E.
if (!e2eEnabled) {
  const updateSW = registerSW({
    onNeedRefresh() {
      setSwUpdateHandler(updateSW);
      notifySwUpdateReady();
    },
  });
}
