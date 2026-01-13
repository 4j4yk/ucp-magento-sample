// Express provides routing for product search endpoints.
import express from 'express';
import { MagentoService } from '../services/MagentoService';

// Express router for lightweight product search (name/SKU) to aid chat UX.
export const productsRouter = express.Router();

// GET /products/search?query=...&limit=...
// Uses Magento catalog search to suggest possible SKUs.
productsRouter.get('/search', async (req, res, next) => {
  try {
    const query = typeof req.query.query === 'string' ? req.query.query : '';
    const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : 5;
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(20, limitRaw)) : 5;
    if (!query.trim()) {
      res.json({ items: [] });
      return;
    }
    const magento = new MagentoService();
    const items = await magento.searchProducts(query, limit);
    res.json({ items });
  } catch (err) {
    next(err);
  }
});
