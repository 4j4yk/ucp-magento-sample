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

# ============
# Configuration (override via env vars)
# ============
GATEWAY_BASE_URL="${GATEWAY_BASE_URL:-http://localhost:3000}"
SKU="${SKU:-test-sku-1}"
QTY="${QTY:-1}"
API_KEY="${API_KEY:-}"
API_KEY_HEADER="${API_KEY_HEADER:-x-api-key}"

CARRIER_CODE="${CARRIER_CODE:-flatrate}"
METHOD_CODE="${METHOD_CODE:-flatrate}"

BUYER_EMAIL="${BUYER_EMAIL:-buyer@example.com}"

FIRSTNAME="${FIRSTNAME:-John}"
LASTNAME="${LASTNAME:-Doe}"
STREET1="${STREET1:-1 Main St}"
CITY="${CITY:-Detroit}"
REGION="${REGION:-Michigan}"
REGION_CODE="${REGION_CODE:-MI}"
REGION_ID="${REGION_ID:-}"
POSTCODE="${POSTCODE:-48201}"
COUNTRY_ID="${COUNTRY_ID:-US}"
TELEPHONE="${TELEPHONE:-1231231234}"

require() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1"; exit 1; }; }
require curl
require jq

API_HEADER_ARGS=()
if [[ -n "${API_KEY}" ]]; then
  API_HEADER_ARGS=(-H "${API_KEY_HEADER}: ${API_KEY}")
fi

echo "== UCP Adobe Commerce MVP Full Test =="
echo "Gateway: ${GATEWAY_BASE_URL}"
echo "SKU: ${SKU} x ${QTY}"
echo "Shipping: ${CARRIER_CODE}/${METHOD_CODE}"
echo

echo "1) Discovery: GET /.well-known/ucp"
curl -s "${API_HEADER_ARGS[@]}" "${GATEWAY_BASE_URL}/.well-known/ucp" | jq .
echo

echo "2) Create session: POST /checkout-sessions"
CREATE_RES="$(
  curl -s -X POST "${GATEWAY_BASE_URL}/checkout-sessions" \
    "${API_HEADER_ARGS[@]}" \
    -H 'Content-Type: application/json' \
    -d "$(jq -n \
      --arg sku "${SKU}" \
      --argjson qty "${QTY}" \
      --arg email "${BUYER_EMAIL}" \
      '{line_items:[{sku:$sku,quantity:$qty}],buyer:{email:$email}}'
    )"
)"
echo "$CREATE_RES" | jq .
SESSION_ID="$(echo "$CREATE_RES" | jq -r '.id')"

if [[ -z "${SESSION_ID}" || "${SESSION_ID}" == "null" ]]; then
  echo "ERROR: Could not create session."
  exit 1
fi

echo
echo "Session ID: ${SESSION_ID}"
echo

echo "3) Read session: GET /checkout-sessions/${SESSION_ID}"
curl -s "${API_HEADER_ARGS[@]}" "${GATEWAY_BASE_URL}/checkout-sessions/${SESSION_ID}" | jq .
echo

echo "4) Update: set shipping address (expect shipping_methods)"
ADDR_UPDATE_RES="$(
  curl -s -X PUT "${GATEWAY_BASE_URL}/checkout-sessions/${SESSION_ID}" \
    "${API_HEADER_ARGS[@]}" \
    -H 'Content-Type: application/json' \
    -d "$(jq -n \
      --arg email "${BUYER_EMAIL}" \
      --arg firstname "${FIRSTNAME}" \
      --arg lastname "${LASTNAME}" \
      --arg street1 "${STREET1}" \
      --arg city "${CITY}" \
      --arg region "${REGION}" \
      --arg region_code "${REGION_CODE}" \
      --arg region_id "${REGION_ID}" \
      --arg postcode "${POSTCODE}" \
      --arg country_id "${COUNTRY_ID}" \
      --arg telephone "${TELEPHONE}" \
      '({
        buyer:{email:$email},
        shipping_address:{
          firstname:$firstname,
          lastname:$lastname,
          street:[$street1],
          city:$city,
          region:$region,
          region_code:$region_code,
          postcode:$postcode,
          country_id:$country_id,
          telephone:$telephone
        }
      } | if $region_id != "" then .shipping_address.region_id = ($region_id | tonumber) else . end)'
    )"
)"
echo "$ADDR_UPDATE_RES" | jq .
echo

echo "5) Update: select shipping method ${CARRIER_CODE}/${METHOD_CODE} (requires shipping_address in same request)"
SHIP_SELECT_RES="$(
  curl -s -X PUT "${GATEWAY_BASE_URL}/checkout-sessions/${SESSION_ID}" \
    "${API_HEADER_ARGS[@]}" \
    -H 'Content-Type: application/json' \
    -d "$(jq -n \
      --arg email "${BUYER_EMAIL}" \
      --arg firstname "${FIRSTNAME}" \
      --arg lastname "${LASTNAME}" \
      --arg street1 "${STREET1}" \
      --arg city "${CITY}" \
      --arg region "${REGION}" \
      --arg region_code "${REGION_CODE}" \
      --arg region_id "${REGION_ID}" \
      --arg postcode "${POSTCODE}" \
      --arg country_id "${COUNTRY_ID}" \
      --arg telephone "${TELEPHONE}" \
      --arg carrier_code "${CARRIER_CODE}" \
      --arg method_code "${METHOD_CODE}" \
      '({
        buyer:{email:$email},
        shipping_address:{
          firstname:$firstname,
          lastname:$lastname,
          street:[$street1],
          city:$city,
          region:$region,
          region_code:$region_code,
          postcode:$postcode,
          country_id:$country_id,
          telephone:$telephone
        },
        shipping_method:{
          carrier_code:$carrier_code,
          method_code:$method_code
        }
      } | if $region_id != "" then .shipping_address.region_id = ($region_id | tonumber) else . end)'
    )"
)"
echo "$SHIP_SELECT_RES" | jq .
echo

echo "6) Complete: POST /checkout-sessions/${SESSION_ID}/complete"
COMPLETE_RES="$(
  curl -s "${API_HEADER_ARGS[@]}" -X POST "${GATEWAY_BASE_URL}/checkout-sessions/${SESSION_ID}/complete" || true
)"
echo "$COMPLETE_RES" | jq . 2>/dev/null || echo "$COMPLETE_RES"
echo

echo "7) Cancel: POST /checkout-sessions/${SESSION_ID}/cancel"
CANCEL_RES="$(
  curl -s "${API_HEADER_ARGS[@]}" -X POST "${GATEWAY_BASE_URL}/checkout-sessions/${SESSION_ID}/cancel" || true
)"
echo "$CANCEL_RES" | jq . 2>/dev/null || echo "$CANCEL_RES"
echo

echo "8) Negative test: bad SKU"
BAD_SKU_RES="$(
  curl -s -X POST "${GATEWAY_BASE_URL}/checkout-sessions" \
    "${API_HEADER_ARGS[@]}" \
    -H 'Content-Type: application/json' \
    -d '{"line_items":[{"sku":"DOES_NOT_EXIST","quantity":1}],"buyer":{"email":"buyer@example.com"}}' || true
)"
echo "$BAD_SKU_RES" | jq . 2>/dev/null || echo "$BAD_SKU_RES"
echo

echo "9) Negative test: session not found"
NF_RES="$(
  curl -s "${API_HEADER_ARGS[@]}" "${GATEWAY_BASE_URL}/checkout-sessions/unknown123" || true
)"
echo "$NF_RES" | jq . 2>/dev/null || echo "$NF_RES"
echo

echo "== Done =="
