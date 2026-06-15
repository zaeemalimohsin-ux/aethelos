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

# Generate nginx config with the platform-assigned port
sed "s/LISTEN_PORT/${PORT}/g" /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# Start the stateless relay in the background
cd /relay
PORT=${RELAY_PORT} node dist/index.js &
RELAY_PID=$!

# Wait for relay to be ready (up to 10 seconds)
for i in $(seq 1 20); do
  if wget -qO- "http://127.0.0.1:${RELAY_PORT}/healthz" > /dev/null 2>&1; then
    echo "AethelOS Deploy: relay is healthy"
    break
  fi
  sleep 0.5
done

# Start nginx in the foreground
nginx -g "daemon off;" &
NGINX_PID=$!

echo "AethelOS Deploy: ready — serving on :${PORT}"

# If either process exits, shut down cleanly
trap "kill $RELAY_PID $NGINX_PID 2>/dev/null; exit 0" SIGTERM SIGINT

wait -n $RELAY_PID $NGINX_PID
EXIT_CODE=$?
kill $RELAY_PID $NGINX_PID 2>/dev/null
exit $EXIT_CODE
