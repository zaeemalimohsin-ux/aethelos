#!/bin/sh
# AethelOS Combined Startup — relay + nginx
#
# The relay is a "powerless bulletin board" (no state, no authority).
# nginx serves the PWA and proxies /ws to the relay on localhost.
# Together they form the universal browser gateway.

set -e

PORT=${PORT:-10000}
RELAY_PORT=${RELAY_PORT:-8787}

echo "AethelOS Deploy: starting relay on :${RELAY_PORT}, nginx on :${PORT}"

# Generate nginx config with the platform-assigned ports
sed -e "s/LISTEN_PORT/${PORT}/g" -e "s/RELAY_PORT/${RELAY_PORT}/g" \
  /etc/nginx/nginx.conf.template > /tmp/nginx.conf

relay_healthy() {
  node -e "
    fetch('http://127.0.0.1:${RELAY_PORT}/healthz')
      .then((r) => process.exit(r.ok ? 0 : 1))
      .catch(() => process.exit(1));
  " 2>/dev/null
}

nginx_healthy() {
  node -e "
    fetch('http://127.0.0.1:${PORT}/healthz')
      .then((r) => process.exit(r.ok ? 0 : 1))
      .catch(() => process.exit(1));
  " 2>/dev/null
}

# Start the stateless relay in the background
cd /relay
PORT=${RELAY_PORT} node dist/index.js &
RELAY_PID=$!

# Wait for relay to be ready (up to 10 seconds)
RELAY_HEALTHY=0
for i in $(seq 1 20); do
  if relay_healthy; then
    echo "AethelOS Deploy: relay is healthy"
    RELAY_HEALTHY=1
    break
  fi
  sleep 0.5
done

if [ "$RELAY_HEALTHY" -ne 1 ]; then
  echo "AethelOS Deploy: relay failed health check on :${RELAY_PORT}" >&2
  kill "$RELAY_PID" 2>/dev/null || true
  exit 1
fi

# Start nginx in the background
nginx -p /tmp -c /tmp/nginx.conf -e /dev/stderr -g "daemon off;" &
NGINX_PID=$!

# Wait for nginx to proxy /healthz to relay (up to 10 seconds)
NGINX_HEALTHY=0
for i in $(seq 1 20); do
  if nginx_healthy; then
    NGINX_HEALTHY=1
    break
  fi
  sleep 0.5
done

if [ "$NGINX_HEALTHY" -ne 1 ]; then
  echo "AethelOS Deploy: nginx failed readiness check on :${PORT}" >&2
  kill "$RELAY_PID" "$NGINX_PID" 2>/dev/null || true
  exit 1
fi

echo "AethelOS Deploy: ready — serving on :${PORT}"

# If either process exits, shut down cleanly (POSIX — no wait -n)
trap "kill $RELAY_PID $NGINX_PID 2>/dev/null; exit 0" INT TERM

while kill -0 "$RELAY_PID" 2>/dev/null && kill -0 "$NGINX_PID" 2>/dev/null; do
  sleep 1
done

kill "$RELAY_PID" "$NGINX_PID" 2>/dev/null || true
wait "$RELAY_PID" 2>/dev/null || true
wait "$NGINX_PID" 2>/dev/null || true
exit 1
