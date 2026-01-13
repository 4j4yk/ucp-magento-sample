// Zod provides runtime validation for request payloads.
import { z } from 'zod';

// Zod schemas validate incoming REST payloads and provide inferred TS types.
export const LineItemSchema = z.object({
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
});

// Buyer schema used for minimal email capture.
export const BuyerSchema = z.object({
  email: z.string().email().optional(),
});

// Shipping/billing address fields required by Magento.
export const AddressSchema = z.object({
  firstname: z.string().min(1),
  lastname: z.string().min(1),
  street: z.array(z.string().min(1)).min(1),
  city: z.string().min(1),
  region: z.string().optional(),
  region_code: z.string().optional(),
  region_id: z.number().int().positive().optional(),
  postcode: z.string().min(1),
  country_id: z.string().min(2).max(2),
  telephone: z.string().min(5),
});

// Shipping method selection used in Magento.
export const ShippingMethodSchema = z.object({
  carrier_code: z.string().min(1),
  method_code: z.string().min(1),
});

// AP2 activation flag for platform flows.
export const Ap2Schema = z.object({
  activated: z.boolean().optional(),
});

// Create session payload: items + optional buyer + AP2 activation.
export const CreateCheckoutSessionSchema = z.object({
  line_items: z.array(LineItemSchema).min(1),
  buyer: BuyerSchema.optional(),
  ap2: Ap2Schema.optional(),
});

// Update session payload: buyer, shipping address, and shipping method.
export const UpdateCheckoutSessionSchema = z.object({
  buyer: BuyerSchema.optional(),
  shipping_address: AddressSchema.optional(),
  shipping_method: ShippingMethodSchema.optional(),
  ap2: Ap2Schema.optional(),
});

// Inferred input types used in service layer.
export type CreateCheckoutSessionInput = z.infer<typeof CreateCheckoutSessionSchema>;
export type UpdateCheckoutSessionInput = z.infer<typeof UpdateCheckoutSessionSchema>;

// Complete session payload includes optional mandates for AP2 flows.
export const CompleteCheckoutSessionSchema = z.object({
  checkout_mandate: z.union([z.string(), z.record(z.any())]).optional(),
  payment_mandate: z.union([z.string(), z.record(z.any())]).optional(),
});

// Inferred type for complete input.
export type CompleteCheckoutSessionInput = z.infer<typeof CompleteCheckoutSessionSchema>;
