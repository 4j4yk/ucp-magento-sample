// Creates the initial in-memory agent state for a single CLI session.
import { AUTO_USE_WALLET } from './config.mjs';
import { loadWalletProfile } from './wallet.mjs';

export function createInitialState() {
  return {
    sessionId: null,
    shippingApplied: false,
    pendingCheckout: false,
    confirmComplete: false,
    skuSuggestions: null,
    walletProfile: loadWalletProfile(),
    autoUseWallet: AUTO_USE_WALLET,
    walletAsked: false,
    awaitingWalletConsent: false,
    walletApplied: false,
    checkout: {
      sku: null,
      quantity: null,
      email: null,
      shipping_address: null,
      carrier_code: null,
      method_code: null,
    },
  };
}
