#!/usr/bin/env bash
set -euo pipefail

echo "== Local MVP stop =="
echo

PID_FILE=".tmp/dev.pid"

if [[ -f "${PID_FILE}" ]]; then
  pids="$(cat "${PID_FILE}" 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    echo "Stopping dev server via PID file: ${PID_FILE}"
    echo "  PIDs: ${pids}"
    kill ${pids} 2>/dev/null || true
  fi
  rm -f "${PID_FILE}"
fi

stop_pattern() {
  local pattern="$1"
  local pids

  pids="$(pgrep -f "$pattern" || true)"
  if [[ -z "${pids}" ]]; then
    echo "No process matching: ${pattern}"
    return
  fi

  echo "Stopping: ${pattern}"
  echo "  PIDs: ${pids}"
  kill ${pids}
}

stop_pattern "ts-node-dev .*src/index.ts"
stop_pattern "node dist/index.js"
stop_pattern "node scripts/agent-local.mjs"
stop_pattern "ollama serve"

echo
echo "Done."
