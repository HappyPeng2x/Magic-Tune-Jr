#!/usr/bin/env bash
# Stop the server and watch build started by start.sh.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

any=0
for pid_file in ".start-server.pid" ".start-watch.pid"; do
  if [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    kill "$(cat "$pid_file")"
    rm -f "$pid_file"
    any=1
  fi
done

if [ "$any" -eq 1 ]; then
  echo "Stopped."
else
  echo "Not running."
fi
