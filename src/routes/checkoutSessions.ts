// Express provides routing for checkout session endpoints.
import express from 'express';
import {
  CompleteCheckoutSessionSchema,
  CreateCheckoutSessionSchema,
  UpdateCheckoutSessionSchema,
} from '../ucp/ucpSchemas';
import { CheckoutSessionService } from '../services/CheckoutSessionService';

// Express router that exposes the UCP checkout session REST endpoints.
export const checkoutSessionsRouter = express.Router();
// Service instance handles Magento orchestration and session persistence.
const checkoutService = new CheckoutSessionService();

/**
 * POST /checkout-sessions
 * Creates Magento guest cart, adds items, returns a session.
 * MVP: does NOT call any fragile "set guest email" endpoint (varies by Magento versions/config).
 */
checkoutSessionsRouter.post('/', async (req, res, next) => {
  try {
    const input = CreateCheckoutSessionSchema.parse(req.body);
    const result = await checkoutService.create(input);
    res.status(result.status).json(result.body);
  } catch (e) {
    next(e);
  }
});

// GET /checkout-sessions/:id
// Returns session state and refreshed totals.
checkoutSessionsRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await checkoutService.get(req.params.id);
    res.status(result.status).json(result.body);
  } catch (e) {
    next(e);
  }
});

// PUT /checkout-sessions/:id
// Updates buyer email, shipping address, and shipping method.
checkoutSessionsRouter.put('/:id', async (req, res, next) => {
  try {
    const input = UpdateCheckoutSessionSchema.parse(req.body);
    const result = await checkoutService.update(req.params.id, input);
    res.status(result.status).json(result.body);
  } catch (e) {
    next(e);
  }
});

// POST /checkout-sessions/:id/complete
// Finalizes checkout and places the Magento order.
checkoutSessionsRouter.post('/:id/complete', async (req, res, next) => {
  try {
    const input = CompleteCheckoutSessionSchema.parse(req.body);
    const result = await checkoutService.complete(req.params.id, input);
    res.status(result.status).json(result.body);
  } catch (e) {
    next(e);
  }
});

// POST /checkout-sessions/:id/cancel
// Marks the session as canceled.
checkoutSessionsRouter.post('/:id/cancel', async (req, res, next) => {
  try {
    const result = await checkoutService.cancel(req.params.id);
    res.status(result.status).json(result.body);
  } catch (e) {
    next(e);
  }
});
