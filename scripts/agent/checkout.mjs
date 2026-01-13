// Checkout flow orchestration and state helpers.
import { DEFAULTS, REQUIRED_ADDRESS_FIELDS } from './config.mjs';
import { gatewayRequest } from './http.mjs';
import { mergeWalletProfileIntoCheckout } from './wallet.mjs';

// Merges optional address overrides onto defaults, normalizing region_id.
function mergeAddress(override) {
  if (!override) return { ...DEFAULTS.shipping_address };
  const addr = { ...DEFAULTS.shipping_address, ...override };
  if (override.street && Array.isArray(override.street)) {
    addr.street = override.street;
  }
  if (override.region_id !== undefined && override.region_id !== null && override.region_id !== '') {
    const num = Number(override.region_id);
    if (!Number.isNaN(num)) addr.region_id = num;
  }
  return addr;
}

export function normalizeQuantity(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  return Math.floor(num);
}

// Merge an intent payload into the in-memory checkout state.
export function mergeCheckoutState(state, intent) {
  if (!intent || typeof intent !== 'object') return;
  if (intent.sku) state.checkout.sku = intent.sku;
  const qty = normalizeQuantity(intent.quantity);
  if (qty !== undefined) state.checkout.quantity = qty;
  if (intent.email) state.checkout.email = intent.email;
  if (intent.shipping_address) {
    state.checkout.shipping_address = {
      ...(state.checkout.shipping_address || {}),
      ...intent.shipping_address,
    };
  }
  if (intent.carrier_code) state.checkout.carrier_code = intent.carrier_code;
  if (intent.method_code) state.checkout.method_code = intent.method_code;
  if (intent.confirm_complete) state.confirmComplete = true;
}

// Inspect state and return a list of missing fields needed for checkout.
export function getMissingFields(state) {
  const missing = [];
  const checkout = state.checkout || {};
  if (!checkout.sku) missing.push('sku');
  if (!normalizeQuantity(checkout.quantity)) missing.push('quantity');
  if (!checkout.email) missing.push('email');

  if (!checkout.shipping_address) {
    missing.push(`shipping_address (${REQUIRED_ADDRESS_FIELDS.join(', ')})`);
  } else {
    for (const field of REQUIRED_ADDRESS_FIELDS) {
      if (field === 'street') {
        if (!Array.isArray(checkout.shipping_address.street) || checkout.shipping_address.street.length === 0) {
          missing.push('shipping_address.street');
        }
      } else if (!checkout.shipping_address[field]) {
        missing.push(`shipping_address.${field}`);
      }
    }
  }

  if (!checkout.carrier_code) missing.push('carrier_code');
  if (!checkout.method_code) missing.push('method_code');

  return missing;
}

function printMissingFields(missing) {
  console.log('I need a few more details before checkout:');
  console.log(`Missing: ${missing.join(', ')}`);
  console.log('Please provide them in one message (plain text or JSON).');
}

// Apply wallet data (if allowed), validate completeness, and attempt checkout.
export async function handleCheckoutProgress(state) {
  let missing = getMissingFields(state);
  if (missing.length && state.walletProfile && !state.walletApplied) {
    if (state.autoUseWallet) {
      mergeWalletProfileIntoCheckout(state, state.walletProfile);
      state.walletApplied = true;
      console.log('Applied wallet profile.');
      missing = getMissingFields(state);
    } else if (!state.walletAsked) {
      state.walletAsked = true;
      state.awaitingWalletConsent = true;
      console.log('I can use your saved wallet profile to fill in missing details. Use it? (yes/no)');
      return { needsInput: true };
    }
  }
  if (missing.length) {
    printMissingFields(missing);
    return { needsInput: true };
  }
  const flowIntent = {
    ...state.checkout,
    confirm_complete: state.confirmComplete,
  };
  const result = await runFlow(state, flowIntent);
  if (result?.needsInput) return { needsInput: true };
  if (state.confirmComplete) {
    state.confirmComplete = false;
  }
  return { needsInput: false };
}

// Executes the checkout flow: create session, update shipping, and/or complete.
// Execute the gateway calls for create/update/complete.
export async function runFlow(state, intent) {
  const ap2Enabled = process.env.AP2_ENABLED === 'true';
  if (ap2Enabled) {
    console.log('AP2 is enabled; /complete requires mandates. This local agent does not generate mandates.');
  }

  if (!state.sessionId) {
    const sku = intent.sku || DEFAULTS.sku;
    const quantity = normalizeQuantity(intent.quantity) || DEFAULTS.quantity || 1;
    const email = intent.email || DEFAULTS.email;
    try {
      const createRes = await gatewayRequest('/checkout-sessions', {
        method: 'POST',
        body: JSON.stringify({
          line_items: [{ sku, quantity }],
          buyer: { email },
          ap2: ap2Enabled ? { activated: true } : undefined,
        }),
      });
      state.sessionId = createRes.id;
      console.log('Created session:', createRes.id);
    } catch (err) {
      const message = err?.message || '';
      if (message.toLowerCase().includes("doesn't exist") || message.toLowerCase().includes('does not exist')) {
        try {
          const results = await gatewayRequest(`/products/search?query=${encodeURIComponent(sku)}`);
          const items = Array.isArray(results?.items) ? results.items : [];
          if (items.length) {
            console.log('Product not found. Did you mean:');
            items.forEach((item, idx) => {
              console.log(`- ${idx + 1}) ${item.sku} (${item.name})`);
            });
            state.skuSuggestions = items;
            console.log('Reply with a SKU from the list.');
          } else {
            console.log('Product not found. No similar SKUs were found.');
          }
        } catch (lookupErr) {
          console.log('Product not found. SKU lookup failed.');
        }
      }
      return { needsInput: true };
    }
  }

  if (
    intent.shipping_address ||
    intent.carrier_code ||
    intent.method_code ||
    (intent.confirm_complete && !state.shippingApplied)
  ) {
    const address = mergeAddress(intent.shipping_address);
    const carrier_code = intent.carrier_code || DEFAULTS.carrier_code;
    const method_code = intent.method_code || DEFAULTS.method_code;
    const updateRes = await gatewayRequest(`/checkout-sessions/${state.sessionId}`, {
      method: 'PUT',
      body: JSON.stringify({
        buyer: { email: intent.email || DEFAULTS.email },
        shipping_address: address,
        shipping_method: { carrier_code, method_code },
      }),
    });
    console.log('Updated shipping:', updateRes.status);
    state.shippingApplied = true;
  }

  if (intent.confirm_complete) {
    if (ap2Enabled) {
      console.log('AP2 mandates required to complete. Provide mandates via a custom client.');
      return { needsInput: true };
    }
    const completeRes = await gatewayRequest(`/checkout-sessions/${state.sessionId}/complete`, {
      method: 'POST',
    });
    console.log('Complete response:', completeRes.status, completeRes.order || completeRes.messages || '');
    if (completeRes.continue_url) {
      console.log('Continue at:', completeRes.continue_url);
    }
  }

  return { needsInput: false };
}
