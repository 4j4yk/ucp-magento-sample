// Ollama client helpers for JSON intent extraction and general chat.
import { OLLAMA_BASE_URL, OLLAMA_MODEL } from './config.mjs';
import { buildSignal } from './http.mjs';

// Strict JSON extraction for model outputs (no surrounding text).
function extractJson(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

// Sends a system/user prompt to Ollama for structured JSON extraction.
async function ollamaChat(system, user) {
  const built = buildSignal(undefined, 60000);
  let res;
  try {
    res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        format: 'json',
        stream: false,
      }),
      signal: built?.signal,
    });
  } finally {
    if (built?.cleanup) built.cleanup();
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error: ${text}`);
  }
  const data = await res.json();
  return data?.message?.content || '';
}

// Sends a general-chat prompt to Ollama (non-JSON responses).
export async function ollamaChatText(system, user) {
  const built = buildSignal(undefined, 60000);
  let res;
  try {
    res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        stream: false,
      }),
      signal: built?.signal,
    });
  } finally {
    if (built?.cleanup) built.cleanup();
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error: ${text}`);
  }
  const data = await res.json();
  return data?.message?.content || '';
}

// Parses the user message into a structured intent using Ollama or direct JSON.
export async function parseIntent(input) {
  const direct = extractJson(input);
  if (direct) {
    return direct;
  }
  const system = [
    'You are a checkout assistant. Return ONLY a single JSON object. No extra text.',
    'Return a JSON object with any of these optional keys:',
    'sku, quantity, email, shipping_address, carrier_code, method_code, confirm_complete.',
    'shipping_address should include: firstname, lastname, street (array), city, region, region_code, region_id, postcode, country_id, telephone.',
    'If user just says "checkout" or "complete", set confirm_complete to true.',
    'If you cannot infer a field, omit it.',
  ].join(' ');
  const content = await ollamaChat(system, input);
  const parsed = extractJson(content);
  if (!parsed) {
    console.log('Model response was not valid JSON. Try rephrasing with explicit fields.');
    return {};
  }
  return parsed;
}

// Verifies that the configured Ollama model exists locally and warns if missing.
export async function checkOllamaModel() {
  const built = buildSignal(undefined, 8000);
  let res;
  try {
    res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: built?.signal });
  } finally {
    if (built?.cleanup) built.cleanup();
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama tags error: ${text}`);
  }
  const data = await res.json();
  const models = Array.isArray(data?.models) ? data.models.map(m => m.name) : [];
  if (!models.includes(OLLAMA_MODEL)) {
    console.log(`Warning: Ollama model "${OLLAMA_MODEL}" not found. Installed: ${models.join(', ') || 'none'}.`);
  }
}
