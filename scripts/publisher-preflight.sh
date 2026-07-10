#!/usr/bin/env sh
# Pre-flight checks before sharing a publisher URL with users.
# Usage: ./scripts/publisher-preflight.sh [https://your-domain]
set -eu

BASE="${1:-http://localhost:8080}"
case "$BASE" in
  https://*) WS="wss://${BASE#https://}" ;;
  http://*) WS="ws://${BASE#http://}" ;;
  *) WS="$BASE" ;;
esac
WS="${WS%/}/ws"

echo "==> Relay direct"
case "$BASE" in
  http://localhost:*|http://127.0.0.1:*)
    curl -sf "http://localhost:8787/healthz" >/dev/null
    ;;
  *)
    echo "skip (remote hosted stack — proxy healthz covers publish path)"
    ;;
esac

echo "==> App health via proxy"
curl -sf "${BASE%/}/healthz" >/dev/null

echo "==> PWA shell"
curl -sf "${BASE%/}/" | head -c 200 | grep -qi html

echo "==> WebSocket /ws"
node scripts/publish-ws-smoke.mjs "$WS"

echo "PASS: publisher preflight for ${BASE}"