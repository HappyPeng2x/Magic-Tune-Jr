#!/usr/bin/env bash
# Stop the server started by start.sh.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

PID_FILE=".start-server.pid"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  kill "$(cat "$PID_FILE")"
  rm -f "$PID_FILE"
  echo "Stopped."
else
  echo "Not running."
fi
