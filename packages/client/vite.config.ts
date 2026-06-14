import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const proofBuild = process.env.AETHELOS_PROOF_BUILD === "1";

export default defineConfig({
  root: ".",
  publicDir: "public",
  define: {
    __PROOF_E2E__: JSON.stringify(proofBuild ? "1" : "0"),
    ...(proofBuild ? { "import.meta.env.VITE_E2E": JSON.stringify("1") } : {}),
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    host: "127.0.0.1",
    // Cloudflare quick tunnels send a non-local Host header; allow them in dev.
    allowedHosts: true,
    proxy: {
      "/ws": {
        target: "ws://127.0.0.1:8787",
        ws: true,
        changeOrigin: true,
        rewrite: () => "/",
      },
    },
  },
  plugins: [
    {
      name: "aethelos-block-e2e-production-build",
      config(_config, { command }) {
        if (
          command === "build" &&
          process.env["VITE_E2E"] === "1" &&
          process.env["AETHELOS_PROOF_BUILD"] !== "1"
        ) {
          throw new Error(
            "Refusing production build with VITE_E2E=1 (test bridge enabled)",
          );
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
            purpose: "any maskable",
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
