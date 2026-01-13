// Node's crypto module provides hashing and signing primitives.
import crypto from 'crypto';
import { env } from '../config';
import { CheckoutSessionRecord } from '../storage/sessionTypes';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

// URL-safe Base64 encoding for JWT-compatible payloads.
function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// URL-safe Base64 decoding for JWT payloads.
function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

// Canonical JSON for deterministic hashing of the checkout state.
// This ensures stable hashing across runtimes for AP2 signatures.
function canonicalize(value: JsonValue): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const entries = keys.map(k => `${JSON.stringify(k)}:${canonicalize((value as any)[k])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

// Checks whether AP2 is enabled in configuration.
export function ap2Enabled(): boolean {
  return env.AP2_ENABLED === 'true';
}

// Returns supported verifiable presentation formats for AP2 responses.
export function supportedVpFormats(): string[] {
  const raw = env.AP2_SUPPORTED_VP_FORMATS ?? '';
  const formats = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return formats.length ? formats : ['sd-jwt'];
}

// Generates a random nonce for checkout signatures.
export function generateNonce(): string {
  return base64UrlEncode(crypto.randomBytes(16));
}

// Minimal state snapshot used to derive the checkout hash.
// Only includes fields that affect checkout integrity.
export function buildCheckoutState(rec: CheckoutSessionRecord): JsonValue {
  return {
    session_id: rec.id,
    nonce: rec.checkoutNonce ?? null,
    id: rec.id,
    buyer: rec.buyerEmail ? { email: rec.buyerEmail } : null,
    line_items: rec.items ?? [],
    shipping_address: rec.shippingAddress ?? null,
    shipping_method: rec.shippingMethod ?? null,
    totals: rec.lastTotals ?? null,
  };
}

// SHA-256 hash of the canonicalized checkout state.
// Produces a deterministic hash used for mandate verification.
export function hashCheckoutState(state: JsonValue): string {
  const canonical = canonicalize(state);
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

// Returns the current epoch time in seconds.
function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

// Parses clock skew tolerance for JWT validation.
function parseClockSkew(): number {
  const raw = env.AP2_CLOCK_SKEW_SEC ?? '60';
  const num = Number(raw);
  return Number.isFinite(num) ? num : 60;
}

// Parses maximum acceptable mandate age for checkout signatures.
function parseMaxAge(): number {
  const raw = env.AP2_MANDATE_MAX_AGE_SEC ?? '600';
  const num = Number(raw);
  return Number.isFinite(num) ? num : 600;
}

// Ensures signing keys are available when AP2 is enabled.
function assertAp2SigningConfig(): void {
  if (!ap2Enabled()) return;
  if (!env.AP2_SIGNING_PRIVATE_KEY_PEM || !env.AP2_SIGNING_PUBLIC_KEY_PEM) {
    throw new Error('AP2 signing keys are required when AP2 is enabled.');
  }
}

// Validates AP2-related environment configuration at startup.
export function validateAp2Config(): void {
  if (!ap2Enabled()) return;
  assertAp2SigningConfig();
  if (!env.AP2_PLATFORM_PUBLIC_KEY_PEM) {
    throw new Error('AP2_PLATFORM_PUBLIC_KEY_PEM is required when AP2 is enabled.');
  }
  if (!env.AP2_PAYMENT_PUBLIC_KEY_PEM) {
    throw new Error('AP2_PAYMENT_PUBLIC_KEY_PEM is required when AP2 is enabled.');
  }
}

// Returns a list of allowed algorithms, with defaults.
function algList(source?: string, fallback?: string): string[] {
  const alg = (source ?? fallback ?? 'RS256').toUpperCase();
  return [alg];
}

// Business-signed JWT for checkout signature (RS256/ES256).
// Uses Node's crypto module for signing to avoid extra deps.
function signJwt(payload: Record<string, unknown>): string {
  assertAp2SigningConfig();
  const alg = (env.AP2_SIGNING_ALG ?? 'RS256').toUpperCase();
  if (!['RS256', 'ES256'].includes(alg)) {
    throw new Error(`Unsupported AP2_SIGNING_ALG: ${alg}`);
  }
  const header = base64UrlEncode(JSON.stringify({ alg, typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  const signer = crypto.createSign('SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(env.AP2_SIGNING_PRIVATE_KEY_PEM as string);
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

// Detached signature over the checkout hash + session/nonce.
// Returns a JWT containing checkout_hash and session metadata.
export function signCheckoutHash(checkoutHash: string, sessionId: string, nonce: string): string {
  const iat = nowSeconds();
  const exp = iat + parseMaxAge();
  return signJwt({ checkout_hash: checkoutHash, session_id: sessionId, nonce, iat, exp });
}

// Best-effort helper for non-JWT mandate shapes (object/hash only).
// Used for backward compatibility with non-JWT mandate payloads.
export function extractCheckoutHash(mandate: unknown): string | undefined {
  if (!mandate) return undefined;
  if (typeof mandate === 'object') {
    const obj = mandate as any;
    return obj.checkout_hash ?? obj.checkoutHash;
  }
  if (typeof mandate === 'string') {
    const parts = mandate.split('.');
    if (parts.length === 3) {
      try {
        const payload = JSON.parse(base64UrlDecode(parts[1]));
        return payload.checkout_hash ?? payload.checkoutHash;
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

// Decodes a JWT into header/payload/inputs for verification.
function decodeJwt(input: string): { header: any; payload: any; signingInput: string; signature: Buffer } {
  const parts = input.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format.');
  const header = JSON.parse(base64UrlDecode(parts[0]));
  const payload = JSON.parse(base64UrlDecode(parts[1]));
  const signingInput = `${parts[0]}.${parts[1]}`;
  const signature = Buffer.from(
    parts[2].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parts[2].length / 4) * 4, '='),
    'base64'
  );
  return { header, payload, signingInput, signature };
}

// Signature verification for JWT mandates.
// Uses Node's crypto verifier with provided public key and allowed alg list.
function verifyJwtSignature(jwt: string, publicKeyPem: string, allowed: string[]): any {
  const decoded = decodeJwt(jwt);
  const alg = String(decoded.header?.alg || '').toUpperCase();
  if (!allowed.includes(alg)) {
    throw new Error(`Unsupported JWT alg: ${alg}`);
  }
  const verifier = crypto.createVerify('SHA256');
  verifier.update(decoded.signingInput);
  verifier.end();
  const ok = verifier.verify(publicKeyPem, decoded.signature);
  if (!ok) throw new Error('JWT signature verification failed.');
  return decoded.payload;
}

// Validates temporal/issuer/audience constraints for mandates.
// Enforces clock skew tolerance and expected issuer/audience if configured.
function validateClaims(payload: any): void {
  const skew = parseClockSkew();
  const now = nowSeconds();
  if (typeof payload?.exp === 'number' && now > payload.exp + skew) {
    throw new Error('JWT has expired.');
  }
  if (typeof payload?.nbf === 'number' && now + skew < payload.nbf) {
    throw new Error('JWT not yet valid.');
  }
  if (typeof payload?.iat === 'number' && now + skew < payload.iat) {
    throw new Error('JWT issued in the future.');
  }
  if (env.AP2_ISSUER && payload?.iss !== env.AP2_ISSUER) {
    throw new Error('JWT issuer mismatch.');
  }
  if (env.AP2_AUDIENCE) {
    const aud = payload?.aud;
    if (Array.isArray(aud)) {
      if (!aud.includes(env.AP2_AUDIENCE)) throw new Error('JWT audience mismatch.');
    } else if (aud !== env.AP2_AUDIENCE) {
      throw new Error('JWT audience mismatch.');
    }
  }
}

// Verifies the platform-signed checkout mandate and ensures it matches current state.
export function verifyCheckoutMandate(
  mandate: unknown,
  expectedHash: string,
  sessionId: string,
  nonce: string
): void {
  // Platform-issued CheckoutMandate must match state hash and session nonce.
  if (typeof mandate !== 'string') {
    throw new Error('checkout_mandate must be a JWT.');
  }
  const publicKey = env.AP2_PLATFORM_PUBLIC_KEY_PEM;
  if (!publicKey) {
    throw new Error('AP2_PLATFORM_PUBLIC_KEY_PEM is required for mandate verification.');
  }
  const payload = verifyJwtSignature(
    mandate,
    publicKey,
    algList(env.AP2_PLATFORM_SIGNING_ALG, env.AP2_SIGNING_ALG)
  );
  validateClaims(payload);
  if (payload?.checkout_hash !== expectedHash) {
    throw new Error('checkout_mandate hash does not match current checkout state.');
  }
  if (payload?.session_id !== sessionId) {
    throw new Error('checkout_mandate session_id mismatch.');
  }
  if (payload?.nonce !== nonce) {
    throw new Error('checkout_mandate nonce mismatch.');
  }
}

// Verifies the payment processor mandate using configured public key and algs.
export function verifyPaymentMandate(mandate: unknown): void {
  // Payment processor-issued mandate verification (fail-closed).
  if (typeof mandate !== 'string') {
    throw new Error('payment_mandate must be a JWT.');
  }
  const publicKey = env.AP2_PAYMENT_PUBLIC_KEY_PEM;
  if (!publicKey) {
    throw new Error('AP2_PAYMENT_PUBLIC_KEY_PEM is required for payment mandate verification.');
  }
  const payload = verifyJwtSignature(
    mandate,
    publicKey,
    algList(env.AP2_PAYMENT_SIGNING_ALG, env.AP2_SIGNING_ALG)
  );
  validateClaims(payload);
}
