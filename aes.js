// AES-256-GCM helpers shared by the benchmark and the off-chain tests.
const { webcrypto } = require('crypto');

const subtle = webcrypto.subtle;

async function sha256(buf) {
  return Buffer.from(await subtle.digest('SHA-256', buf)).toString('hex');
}

// Fresh key and nonce per call; the nonce is prepended to the ciphertext.
async function encrypt(plain) {
  const key = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ct = Buffer.from(await subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  return { key, blob: Buffer.concat([Buffer.from(iv), ct]) };
}

// Rejects if the key is wrong or the ciphertext was modified.
async function decrypt(key, blob) {
  const iv = blob.subarray(0, 12);
  return Buffer.from(await subtle.decrypt({ name: 'AES-GCM', iv }, key, blob.subarray(12)));
}

module.exports = { sha256, encrypt, decrypt };
