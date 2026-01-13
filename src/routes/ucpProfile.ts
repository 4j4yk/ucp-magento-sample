// Express provides routing for the discovery manifest endpoint.
import express from 'express';
import { env } from '../config';
import { ap2Enabled, supportedVpFormats } from '../ucp/ap2';

// Express router that exposes the UCP discovery profile.
export const ucpProfileRouter = express.Router();

/**
 * Minimal discovery profile at:
 *   GET /.well-known/ucp
 *
 * This is an MVP profile that advertises:
 * - REST endpoint base
 * - Checkout capability endpoints
 */
ucpProfileRouter.get('/ucp', (_req, res) => {
  const base = env.BASE_URL.replace(/\/$/, '');
  res.json({
    protocol: 'UCP',
    version: '0.2.0-mvp',
    merchant: { name: 'Adobe Commerce Merchant (MVP)' },
    services: {
      'dev.ucp.shopping.rest.endpoint': base,
    },
    extensions: {
      ap2: {
        supported: ap2Enabled(),
        supported_vp_formats: ap2Enabled() ? supportedVpFormats() : [],
      },
    },
    capabilities: [
      {
        id: 'dev.ucp.shopping.checkout',
        binding: 'rest',
        endpoints: {
          create: `${base}/checkout-sessions`,
          read: `${base}/checkout-sessions/{id}`,
          update: `${base}/checkout-sessions/{id}`,
          complete: `${base}/checkout-sessions/{id}/complete`,
          cancel: `${base}/checkout-sessions/{id}/cancel`,
        },
      },
    ],
  });
});
