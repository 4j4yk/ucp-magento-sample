// Zod provides runtime validation for environment variables.
import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.string().optional(),
  BASE_URL: z.string().url(),
  MAGENTO_BASE_URL: z.string().url(),
  MAGENTO_STORE_CODE: z.string().min(1),
  MAGENTO_ADMIN_TOKEN: z.string().min(1),
  PAYMENT_METHOD_CODE: z.string().optional(),
  MAGENTO_CHECKOUT_URL: z.string().url().optional(),
  EXPOSE_MAGENTO_ERRORS: z.string().optional(),
  EXPOSE_DEBUG: z.string().optional(),
  API_KEY: z.string().optional(),
  API_KEY_HEADER: z.string().optional(),
  AP2_ENABLED: z.string().optional(),
  AP2_SIGNING_ALG: z.string().optional(),
  AP2_SIGNING_PRIVATE_KEY_PEM: z.string().optional(),
  AP2_SIGNING_PUBLIC_KEY_PEM: z.string().optional(),
  AP2_PLATFORM_PUBLIC_KEY_PEM: z.string().optional(),
  AP2_PLATFORM_SIGNING_ALG: z.string().optional(),
  AP2_PAYMENT_PUBLIC_KEY_PEM: z.string().optional(),
  AP2_PAYMENT_SIGNING_ALG: z.string().optional(),
  AP2_SUPPORTED_VP_FORMATS: z.string().optional(),
  AP2_ISSUER: z.string().optional(),
  AP2_AUDIENCE: z.string().optional(),
  AP2_CLOCK_SKEW_SEC: z.string().optional(),
  AP2_MANDATE_MAX_AGE_SEC: z.string().optional(),
});

// Inferred type keeps TS in sync with the runtime schema.
export type Env = z.infer<typeof EnvSchema>;
// Parse process.env once and export a typed, validated config object.
export const env: Env = EnvSchema.parse(process.env);
