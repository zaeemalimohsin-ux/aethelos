# AethelOS Client PWA — multi-stage build with bootstrap relay pool baked in.

FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/client/package.json packages/client/
RUN pnpm install --frozen-lockfile --filter @aethelos/client... --filter @aethelos/core...

COPY packages/core packages/core
COPY packages/client packages/client

ARG VITE_DEFAULT_RELAY_URL=
ARG VITE_BOOTSTRAP_RELAYS=
ENV VITE_DEFAULT_RELAY_URL=$VITE_DEFAULT_RELAY_URL
ENV VITE_BOOTSTRAP_RELAYS=$VITE_BOOTSTRAP_RELAYS

RUN pnpm --filter @aethelos/core build && pnpm --filter @aethelos/client build

FROM nginx:1.27-alpine AS runtime
COPY packages/client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/client/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1
