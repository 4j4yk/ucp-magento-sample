#!/usr/bin/env node
// Node's fs module reads mock key material from disk.
import fs from 'fs';
import { decodeJwtPayload, signJwt } from './ap2-jwt.mjs';

const GATEWAY_BASE_URL = process.env.GATEWAY_BASE_URL || process.env.BASE_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY;
const API_KEY_HEADER = (process.env.API_KEY_HEADER || 'x-api-key').toLowerCase();

const PLATFORM_PRIVATE_KEY_PATH = process.env.AP2_PLATFORM_PRIVATE_KEY_PATH || '.tmp/ap2-platform-private.pem';
const PAYMENT_PRIVATE_KEY_PATH = process.env.AP2_PAYMENT_PRIVATE_KEY_PATH || '.tmp/ap2-payment-private.pem';

function gatewayHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) headers[API_KEY_HEADER] = API_KEY;
  return headers;
}

async function gatewayRequest(path, options = {}) {
  const res = await fetch(`${GATEWAY_BASE_URL}${path}`, {
    ...options,
    headers: { ...gatewayHeaders(), ...(options.headers || {}) },
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

async function run() {
  const platformPrivate = fs.readFileSync(PLATFORM_PRIVATE_KEY_PATH, 'utf8');
  const paymentPrivate = fs.readFileSync(PAYMENT_PRIVATE_KEY_PATH, 'utf8');

  const createRes = await gatewayRequest('/checkout-sessions', {
    method: 'POST',
    body: JSON.stringify({
      line_items: [{ sku: process.env.SKU || 'Tiny Phone', quantity: 1 }],
      buyer: { email: process.env.BUYER_EMAIL || 'buyer@example.com' },
      ap2: { activated: true },
    }),
  });

  const sessionId = createRes.id;
  const address = {
    firstname: process.env.FIRSTNAME || 'John',
    lastname: process.env.LASTNAME || 'Doe',
    street: [process.env.STREET1 || '1 Main St'],
    city: process.env.CITY || 'Detroit',
    region: process.env.REGION || 'Michigan',
    region_code: process.env.REGION_CODE || 'MI',
    postcode: process.env.POSTCODE || '48201',
    country_id: process.env.COUNTRY_ID || 'US',
    telephone: process.env.TELEPHONE || '1231231234',
  };

  if (process.env.REGION_ID) {
    const regionId = Number(process.env.REGION_ID);
    if (!Number.isNaN(regionId)) address.region_id = regionId;
  }

  await gatewayRequest(`/checkout-sessions/${sessionId}`, {
    method: 'PUT',
    body: JSON.stringify({
      buyer: { email: process.env.BUYER_EMAIL || 'buyer@example.com' },
      shipping_address: address,
      shipping_method: {
        carrier_code: process.env.CARRIER_CODE || 'flatrate',
        method_code: process.env.METHOD_CODE || 'flatrate',
      },
    }),
  });

  const readRes = await gatewayRequest(`/checkout-sessions/${sessionId}`);
  const checkoutSignature = readRes?.ap2?.checkout_signature;
  const sigPayload = checkoutSignature ? decodeJwtPayload(checkoutSignature) : null;

  if (!sigPayload?.checkout_hash || !sigPayload?.session_id || !sigPayload?.nonce) {
    throw new Error('Missing checkout signature payload; ensure AP2 is enabled.');
  }

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 600;
  const checkoutMandate = signJwt(
    {
      checkout_hash: sigPayload.checkout_hash,
      session_id: sigPayload.session_id,
      nonce: sigPayload.nonce,
      iat,
      exp,
    },
    platformPrivate
  );
  const paymentMandate = signJwt({ iat, exp }, paymentPrivate);

  const completeRes = await gatewayRequest(`/checkout-sessions/${sessionId}/complete`, {
    method: 'POST',
    body: JSON.stringify({
      checkout_mandate: checkoutMandate,
      payment_mandate: paymentMandate,
    }),
  });

  console.log('AP2 complete response:', completeRes.status, completeRes.order || completeRes.messages || '');
}

run().catch(err => {
  console.error('AP2 mock run failed:', err.message || err);
  process.exit(1);
});
