#!/usr/bin/env node
/* eslint-disable no-console */
// CLI entrypoint for the local agent.
// Node's readline module provides interactive stdin/stdout prompts.
import readline from 'readline';

import { GATEWAY_BASE_URL, OLLAMA_BASE_URL, OLLAMA_MODEL } from './agent/config.mjs';
import { gatewayRequest } from './agent/http.mjs';
import { checkOllamaModel, ollamaChatText, parseIntent } from './agent/ollama.mjs';
import { extractProductQuery, isLikelyCheckout, isProductInquiry } from './agent/intent.mjs';
import { createInitialState } from './agent/state.mjs';
import { handleCheckoutProgress, mergeCheckoutState } from './agent/checkout.mjs';
import { mergeWalletProfileIntoCheckout } from './agent/wallet.mjs';

function isYes(text) {
  return /^(y|yes|ok|okay|sure|use wallet|use saved|use profile)$/i.test(text.trim());
}

function isNo(text) {
  return /^(n|no|nope|nah)$/i.test(text.trim());
}

// Ensures the gateway is reachable before running chat flow.
async function checkGateway() {
  await gatewayRequest('/health', { timeoutMs: 8000 });
}

// Ensures Magento connectivity via the gateway health endpoint.
async function checkMagento() {
  try {
    await gatewayRequest('/health/magento', { timeoutMs: 8000 });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Magento health check timed out. Verify MAGENTO_BASE_URL is reachable.');
    }
    throw err;
  }
}

async function handleLine(state, text) {
  if (state.awaitingWalletConsent) {
    if (isYes(text)) {
      mergeWalletProfileIntoCheckout(state, state.walletProfile);
      state.walletApplied = true;
      state.awaitingWalletConsent = false;
      console.log('Applied wallet profile.');
      const result = await handleCheckoutProgress(state);
      return { ready: !result?.needsInput };
    }
    if (isNo(text)) {
      state.awaitingWalletConsent = false;
      const result = await handleCheckoutProgress(state);
      return { ready: !result?.needsInput };
    }
    console.log('Please reply "yes" or "no" to use the saved wallet profile.');
    return { ready: false };
  }

  if (state.skuSuggestions) {
    const picks = state.skuSuggestions;
    const normalized = text.toLowerCase();
    const index = Number(normalized);
    let selected;
    if (Number.isFinite(index) && index > 0 && index <= picks.length) {
      selected = picks[index - 1];
    } else {
      selected = picks.find(item => item.sku.toLowerCase() === normalized);
    }
    if (selected) {
      state.checkout.sku = selected.sku;
      state.skuSuggestions = null;
      state.pendingCheckout = true;
      console.log(`Selected SKU: ${selected.sku}`);
      const result = await handleCheckoutProgress(state);
      return { ready: !result?.needsInput };
    }
    console.log('Please reply with a SKU from the list (or its number).');
    return { ready: false };
  }

  const productQuery = extractProductQuery(text);
  if (isProductInquiry(text) && (!state.pendingCheckout || !state.checkout.sku)) {
    if (!productQuery) {
      console.log('Tell me a keyword to search the catalog (e.g., "phone", "shirt").');
      return { ready: false };
    }
    const results = await gatewayRequest(`/products/search?query=${encodeURIComponent(productQuery)}`);
    const items = Array.isArray(results?.items) ? results.items : [];
    if (!items.length) {
      console.log(`No products found for "${productQuery}". Try another keyword.`);
      return { ready: false };
    }
    console.log(`Found ${items.length} product(s) for "${productQuery}":`);
    items.forEach((item, idx) => {
      console.log(`- ${idx + 1}) ${item.sku} (${item.name})`);
    });
    state.skuSuggestions = items;
    console.log('Reply with a SKU from the list (or its number).');
    return { ready: false };
  }

  if (!state.pendingCheckout && !isLikelyCheckout(text)) {
    const reply = await ollamaChatText('You are a helpful assistant. Keep responses concise.', text);
    console.log(`Assistant: ${reply || '(no response)'}`);
    return { ready: false };
  }

  const intent = await parseIntent(text);
  if (Object.keys(intent).length === 0 && !state.pendingCheckout) {
    console.log('No checkout fields detected. Try including SKU, quantity, email, or shipping details.');
    return { ready: false };
  }

  mergeCheckoutState(state, intent);
  state.pendingCheckout = true;
  const result = await handleCheckoutProgress(state);
  return { ready: !result?.needsInput };
}

// CLI entrypoint that wires the interactive prompt to chat/checkout flows.
async function main() {
  console.log('Local agentic checkout (Ollama + UCP gateway)');
  console.log(`Gateway: ${GATEWAY_BASE_URL}`);
  console.log(`Ollama: ${OLLAMA_BASE_URL} (${OLLAMA_MODEL})`);
  console.log('Type a message like: "Buy 1 Tiny Phone and ship to John Doe in Detroit".');
  console.log('Type "complete" to attempt checkout, or "exit" to quit.');
  console.log('You can also ask general questions.');

  console.log('Checking Ollama model...');
  await checkOllamaModel();
  console.log('Checking gateway health...');
  await checkGateway();
  console.log('Gateway is reachable.');
  console.log('Checking Magento connectivity...');
  await checkMagento();
  console.log('Magento is reachable.');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const state = createInitialState();
  let busy = false;

  rl.setPrompt('> ');
  rl.prompt();

  rl.on('line', async line => {
    const text = line.trim();
    if (!text) return;
    if (text.toLowerCase() === 'exit') {
      rl.close();
      return;
    }
    if (busy) {
      console.log('Still processing the last message. Please wait...');
      rl.prompt();
      return;
    }
    try {
      busy = true;
      console.log('Processing...');
      const result = await handleLine(state, text);
      if (result?.ready) {
        console.log('Ready.');
      }
    } catch (err) {
      console.error('Error:', err.message || err);
    } finally {
      busy = false;
      rl.prompt();
    }
  });
}

// Run the CLI and exit with non-zero status on startup failures.
main().catch(err => {
  console.error(err);
  process.exit(1);
});
