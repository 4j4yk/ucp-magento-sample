// dotenv loads .env values into process.env for local development.
import 'dotenv/config';
// Express provides the HTTP server and routing.
import express from 'express';
// Helmet adds secure HTTP headers.
import helmet from 'helmet';
// Morgan logs HTTP requests in a standard format.
import morgan from 'morgan';

import { ucpProfileRouter } from './routes/ucpProfile';
import { checkoutSessionsRouter } from './routes/checkoutSessions';
import { continueRouter } from './routes/continue';
import { productsRouter } from './routes/products';
import { env } from './config';
import { mapError } from './errors/mapError';
import { validateAp2Config } from './ucp/ap2';
import { MagentoService } from './services/MagentoService';

// Express app provides the REST gateway surface for UCP endpoints.
const app = express();

// Helmet sets security-related headers for the HTTP API.
app.use(helmet());
// JSON body parser for incoming requests.
app.use(express.json({ limit: '1mb' }));
// Morgan logs HTTP requests for debugging and auditing.
app.use(morgan('combined'));

// Basic health check for the gateway process.
app.get('/health', (_req, res) => res.json({ ok: true }));
// Health check for Magento connectivity (requires API key).
app.get('/health/magento', requireApiKey, async (_req, res, next) => {
  try {
    const magento = new MagentoService();
    await magento.ping();
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Shared-secret API key for gateway access.
const apiKey = env.API_KEY;
if (!apiKey) {
  throw new Error('API_KEY is required to run the gateway.');
}
const apiKeyHeader = (env.API_KEY_HEADER ?? 'x-api-key').toLowerCase();
// Express middleware that enforces a shared-secret header for protected routes.
function requireApiKey(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (!apiKey) return next();
  const supplied = req.header(apiKeyHeader);
  if (!supplied || supplied !== apiKey) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

app.use('/.well-known', ucpProfileRouter);
app.use('/checkout-sessions', requireApiKey, checkoutSessionsRouter);
app.use('/products', requireApiKey, productsRouter);
app.use('/continue', continueRouter);

// Validate AP2 configuration on startup if enabled.
validateAp2Config();

// Error handler that can include Magento payloads for troubleshooting.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const exposeMagento = env.EXPOSE_MAGENTO_ERRORS === 'true';
  const mapped = mapError(err, exposeMagento);
  res.status(mapped.status).json({ error: mapped.error, magento: mapped.magento });
});

// Bind to configured host/port (default 127.0.0.1:3000) for local dev/testing.
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
app.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`UCP Gateway listening on http://${host}:${port}`);
});
