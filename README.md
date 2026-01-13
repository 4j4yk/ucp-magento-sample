# UCP + Adobe Commerce (Magento 2) MVP Gateway — Full Repo

This repository provides a **minimal** UCP-style checkout gateway (REST binding) that delegates cart/quote and order placement to **Adobe Commerce / Magento 2**. It is intended as an MVP foundation for agentic commerce flows (chat → checkout).

## What you get

- `GET /.well-known/ucp` — discovery profile (minimal)
- Checkout session endpoints:
  - `POST /checkout-sessions`
  - `GET /checkout-sessions/:id`
  - `PUT /checkout-sessions/:id`
  - `POST /checkout-sessions/:id/complete`
  - `POST /checkout-sessions/:id/cancel`
- `GET /continue/:id` — minimal buyer handoff page
- `./scripts/test.sh` — end-to-end test (create → address → shipping → complete + negative tests)
- `./scripts/test-local.sh` — start dev server, wait for health, run `test.sh`, then stop
- `./scripts/test-ap2-local.sh` — generate mock AP2 keys, start server with AP2, run mock mandate flow
- `./scripts/agent-local.mjs` — local chat → API driver using Ollama
- `./scripts/start-local.sh` — dependency/env checklist for local runs

## Key libraries (quick primer for new Node devs)

- `express` — HTTP server and routing.
- `axios` — HTTP client for Magento REST calls.
- `zod` — runtime schema validation for env vars and request payloads.
- `helmet` — security-related HTTP headers.
- `morgan` — HTTP request logging.
- `nanoid` — short, URL-safe ID generator.
- `dotenv` — loads `.env` files into `process.env`.

## GitHub Pages docs

This repo includes a static docs site in `docs/`. To publish on GitHub Pages:

1) Push the repo to GitHub.
2) In repo settings → Pages, select `Deploy from branch`.
3) Choose your default branch and `/docs` as the folder.

## Architecture overview

See `docs/ARCHITECTURE.md` for the component diagram and request flow.

```mermaid
flowchart LR
  subgraph Platform
    A[AI Client / Agent]
    P[Platform Orchestrator]
  end

  subgraph Merchant
    G[UCP Gateway]
    M[Magento 2]
  end

  subgraph Payments
    PP[Payment Processor]
  end

  A -->|Intent + Cart| P
  P -->|POST/PUT /checkout-sessions| G
  G -->|Cart/Quote APIs| M
  M -->|Totals/Shipping| G
  G -->|Session + checkout_signature| P
  P -->|CheckoutMandate + PaymentMandate| G
  P -->|PaymentMandate| PP
  G -->|/complete| M
  M -->|Order ID| G --> P
```

## Prereqs

- Node.js 18+ (Node 20 recommended)
- Magento / Adobe Commerce instance reachable from your machine
- Admin/Integration token with permissions to cart/quote/checkout endpoints

## Setup

1) Install

```bash
npm install
```

2) Configure env

You said you already have your `.env` intact. Ensure it contains:

- `BASE_URL`
- `MAGENTO_BASE_URL`
- `MAGENTO_STORE_CODE`
- `MAGENTO_ADMIN_TOKEN`
- `API_KEY` (required)
- Optional: `PAYMENT_METHOD_CODE=checkmo`
- Optional: `MAGENTO_CHECKOUT_URL`
- Optional: `API_KEY_HEADER` for gateway auth (default `x-api-key`)
- Optional: `AP2_*` for AP2 flows (see below)

If you need a template:

```bash
cp .env.example .env
```

3) Run

```bash
npm run dev
```

Health check:

```bash
curl -s http://localhost:3000/health
```

## Testing

Choose a flow based on what you want to validate:

- **E2E gateway flow**: REST endpoints only (fast sanity check).
- **Agent flow**: product search + wallet + chat intent parsing.
- **AP2 mock flow**: mandates + checkout completion with generated keys.

### E2E gateway flow

Make executable and run:

```bash
chmod +x scripts/test.sh
./scripts/test.sh
```

Or run with local start/stop orchestration:

```bash
chmod +x scripts/test-local.sh
./scripts/test-local.sh
```

If you hit a bind error on port 3000, set a host or port:

```bash
HOST=127.0.0.1 PORT=3001 ./scripts/test-local.sh
```

