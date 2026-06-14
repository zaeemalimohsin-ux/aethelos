#!/usr/bin/env bash
# Minimal VPS bootstrap: Docker Compose stack on port 8080 (same-origin /ws).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "Install Docker first: https://docs.docker.com/engine/install/"
  exit 1
fi

ENV_FILE="${ENV_FILE:-.env.docker}"
if [[ ! -f "$ENV_FILE" ]]; then
  cat >"$ENV_FILE" <<'EOF'
# Same-origin /ws at runtime — optional overrides only
VITE_DEFAULT_RELAY_URL=
VITE_BOOTSTRAP_RELAYS=
VITE_INVITE_BASE_URL=
EOF
  echo "Created $ENV_FILE"
fi

docker compose --env-file "$ENV_FILE" up -d --build

echo ""
echo "AethelOS is running on http://localhost:8080"
echo "  Relay WebSocket (via nginx): ws://localhost:8080/ws"
echo ""
echo "Next: put TLS in front (Caddy/Traefik) and point DNS at this host."
echo "See docs/PUBLISHER.md for permanent URL options."
