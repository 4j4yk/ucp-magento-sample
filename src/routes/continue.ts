// Express provides routing for the continue URL page.
import express from 'express';
import { env } from '../config';
import { getSession } from '../storage/sessionStore';

// Express router for buyer handoff page (MVP HTML response).
export const continueRouter = express.Router();

// GET /continue/:id renders a simple HTML page linking to Magento checkout.
continueRouter.get('/:id', (req, res) => {
  const s = getSession(req.params.id);
  const checkoutUrl = env.MAGENTO_CHECKOUT_URL ?? `${env.MAGENTO_BASE_URL.replace(/\/$/, '')}/checkout`;

  const itemsHtml = (s.items ?? [])
    .map(i => `<li><code>${escapeHtml(i.sku)}</code> × ${i.quantity}</li>`)
    .join('');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Continue checkout</title>
  <style>
    body{font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 2rem; line-height: 1.4;}
    .card{max-width: 820px; padding: 1.25rem 1.5rem; border: 1px solid #ddd; border-radius: 10px;}
    code{background:#f6f6f6; padding: 0.1rem 0.35rem; border-radius: 6px;}
    a.button{display:inline-block; padding: .7rem 1rem; border-radius: 10px; border: 1px solid #222; text-decoration:none; color:#fff; background:#222;}
    .muted{color:#555}
  </style>
</head>
<body>
  <div class="card">
    <h1>Continue checkout</h1>
    <p class="muted">UCP session: <code>${escapeHtml(s.id)}</code></p>
    <p>For this MVP, payment and any buyer-required UI steps are completed in the merchant checkout.</p>
    <h3>Items</h3>
    <ul>${itemsHtml || '<li class="muted">No items snapshot (MVP limitation)</li>'}</ul>
    ${env.EXPOSE_DEBUG === 'true' ? `<p class="muted">Magento cart id: <code>${escapeHtml(s.magentoCartId)}</code></p>` : ''}
    <p><a class="button" href="${escapeHtml(checkoutUrl)}" rel="noopener">Open merchant checkout</a></p>
    <hr/>
    <p class="muted">Production: implement a signed restore token + Magento module endpoint to attach this quote to the browser session.</p>
  </div>
</body>
</html>`);
});

// Escapes HTML entities to prevent injection in the handoff page.
function escapeHtml(str: string): string {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
