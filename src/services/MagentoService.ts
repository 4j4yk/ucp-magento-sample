import { MagentoClient, MagentoAddress, ShippingInformationPayload } from '../magento/magentoClient';

// Service layer that wraps MagentoClient for easier mocking and orchestration.
export class MagentoService {
  private client: MagentoClient;

  // Allows injection of a custom client (tests) while defaulting to the real Magento client.
  constructor(client?: MagentoClient) {
    this.client = client ?? new MagentoClient();
  }

  // Creates a guest cart and returns its Magento cart id.
  createGuestCart(): Promise<string> {
    return this.client.createGuestCart();
  }

  // Adds an item into the Magento cart.
  addItem(cartId: string, sku: string, quantity: number): Promise<any> {
    return this.client.addItem(cartId, sku, quantity);
  }

  // Fetches current cart totals.
  getTotals(cartId: string): Promise<any> {
    return this.client.getTotals(cartId);
  }

  // Estimates shipping methods for the cart based on the provided address.
  estimateShippingMethods(cartId: string, address: MagentoAddress): Promise<any[]> {
    return this.client.estimateShippingMethods(cartId, address);
  }

  // Sets shipping information on the Magento cart.
  setShippingInformation(cartId: string, info: ShippingInformationPayload): Promise<any> {
    return this.client.setShippingInformation(cartId, info);
  }

  // Places the order for the cart using the configured payment method.
  placeOrder(cartId: string, paymentMethodCode: string, email: string, billingAddress: MagentoAddress): Promise<any> {
    return this.client.placeOrder(cartId, paymentMethodCode, email, billingAddress);
  }

  // Searches catalog products for human-friendly SKU suggestions.
  searchProducts(query: string, limit?: number): Promise<Array<{ sku: string; name: string }>> {
    return this.client.searchProducts(query, limit);
  }

  // Pings Magento to validate connectivity and credentials.
  ping(): Promise<any> {
    return this.client.ping();
  }
}
