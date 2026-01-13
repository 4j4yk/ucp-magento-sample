#!/usr/bin/env node
// Node's fs module writes generated keys to disk.
import fs from 'fs';
// Node's crypto module generates RSA keypairs.
import crypto from 'crypto';

const outDir = '.tmp';
fs.mkdirSync(outDir, { recursive: true });

function writePair(prefix) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  fs.writeFileSync(`${outDir}/${prefix}-private.pem`, privateKey, 'utf8');
  fs.writeFileSync(`${outDir}/${prefix}-public.pem`, publicKey, 'utf8');
}

writePair('ap2-signing');
writePair('ap2-platform');
writePair('ap2-payment');

console.log('Generated AP2 mock keys in .tmp/');
