// Shared HTTP helpers for gateway calls.
import { API_KEY, API_KEY_HEADER, GATEWAY_BASE_URL } from './config.mjs';

// Builds HTTP headers for gateway requests, including API key when configured.
export function gatewayHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) headers[API_KEY_HEADER] = API_KEY;
  return headers;
}

// Constructs an AbortSignal with optional timeout and parent signal propagation.
export function buildSignal(parentSignal, timeoutMs) {
  if (!timeoutMs && !parentSignal) return undefined;
  const controller = new AbortController();
  let timer;

  if (timeoutMs) {
    timer = setTimeout(() => controller.abort(), timeoutMs);
  }

  if (parentSignal) {
    if (parentSignal.aborted) {
      controller.abort();
    } else {
      parentSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  return { signal: controller.signal, cleanup: () => timer && clearTimeout(timer) };
}

// Issues a request to the gateway with JSON parsing and error normalization.
export async function gatewayRequest(path, options = {}) {
  const { signal: parentSignal, timeoutMs = 10000, ...rest } = options;
  const built = buildSignal(parentSignal, timeoutMs);
  let res;
  try {
    res = await fetch(`${GATEWAY_BASE_URL}${path}`, {
      ...rest,
      headers: { ...gatewayHeaders(), ...(options.headers || {}) },
      signal: built?.signal || parentSignal,
    });
  } finally {
    if (built?.cleanup) built.cleanup();
  }
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const message = data?.error || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return data;
}
