export type SessionStatus =
  | 'incomplete'
  | 'requires_escalation'
  | 'ready_for_complete'
  | 'complete_in_progress'
  | 'completed'
  | 'canceled';

export interface CheckoutSessionRecord {
  id: string;
  magentoCartId: string;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;

  buyerEmail?: string;
  shippingAddress?: any;
  shippingMethod?: { carrier_code: string; method_code: string };

  lastTotals?: any;
  lastShippingMethods?: any[];

  items?: Array<{ sku: string; quantity: number }>;

  ap2Activated?: boolean;
  checkoutNonce?: string;
  checkoutStateHash?: string;
  checkoutSignature?: string;
  supportedVpFormats?: string[];
  ap2MandateVerifiedAt?: string;
}
