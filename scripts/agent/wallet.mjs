// Wallet profile loading and merge helpers.
// Node's fs module reads wallet profiles from disk.
import fs from 'fs';
// Zod validates the wallet schema at runtime.
import { z } from 'zod';
import { WALLET_PROFILE_PATH } from './config.mjs';

const walletSchema = z
  .object({
    email: z.string().email().optional(),
    quantity: z.number().int().positive().optional(),
    carrier_code: z.string().min(1).optional(),
    method_code: z.string().min(1).optional(),
    shipping_address: z
      .object({
        firstname: z.string().min(1).optional(),
        lastname: z.string().min(1).optional(),
        street: z.array(z.string().min(1)).min(1).optional(),
        city: z.string().min(1).optional(),
        region: z.string().min(1).optional(),
        region_code: z.string().min(1).optional(),
        region_id: z.number().int().positive().optional(),
        postcode: z.string().min(1).optional(),
        country_id: z.string().min(1).optional(),
        telephone: z.string().min(1).optional(),
      })
      .optional(),
  })
  .strict();

function validateWalletProfile(raw, sourceLabel) {
  const result = walletSchema.safeParse(raw);
  if (!result.success) {
    console.log(`Wallet profile is invalid (${sourceLabel}). Wallet autofill disabled.`);
    return null;
  }
  return result.data;
}

// Load a wallet profile from file or env, returning a validated object or null.
export function loadWalletProfile() {
  if (WALLET_PROFILE_PATH && fs.existsSync(WALLET_PROFILE_PATH)) {
    try {
      const raw = fs.readFileSync(WALLET_PROFILE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object'
        ? validateWalletProfile(parsed, WALLET_PROFILE_PATH)
        : null;
    } catch (err) {
      console.log(`Wallet profile could not be loaded: ${err.message || err}`);
      return null;
    }
  } else if (WALLET_PROFILE_PATH) {
    console.log(`Wallet profile file not found: ${WALLET_PROFILE_PATH}`);
    return null;
  }

  const hasEnvWallet =
    process.env.WALLET_EMAIL ||
    process.env.WALLET_QUANTITY ||
    process.env.WALLET_FIRSTNAME ||
    process.env.WALLET_LASTNAME ||
    process.env.WALLET_STREET1 ||
    process.env.WALLET_CITY ||
    process.env.WALLET_REGION ||
    process.env.WALLET_REGION_CODE ||
    process.env.WALLET_POSTCODE ||
    process.env.WALLET_COUNTRY_ID ||
    process.env.WALLET_TELEPHONE ||
    process.env.WALLET_CARRIER_CODE ||
    process.env.WALLET_METHOD_CODE;

  if (!hasEnvWallet) return null;

  const wallet = {
    email: process.env.WALLET_EMAIL || undefined,
    quantity: process.env.WALLET_QUANTITY ? Number(process.env.WALLET_QUANTITY) : undefined,
    carrier_code: process.env.WALLET_CARRIER_CODE || undefined,
    method_code: process.env.WALLET_METHOD_CODE || undefined,
    shipping_address: {
      firstname: process.env.WALLET_FIRSTNAME || undefined,
      lastname: process.env.WALLET_LASTNAME || undefined,
      street: process.env.WALLET_STREET1 ? [process.env.WALLET_STREET1] : undefined,
      city: process.env.WALLET_CITY || undefined,
      region: process.env.WALLET_REGION || undefined,
      region_code: process.env.WALLET_REGION_CODE || undefined,
      region_id: process.env.WALLET_REGION_ID ? Number(process.env.WALLET_REGION_ID) : undefined,
      postcode: process.env.WALLET_POSTCODE || undefined,
      country_id: process.env.WALLET_COUNTRY_ID || undefined,
      telephone: process.env.WALLET_TELEPHONE || undefined,
    },
  };

  return validateWalletProfile(wallet, 'env');
}

// Merge wallet data into checkout state without overwriting user-supplied values.
export function mergeWalletProfileIntoCheckout(state, walletProfile) {
  if (!walletProfile || typeof walletProfile !== 'object') return;
  const checkout = state.checkout;

  if (!checkout.email && walletProfile.email) checkout.email = walletProfile.email;
  if (!checkout.quantity && walletProfile.quantity) checkout.quantity = walletProfile.quantity;
  if (!checkout.carrier_code && walletProfile.carrier_code) checkout.carrier_code = walletProfile.carrier_code;
  if (!checkout.method_code && walletProfile.method_code) checkout.method_code = walletProfile.method_code;

  if (walletProfile.shipping_address) {
    const existing = checkout.shipping_address || {};
    const incoming = walletProfile.shipping_address;
    const merged = { ...incoming, ...existing };
    if (existing.street && Array.isArray(existing.street)) {
      merged.street = existing.street;
    }
    if (!merged.street && incoming.street && Array.isArray(incoming.street)) {
      merged.street = incoming.street;
    }
    checkout.shipping_address = merged;
  }
}
