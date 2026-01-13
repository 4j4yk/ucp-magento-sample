#!/usr/bin/env bash
set -euo pipefail

echo "== Local MVP startup checklist =="
echo

check_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing dependency: $1"
    return 1
  fi
  return 0
}

missing=0
check_cmd node || missing=1
check_cmd npm || missing=1
check_cmd curl || missing=1
check_cmd jq || missing=1
check_cmd ollama || echo "Note: Ollama CLI not found (needed for local LLM tests)."

if [[ "${missing}" -ne 0 ]]; then
  echo
  echo "Install missing dependencies before proceeding."
  exit 1
fi

ENV_FILE="${ENV_FILE:-.env}"
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}. Create one (see README)."
  exit 1
fi

source "${ENV_FILE}"

echo "Env file: ${ENV_FILE}"
echo "Gateway: ${BASE_URL:-http://localhost:3000}"
echo "Magento: ${MAGENTO_BASE_URL:-<unset>}"
echo "Store code: ${MAGENTO_STORE_CODE:-<unset>}"
echo "SKU: ${SKU:-<unset>}"
echo "Payment method: ${PAYMENT_METHOD_CODE:-<unset>}"
echo "AP2 enabled: ${AP2_ENABLED:-false}"
echo

echo "Required env checks:"
for key in BASE_URL MAGENTO_BASE_URL MAGENTO_STORE_CODE MAGENTO_ADMIN_TOKEN API_KEY; do
  if [[ -z "${!key:-}" ]]; then
    echo "  - ${key}: MISSING"
    missing=1
  else
    echo "  - ${key}: OK"
  fi
done

if [[ "${missing}" -ne 0 ]]; then
  echo
  echo "Fix missing env values, then rerun."
  exit 1
fi

echo
echo "Next actions:"
echo "1) Start the API: npm run dev"
echo "2) In another terminal, run: ./scripts/test.sh"
echo "3) For chat-driven flow:"
echo "   - Start Ollama: ollama serve"
echo "   - Run agent: node scripts/agent-local.mjs"
echo
echo "Notes:"
echo "- API_KEY is required for the gateway:"
echo "  API_KEY=... API_KEY_HEADER=${API_KEY_HEADER:-x-api-key}"
echo "- If AP2_ENABLED=true, /complete requires mandates."
