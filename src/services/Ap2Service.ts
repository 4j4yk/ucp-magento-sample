import { CheckoutSessionRecord } from '../storage/sessionTypes';
import {
  ap2Enabled,
  buildCheckoutState,
  generateNonce,
  hashCheckoutState,
  signCheckoutHash,
  supportedVpFormats,
  verifyCheckoutMandate,
  verifyPaymentMandate,
} from '../ucp/ap2';

// Encapsulates AP2 (authorization and mandate) operations for checkout sessions.
export class Ap2Service {
  private audit(event: string, meta: Record<string, unknown>): void {
    // Avoid logging PII; include only session and event metadata.
    console.info(JSON.stringify({ event, ...meta }));
  }

  // Indicates whether AP2 features are enabled via environment configuration.
  enabled(): boolean {
    return ap2Enabled();
  }

  // Computes and returns the AP2-related fields to persist on a session.
  computeStatePatch(rec: CheckoutSessionRecord): Partial<CheckoutSessionRecord> {
    const nonce = rec.checkoutNonce ?? generateNonce();
    const state = buildCheckoutState({ ...rec, checkoutNonce: nonce });
    const checkoutStateHash = hashCheckoutState(state);
    const checkoutSignature = signCheckoutHash(checkoutStateHash, rec.id, nonce);
    return {
      ap2Activated: true,
      checkoutNonce: nonce,
      checkoutStateHash,
      checkoutSignature,
      supportedVpFormats: supportedVpFormats(),
    };
  }

  // Verifies checkout and payment mandates against the current session state.
  verifyMandates(
    rec: CheckoutSessionRecord,
    checkoutMandate: unknown,
    paymentMandate: unknown
  ): void {
    if (rec.ap2MandateVerifiedAt) {
      throw new Error('AP2 mandates already verified for this session.');
    }
    if (!rec.checkoutNonce) {
      throw new Error('AP2 checkout nonce is missing for this session.');
    }
    const expectedHash = rec.checkoutStateHash ?? hashCheckoutState(buildCheckoutState(rec));
    const nonce = rec.checkoutNonce;
    this.audit('ap2_mandate_verification_attempt', { sessionId: rec.id });
    try {
      verifyCheckoutMandate(checkoutMandate, expectedHash, rec.id, nonce);
      verifyPaymentMandate(paymentMandate);
      this.audit('ap2_mandate_verification_success', { sessionId: rec.id });
    } catch (err: any) {
      this.audit('ap2_mandate_verification_failed', {
        sessionId: rec.id,
        error: err?.message || String(err),
      });
      throw err;
    }
  }
}
