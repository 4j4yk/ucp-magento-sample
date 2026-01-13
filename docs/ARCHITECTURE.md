# Architecture

This MVP is a thin UCP gateway that translates platform checkout requests into Adobe Commerce (Magento 2) cart and order APIs.

## High-level flow

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

  subgraph LocalDev
    LA[Local Agent CLI]
    OL[Ollama LLM]
    WP[Wallet Profile]
    MK[AP2 Mock Keys]
    MI[AP2 Mock Mandates]
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

  LA -->|Product search + checkout| G
  LA -->|Intent parsing| OL
  WP -->|Autofill data| LA
  MK -->|Key material| MI
  MI -->|checkout_mandate + payment_mandate| G
```

## Notes

- AP2 mode is server-driven when enabled; mandates are required on `/complete`.
- The gateway signs a checkout hash (detached JWT) and verifies platform/payment mandates.

## AP2 verification notes (MVP)

When AP2 is enabled, the gateway issues a `checkout_signature` for the current checkout
state and requires a `checkout_mandate` + `payment_mandate` on `/complete`. Mandates
are verified with configured public keys and checked against the session state hash,
session id, and nonce. For safety, the service rejects re-verification attempts and
requires the nonce to be present.
