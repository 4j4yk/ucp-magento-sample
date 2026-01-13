import { CompleteCheckoutSessionInput, CreateCheckoutSessionInput, UpdateCheckoutSessionInput } from '../ucp/ucpSchemas';
import { MagentoAddress } from '../magento/magentoClient';
import { MagentoService } from './MagentoService';
import { Ap2Service } from './Ap2Service';
// nanoid generates short, URL-safe ids for session handles.
import { nanoid } from 'nanoid';
import { getSessionRepository } from '../storage/sessionStore';
import { SessionRepository } from '../storage/sessionRepository';
import { CheckoutSessionRecord } from '../storage/sessionTypes';
import { toUcpSession, UcpMessage } from '../ucp/ucpMapper';
import { env } from '../config';
import { HttpError } from '../errors/httpError';

// Orchestrates checkout session lifecycle and maps it to Magento cart operations.
export class CheckoutSessionService {
  private magento: MagentoService;
  private ap2: Ap2Service;
  private repo: SessionRepository;

  // Accepts optional dependencies for easier unit testing.
  constructor(magento?: MagentoService, ap2?: Ap2Service, repo?: SessionRepository) {
    this.magento = magento ?? new MagentoService();
    this.ap2 = ap2 ?? new Ap2Service();
    this.repo = repo ?? getSessionRepository();
  }

  // Retrieves a session or throws a 404 error for unknown ids.
  private getSessionById(id: string): CheckoutSessionRecord {
    const rec = this.repo.get(id);
    if (!rec) {
      throw new HttpError(404, `Unknown checkout session: ${id}`);
    }
    return rec;
  }

  // Creates a new session record with a short, URL-safe id via nanoid.
  private createSessionRecord(magentoCartId: string, items?: Array<{ sku: string; quantity: number }>): CheckoutSessionRecord {
    const now = new Date().toISOString();
    const rec: CheckoutSessionRecord = {
      id: nanoid(14),
      magentoCartId,
      createdAt: now,
      updatedAt: now,
      status: 'incomplete',
      items,
    };
    this.repo.set(rec);
    return rec;
  }

  // Applies a partial update to the stored session record.
  private updateSessionRecord(id: string, patch: Partial<CheckoutSessionRecord>): CheckoutSessionRecord {
    const current = this.getSessionById(id);
    const next: CheckoutSessionRecord = { ...current, ...patch, updatedAt: new Date().toISOString() };
    this.repo.set(next);
    return next;
  }

  // Marks a session as canceled.
  private cancelSessionRecord(id: string): CheckoutSessionRecord {
    return this.updateSessionRecord(id, { status: 'canceled' });
  }

  // Converts a UCP address payload into Magento's address format.
  private mapAddressToMagento(addr: any, email?: string): MagentoAddress {
    return {
      firstname: addr.firstname,
      lastname: addr.lastname,
      street: addr.street,
      city: addr.city,
      region: addr.region,
      region_code: addr.region_code,
      region_id: addr.region_id,
      postcode: addr.postcode,
      country_id: addr.country_id,
      telephone: addr.telephone,
      email,
      same_as_billing: 1,
      save_in_address_book: 0,
    };
  }

  // Creates a Magento guest cart, adds items, and returns a UCP session response.
  async create(input: CreateCheckoutSessionInput): Promise<{ status: number; body: any }> {
    const cartId = await this.magento.createGuestCart();
    for (const li of input.line_items) {
      await this.magento.addItem(cartId, li.sku, li.quantity);
    }

    const totals = await this.magento.getTotals(cartId);
    const rec = this.createSessionRecord(cartId, input.line_items);
    let updated = this.updateSessionRecord(rec.id, { buyerEmail: input.buyer?.email, lastTotals: totals });

    if (this.ap2.enabled()) {
      updated = this.updateSessionRecord(rec.id, this.ap2.computeStatePatch(updated));
    }

    return {
      status: 201,
      body: toUcpSession(updated, {
        totals,
        messages: [{ severity: 'info', code: 'created', message: 'Checkout session created.' }],
      }),
    };
  }

  // Retrieves the current session state and refreshes totals from Magento.
  async get(id: string): Promise<{ status: number; body: any }> {
    const rec = this.getSessionById(id);
    if (rec.status === 'canceled') return { status: 200, body: toUcpSession(rec) };
    const totals = await this.magento.getTotals(rec.magentoCartId);
    const nextRec = this.updateSessionRecord(rec.id, { lastTotals: totals });
    return { status: 200, body: toUcpSession(nextRec, { totals }) };
  }

