#!/usr/bin/env bash
# Build MagicTune Jr and serve it locally, printing the URL to open.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

PORT="${1:-8765}"
PID_FILE=".start-server.pid"
LOG_FILE=".start-server.log"

# Stop a server we previously started, if any.
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  kill "$(cat "$PID_FILE")"
fi

echo "Building..."
npm run build

setsid python3 -m http.server "$PORT" </dev/null >"$LOG_FILE" 2>&1 &
disown
echo $! >"$PID_FILE"

# Give the server a moment to bind, then confirm it's up.
sleep 1
if ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Server failed to start; see $LOG_FILE" >&2
  exit 1
fi

echo "Running at http://localhost:$PORT"
