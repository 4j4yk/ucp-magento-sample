// Lightweight heuristics to route between general chat, product search, and checkout.
export function isLikelyCheckout(text) {
  return /\b(buy|order|checkout|complete|ship|shipping|cart|sku|price)\b/i.test(text);
}

export function isProductInquiry(text) {
  return /\b(product|products|catalog|available|inventory)\b/i.test(text);
}

export function extractProductQuery(text) {
  const stopwords = new Set([
    'what',
    'which',
    'are',
    'is',
    'the',
    'a',
    'an',
    'available',
    'to',
    'buy',
    'show',
    'list',
    'me',
    'products',
    'product',
    'catalog',
    'inventory',
    'please',
    'can',
    'you',
    'for',
  ]);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(token => !stopwords.has(token));
  return tokens.join(' ').trim();
}