  // Updates buyer email, shipping address, and/or shipping method.
  async update(id: string, input: UpdateCheckoutSessionInput): Promise<{ status: number; body: any }> {
    const rec = this.getSessionById(id);
    if (rec.status === 'canceled' || rec.status === 'completed') {
      return { status: 409, body: { error: `Session is ${rec.status}` } };
    }

    const messages: UcpMessage[] = [];

    if (input.buyer?.email) {
      this.updateSessionRecord(rec.id, { buyerEmail: input.buyer.email });
      messages.push({ severity: 'info', code: 'buyer_updated', message: 'Buyer email updated.' });
    }

    if (input.shipping_address) {
      this.updateSessionRecord(rec.id, { shippingAddress: input.shipping_address });

      const address = this.mapAddressToMagento(input.shipping_address, input.buyer?.email ?? rec.buyerEmail);
      const methods = await this.magento.estimateShippingMethods(rec.magentoCartId, address);
      this.updateSessionRecord(rec.id, { lastShippingMethods: methods });
      messages.push({
        severity: 'info',
        code: 'shipping_methods_available',
        message: 'Shipping methods estimated. Select one via shipping_method.',
      });
    }

    if (input.shipping_method) {
      if (!input.shipping_address) {
        throw new HttpError(400, 'For MVP, shipping_method update requires shipping_address in the same request.');
      }

      const email = input.buyer?.email ?? rec.buyerEmail;
      const address = this.mapAddressToMagento(input.shipping_address, email);

      const shippingInfoResult = await this.magento.setShippingInformation(rec.magentoCartId, {
        addressInformation: {
          shipping_address: address,
          shipping_method_code: input.shipping_method.method_code,
          shipping_carrier_code: input.shipping_method.carrier_code,
        },
      });

      const totals = shippingInfoResult?.totals ?? (await this.magento.getTotals(rec.magentoCartId));
      const ready = Boolean(email);
      const status = ready ? 'ready_for_complete' : 'incomplete';

      const nextRec = this.updateSessionRecord(rec.id, {
        status,
        lastTotals: totals,
        shippingMethod: input.shipping_method,
      });

      if (this.ap2.enabled()) {
        this.updateSessionRecord(rec.id, this.ap2.computeStatePatch(nextRec));
      }

      messages.push({ severity: 'info', code: 'shipping_selected', message: 'Shipping method selected.' });
      return { status: 200, body: toUcpSession(nextRec, { totals, messages }) };
    }

    const totals = await this.magento.getTotals(rec.magentoCartId);
    const nextRec = this.updateSessionRecord(rec.id, { lastTotals: totals });

    if (this.ap2.enabled()) {
      this.updateSessionRecord(rec.id, this.ap2.computeStatePatch(nextRec));
    }

    return { status: 200, body: toUcpSession(nextRec, { totals, messages }) };
  }

  // Completes checkout by validating AP2 mandates (if enabled) and placing a Magento order.
  async complete(id: string, input: CompleteCheckoutSessionInput): Promise<{ status: number; body: any }> {
    const rec = this.getSessionById(id);

    if (rec.status === 'canceled') return { status: 409, body: { error: 'Session canceled' } };
    if (rec.status === 'completed') return { status: 200, body: toUcpSession(rec) };
    if (rec.status === 'complete_in_progress') return { status: 409, body: { error: 'Session is complete_in_progress' } };

    if (this.ap2.enabled() || rec.ap2Activated) {
      if (!input.checkout_mandate || !input.payment_mandate) {
        throw new HttpError(400, 'AP2 mandates are required to complete this session.');
      }
      if (rec.ap2MandateVerifiedAt) {
        throw new HttpError(409, 'AP2 mandates already verified for this session.');
      }
      this.ap2.verifyMandates(rec, input.checkout_mandate, input.payment_mandate);
      this.updateSessionRecord(rec.id, { ap2MandateVerifiedAt: new Date().toISOString() });
    }

    if (!env.PAYMENT_METHOD_CODE) {
      const nextRec = this.updateSessionRecord(rec.id, { status: 'requires_escalation' });
      return {
        status: 200,
        body: toUcpSession(nextRec, {
          messages: [
            {
              severity: 'warning',
              code: 'payment_required',
              message: 'Payment requires buyer handoff. Follow continue_url to complete in merchant checkout.',
            },
          ],
        }),
      };
    }

    const email = rec.buyerEmail;
    const addr = rec.shippingAddress;

    if (!email || !addr) {
      const nextRec = this.updateSessionRecord(rec.id, { status: 'requires_escalation' });
      return {
        status: 200,
        body: toUcpSession(nextRec, {
          messages: [
            {
              severity: 'warning',
              code: 'missing_checkout_data',
              message: 'Missing buyer email or shipping address. Continue in merchant checkout.',
            },
          ],
        }),
      };
    }

    this.updateSessionRecord(rec.id, { status: 'complete_in_progress' });

    const billing = this.mapAddressToMagento(addr, email);
    const orderId = await this.magento.placeOrder(rec.magentoCartId, env.PAYMENT_METHOD_CODE, email, billing);

    const nextRec = this.updateSessionRecord(rec.id, { status: 'completed' });
    return {
      status: 200,
      body: {
        ...toUcpSession(nextRec, {
          messages: [{ severity: 'info', code: 'order_placed', message: 'Order placed successfully.' }],
        }),
        order: { id: String(orderId) },
      },
    };
  }

  // Cancels the session without touching the Magento cart (MVP behavior).
  async cancel(id: string): Promise<{ status: number; body: any }> {
    const rec = this.cancelSessionRecord(id);
    return {
      status: 200,
      body: toUcpSession(rec, { messages: [{ severity: 'info', code: 'canceled', message: 'Session canceled.' }] }),
    };
  }
}
