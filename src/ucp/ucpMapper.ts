import { env } from '../config';
import { supportedVpFormats } from './ap2';
import { CheckoutSessionRecord, SessionStatus } from '../storage/sessionTypes';

// Message payloads returned to clients to describe state transitions or warnings.
export interface UcpMessage {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
}

// Builds a continue URL for browser handoff flows.
export function continueUrl(sessionId: string): string {
  return `${env.BASE_URL.replace(/\/$/, '')}/continue/${encodeURIComponent(sessionId)}`;
}

// Maps internal session records to the UCP REST response shape.
export function toUcpSession(
  rec: CheckoutSessionRecord,
  extras?: { totals?: any; shippingMethods?: any[]; messages?: UcpMessage[] }
): any {
  const status: SessionStatus = rec.status;

  const session: any = {
    id: rec.id,
    status,
    // For MVP: show continue_url for any non-terminal state
    continue_url: (status === 'completed' || status === 'canceled') ? undefined : continueUrl(rec.id),
    buyer: rec.buyerEmail ? { email: rec.buyerEmail } : undefined,
    line_items: rec.items ?? undefined,
    totals: extras?.totals ?? rec.lastTotals ?? undefined,
    shipping_methods: extras?.shippingMethods ?? rec.lastShippingMethods ?? undefined,
    messages: extras?.messages ?? [],
    // AP2 response block for platform verification.
    ap2: rec.ap2Activated
      ? {
          activated: true,
          checkout_signature: rec.checkoutSignature,
          supported_vp_formats: rec.supportedVpFormats ?? supportedVpFormats(),
        }
      : undefined,
    _debug:
      env.EXPOSE_DEBUG === 'true'
        ? {
            magento_cart_id: rec.magentoCartId,
            updated_at: rec.updatedAt,
          }
        : undefined,
  };

  // Remove undefined fields for cleaner output
  Object.keys(session).forEach(k => session[k] === undefined && delete session[k]);
  return session;
}
