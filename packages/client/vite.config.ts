import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  root: ".",
  publicDir: "public",
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  server: {
    port: 5173,
  },
  plugins: [
    {
      name: "aethelos-block-e2e-production-build",
      config(_config, { command }) {
        if (command === "build" && process.env["VITE_E2E"] === "1") {
          throw new Error("Refusing production build with VITE_E2E=1 (test bridge enabled)");
        }
      },
    },
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "AethelOS",
        short_name: "AethelOS",
        description: "Substrate of daily community life — no external authority required",
        theme_color: "#1a1a2e",
        background_color: "#0f0f1a",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^ws:\/\//,
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
});
