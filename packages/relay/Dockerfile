# AethelOS Relay — multi-stage build.
# The relay depends on @aethelos/core (workspace), so we build both in the monorepo.

FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Copy manifests first for better layer caching.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/relay/package.json packages/relay/
COPY packages/client/package.json packages/client/
COPY packages/client-tauri/package.json packages/client-tauri/
RUN pnpm install --frozen-lockfile --filter @aethelos/relay... --filter @aethelos/core... --filter @aethelos/client...

# Copy sources and build.
COPY packages/core packages/core
COPY packages/relay packages/relay
RUN pnpm --filter @aethelos/core build \
  && test -f packages/core/dist/index.d.ts \
  && pnpm --filter @aethelos/relay build

# Bundle relay + core for a self-contained production artifact (no pnpm deploy).
RUN mkdir -p /app/relay-out/dist \
  && pnpm exec esbuild packages/relay/dist/index.js \
    --bundle --platform=node --target=node20 --format=cjs \
    --outfile=/app/relay-out/dist/index.js

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /relay
COPY --from=build /app/relay-out/dist/index.js ./dist/index.js

EXPOSE 8787
USER node
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
