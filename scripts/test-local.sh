#!/usr/bin/env bash
set -euo pipefail

# Load .env for defaults if present (override with ENV_FILE if desired).
ENV_FILE="${ENV_FILE:-.env}"
if [[ -f "${ENV_FILE}" ]]; then
  set +u
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
  set -u
fi

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-3000}"
GATEWAY_BASE_URL="${GATEWAY_BASE_URL:-${BASE_URL:-http://${HOST}:${PORT}}}"
API_KEY="${API_KEY:-}"
API_KEY_HEADER="${API_KEY_HEADER:-x-api-key}"
WAIT_RETRIES="${WAIT_RETRIES:-30}"
WAIT_SLEEP="${WAIT_SLEEP:-1}"

API_HEADER_ARGS=()
if [[ -n "${API_KEY}" ]]; then
  API_HEADER_ARGS=(-H "${API_KEY_HEADER}: ${API_KEY}")
fi

cleanup() {
  bash ./scripts/stop-local.sh
}
trap cleanup EXIT

echo "== Start local API =="
mkdir -p .tmp
HOST="${HOST}" PORT="${PORT}" npm run dev > .tmp/dev.log 2>&1 &
DEV_PID=$!
echo "${DEV_PID}" > .tmp/dev.pid

echo "Waiting for gateway health at ${GATEWAY_BASE_URL}..."
ready=0
for _ in $(seq 1 "${WAIT_RETRIES}"); do
  if curl -s "${API_HEADER_ARGS[@]}" "${GATEWAY_BASE_URL}/health" >/dev/null; then
    ready=1
    break
  fi
  sleep "${WAIT_SLEEP}"
done

if [[ "${ready}" -ne 1 ]]; then
  echo "Gateway did not become ready in time. Check .tmp/dev.log."
  exit 1
fi

if ! kill -0 "${DEV_PID}" >/dev/null 2>&1; then
  echo "Dev server exited before tests could run. Check .tmp/dev.log."
  exit 1
fi

echo "== Run end-to-end tests =="
./scripts/test.sh
