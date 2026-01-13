// Node's crypto module signs JWT payloads for mock mandates.
import crypto from 'crypto';

function base64UrlEncode(input) {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function signJwt(payload, privateKeyPem) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  const signer = crypto.createSign('SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKeyPem);
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

export function decodeJwtPayload(jwt) {
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
  const json = Buffer.from(padded, 'base64').toString('utf8');
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
