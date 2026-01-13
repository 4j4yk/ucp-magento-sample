// Centralized env config for the local agent. Keep this file free of side effects.
// dotenv loads .env values into process.env for local development.
import 'dotenv/config';

export const GATEWAY_BASE_URL = process.env.GATEWAY_BASE_URL || process.env.BASE_URL || 'http://localhost:3000';
export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1';
export const WALLET_PROFILE_PATH = process.env.WALLET_PROFILE_PATH;
export const AUTO_USE_WALLET = process.env.AUTO_USE_WALLET === 'true';

export const API_KEY = process.env.API_KEY;
export const API_KEY_HEADER = (process.env.API_KEY_HEADER || 'x-api-key').toLowerCase();

// Default values used for best-effort checkout when chat misses fields.
// Default values used for best-effort checkout when chat misses fields.
export const DEFAULTS = {
  sku: process.env.SKU || 'test-sku-1',
  quantity: Number(process.env.QTY || 1),
  email: process.env.BUYER_EMAIL || 'buyer@example.com',
  carrier_code: process.env.CARRIER_CODE || 'flatrate',
  method_code: process.env.METHOD_CODE || 'flatrate',
  shipping_address: {
    firstname: process.env.FIRSTNAME || 'John',
    lastname: process.env.LASTNAME || 'Doe',
    street: [process.env.STREET1 || '1 Main St'],
    city: process.env.CITY || 'Detroit',
    region: process.env.REGION || 'Michigan',
    region_code: process.env.REGION_CODE || 'MI',
    region_id: process.env.REGION_ID ? Number(process.env.REGION_ID) : undefined,
    postcode: process.env.POSTCODE || '48201',
    country_id: process.env.COUNTRY_ID || 'US',
    telephone: process.env.TELEPHONE || '1231231234',
  },
};

// Required fields for a valid shipping address.
export const REQUIRED_ADDRESS_FIELDS = [
  'firstname',
  'lastname',
  'street',
  'city',
  'region',
  'region_code',
  'postcode',
  'country_id',
  'telephone',
];
