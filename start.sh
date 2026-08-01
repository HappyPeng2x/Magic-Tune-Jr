#!/usr/bin/env bash
# Build MagicTune Jr, keep rebuilding on every source change, and serve it
# locally. Just refresh the browser tab to see the latest build.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

PORT="${1:-8765}"
SERVER_PID_FILE=".start-server.pid"
SERVER_LOG_FILE=".start-server.log"
WATCH_PID_FILE=".start-watch.pid"
WATCH_LOG_FILE=".start-watch.log"

# Stop anything we previously started.
for pid_file in "$SERVER_PID_FILE" "$WATCH_PID_FILE"; do
  if [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    kill "$(cat "$pid_file")"
  fi
done

echo "Starting watch build..."
: >"$WATCH_LOG_FILE"
setsid node build.js --watch </dev/null >"$WATCH_LOG_FILE" 2>&1 &
disown
echo $! >"$WATCH_PID_FILE"

# Wait for the first build to finish before serving.
for i in $(seq 1 60); do
  if grep -q "Watching for changes" "$WATCH_LOG_FILE" 2>/dev/null; then
    break
  fi
  if ! kill -0 "$(cat "$WATCH_PID_FILE")" 2>/dev/null; then
    echo "Watch build failed; see $WATCH_LOG_FILE" >&2
    exit 1
  fi
  sleep 0.5
done

setsid python3 devserver.py "$PORT" </dev/null >"$SERVER_LOG_FILE" 2>&1 &
disown
echo $! >"$SERVER_PID_FILE"

# Give the server a moment to bind, then confirm it's up.
sleep 1
if ! kill -0 "$(cat "$SERVER_PID_FILE")" 2>/dev/null; then
  echo "Server failed to start; see $SERVER_LOG_FILE" >&2
  exit 1
fi

echo "Running at http://localhost:$PORT (bundle rebuilds automatically on source changes)"
