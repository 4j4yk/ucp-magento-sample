// Axios is an HTTP client used here for Magento REST calls with timeouts.
import axios, { AxiosInstance } from 'axios';
import { env } from '../config';

// Thin wrapper around Magento 2 REST APIs using axios for HTTP and timeouts.
export class MagentoClient {
  private http: AxiosInstance;

  // Builds a scoped axios client with auth header and base URL for the store view.
  constructor() {
    this.http = axios.create({
      baseURL: `${env.MAGENTO_BASE_URL.replace(/\/$/, '')}/rest/${encodeURIComponent(env.MAGENTO_STORE_CODE)}/V1`,
      headers: {
        Authorization: `Bearer ${env.MAGENTO_ADMIN_TOKEN}`,
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    });
  }

  // Creates a guest cart and returns its cart id.
  async createGuestCart(): Promise<string> {
    const { data } = await this.http.post<string>('/guest-carts');
    return data;
  }

  // Adds an item by SKU to a guest cart.
  async addItem(cartId: string, sku: string, quantity: number): Promise<any> {
    const payload = { cartItem: { quote_id: cartId, sku, qty: quantity } };
    const { data } = await this.http.post(`/guest-carts/${encodeURIComponent(cartId)}/items`, payload);
    return data;
  }

  // Retrieves cart totals (taxes/shipping/totals) for display and completeness checks.
  async getTotals(cartId: string): Promise<any> {
    const { data } = await this.http.get(`/guest-carts/${encodeURIComponent(cartId)}/totals`);
    return data;
  }

  // Estimates shipping methods based on a provisional address.
  async estimateShippingMethods(cartId: string, address: MagentoAddress): Promise<any[]> {
    const { data } = await this.http.post<any[]>(
      `/guest-carts/${encodeURIComponent(cartId)}/estimate-shipping-methods`,
      { address }
    );
    return data;
  }

  // Persists shipping method and address to the cart, returning Magento's response payload.
  async setShippingInformation(cartId: string, info: ShippingInformationPayload): Promise<any> {
    const { data } = await this.http.post(
      `/guest-carts/${encodeURIComponent(cartId)}/shipping-information`,
      info
    );
    return data;
  }

  /**
   * Places order for a guest cart.
   * Many Magento setups require email + billing_address even for simple methods like checkmo.
   */
  // Uses Magento's payment-information endpoint to finalize the order.
  async placeOrder(cartId: string, paymentMethodCode: string, email: string, billingAddress: MagentoAddress): Promise<any> {
    const payload = {
      email,
      paymentMethod: { method: paymentMethodCode },
      billing_address: billingAddress,
    };
    const { data } = await this.http.post(
      `/guest-carts/${encodeURIComponent(cartId)}/payment-information`,
      payload
    );
    return data;
  }

  // Lightweight connectivity check against Magento store views.
  async ping(): Promise<any> {
    const { data } = await this.http.get('/store/storeViews');
    return data;
  }

  // Searches catalog products by name or SKU to provide suggestions for user input.
  async searchProducts(query: string, limit = 5): Promise<Array<{ sku: string; name: string }>> {
    const q = query.trim();
    if (!q) return [];
    const params = new URLSearchParams();
    params.set('searchCriteria[pageSize]', String(limit));
    params.set('searchCriteria[currentPage]', '1');
    params.set('searchCriteria[filter_groups][0][filters][0][field]', 'name');
    params.set('searchCriteria[filter_groups][0][filters][0][condition_type]', 'like');
    params.set('searchCriteria[filter_groups][0][filters][0][value]', `%${q}%`);
    params.set('searchCriteria[filter_groups][1][filters][0][field]', 'sku');
    params.set('searchCriteria[filter_groups][1][filters][0][condition_type]', 'like');
    params.set('searchCriteria[filter_groups][1][filters][0][value]', `%${q}%`);

    const { data } = await this.http.get(`/products?${params.toString()}`);
    const items = Array.isArray(data?.items) ? data.items : [];
    return items
      .map((item: any) => ({ sku: item.sku, name: item.name }))
      .filter(item => item.sku && item.name)
      .slice(0, limit);
  }
}

export interface MagentoAddress {
  firstname: string;
  lastname: string;
  street: string[];
  city: string;
  region?: string;
  region_code?: string;
  region_id?: number;
  postcode: string;
  country_id: string;
  telephone: string;
  email?: string;
  same_as_billing?: number;
  save_in_address_book?: number;
}

export interface ShippingInformationPayload {
  addressInformation: {
    shipping_address: MagentoAddress;
    billing_address?: MagentoAddress;
    shipping_method_code: string;
    shipping_carrier_code: string;
  };
}
