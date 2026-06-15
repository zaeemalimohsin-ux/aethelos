# AethelOS Combined Deploy — Client PWA + Stateless Relay
#
# Philosophy: "AethelOS runs on the internet, and on the internet exclusively.
# Any desktop or laptop computer with a standard internet connection is
# sufficient to participate."
#
# This container is the universal browser gateway. It serves the React PWA via
# nginx and runs the stateless WebSocket relay internally, proxied through /ws.
# The relay holds NO authoritative state — it is disposable and swappable.
# A single container keeps the same-origin WebSocket connection working
# naturally with zero cross-origin complexity.

# ─── Stage 1: Build everything ───────────────────────────────────────────────

FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Layer-cached dependency install
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/relay/package.json packages/relay/
COPY packages/client/package.json packages/client/
RUN pnpm install --frozen-lockfile

# Build all packages
COPY packages/core packages/core
COPY packages/relay packages/relay
COPY packages/client packages/client
RUN pnpm --filter @aethelos/core build \
  && pnpm --filter @aethelos/relay build \
  && pnpm --filter @aethelos/client build

# Prune relay to production dependencies only
RUN pnpm --filter @aethelos/relay deploy --prod /relay-out

# ─── Stage 2: Runtime (Node.js + nginx) ──────────────────────────────────────

FROM node:20-alpine AS runtime
RUN apk add --no-cache nginx

# Relay: stateless bulletin board
WORKDIR /relay
COPY --from=build /relay-out/dist ./dist
COPY --from=build /relay-out/node_modules ./node_modules
COPY --from=build /relay-out/package.json ./package.json

# Client PWA: static files served by nginx
COPY --from=build /app/packages/client/dist /usr/share/nginx/html

# Deployment configuration
COPY deploy/nginx.conf.template /etc/nginx/nginx.conf.template
COPY deploy/start.sh /start.sh
RUN chmod +x /start.sh

# Render.com (and similar) assign PORT via env var
ENV PORT=10000
ENV RELAY_PORT=8787

CMD ["/start.sh"]