### AP2 mock flow (local keys + mock mandates)

```bash
chmod +x scripts/test-ap2-local.sh
./scripts/test-ap2-local.sh
```

This flow generates local RSA keys in `.tmp/`, starts the API with `AP2_ENABLED=true`,
creates a checkout session, and completes it using mock mandates.

Override defaults (recommended):

```bash
SKU="YOUR_REAL_SKU" CARRIER_CODE="flatrate" METHOD_CODE="flatrate" ./scripts/test.sh
```

## Local chat flow (Ollama)

1) Start the API

```bash
npm run dev
```

2) Start Ollama (if not already running)

```bash
ollama serve
```

3) Run the local agent

```bash
node scripts/agent-local.mjs
```

### Agent code layout (for newcomers)

The local agent is split into small modules under `scripts/agent/` so you can extend behavior without digging through a single large file:

- `scripts/agent-local.mjs` — CLI entrypoint; wires prompts to agent behavior
- `scripts/agent/config.mjs` — env defaults and constants
- `scripts/agent/http.mjs` — gateway request helper + timeouts
- `scripts/agent/ollama.mjs` — Ollama chat, parsing, and model checks
- `scripts/agent/intent.mjs` — simple heuristics for product inquiries vs checkout
- `scripts/agent/checkout.mjs` — checkout state machine and API calls
- `scripts/agent/wallet.mjs` — wallet profile loading/validation/merge
- `scripts/agent/state.mjs` — initial in-memory state shape

If you want to add a new feature, start in `scripts/agent-local.mjs` to see how user input is routed, then update the specific module (intent, checkout, wallet) rather than adding new logic to the CLI.

Example extension: add a new intent keyword

1) Update `scripts/agent/intent.mjs` to detect your keyword.
2) Handle it in `scripts/agent-local.mjs` by routing to a new helper.
3) Keep network calls inside `scripts/agent/http.mjs` or a new module.

Wallet autofill (optional):

- Provide a JSON profile:

```bash
WALLET_PROFILE_PATH=wallet.json node scripts/agent-local.mjs
```

- Or set env vars (partial profiles allowed):

```
WALLET_EMAIL
WALLET_QUANTITY
WALLET_FIRSTNAME
WALLET_LASTNAME
WALLET_STREET1
WALLET_CITY
WALLET_REGION
WALLET_REGION_CODE
WALLET_REGION_ID
WALLET_POSTCODE
WALLET_COUNTRY_ID
WALLET_TELEPHONE
WALLET_CARRIER_CODE
WALLET_METHOD_CODE
```

- By default the agent asks before using wallet data. To auto-apply:

```bash
AUTO_USE_WALLET=true node scripts/agent-local.mjs
```

Example wallet JSON:

```json
{
  "email": "buyer@example.com",
  "quantity": 1,
  "carrier_code": "flatrate",
  "method_code": "flatrate",
  "shipping_address": {
    "firstname": "John",
    "lastname": "Doe",
    "street": ["1 Main St"],
    "city": "Detroit",
    "region": "Michigan",
    "region_code": "MI",
    "postcode": "48201",
    "country_id": "US",
    "telephone": "1231231234"
  }
}
```

## Stop

Stop the local API, agent, and Ollama (if running):

```bash
npm run stop
```

## AP2 notes (MVP)

If `AP2_ENABLED=true`, the gateway:

- Issues a `checkout_signature` (JWT) for the checkout state.
- Requires `checkout_mandate` and `payment_mandate` on `/complete`.
- Verifies mandates using the configured public keys and claim rules.

Minimal AP2 env:

```
AP2_ENABLED=true
AP2_SIGNING_ALG=RS256
AP2_SIGNING_PRIVATE_KEY_PEM="-----BEGIN PRIVATE KEY-----..."
AP2_SIGNING_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----..."
AP2_PLATFORM_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----..."
AP2_PAYMENT_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----..."
```

## Notes / MVP limitations

- Sessions are stored in-memory (restart loses session map).
- Handoff (`continue_url`) does not automatically restore the Magento quote into the browser session.
- Error handler can include Magento payloads in responses for debugging.

## If /complete fails

Run `/complete` again and look at the JSON response. The gateway will now include Magento’s full error payload under `magento`.
