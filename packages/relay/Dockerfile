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
RUN pnpm install --frozen-lockfile --filter @aethelos/relay... --filter @aethelos/core...

# Copy sources and build.
COPY packages/core packages/core
COPY packages/relay packages/relay
RUN pnpm --filter @aethelos/core build \
  && test -f packages/core/dist/index.d.ts \
  && pnpm --filter @aethelos/relay build

# Prune to production dependencies.
RUN pnpm --filter @aethelos/relay deploy --legacy --prod /relay-out

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /relay
COPY --from=build /relay-out/dist ./dist
COPY --from=build /relay-out/node_modules ./node_modules
COPY --from=build /relay-out/package.json ./package.json

EXPOSE 8787
USER node
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
