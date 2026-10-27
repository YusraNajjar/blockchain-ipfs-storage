// Off-chain security tests (T1, T2, T3, T8) using Node's built-in test runner.
const test = require("node:test");
const assert = require("node:assert/strict");
const { encrypt, decrypt } = require("../scripts/lib/aes");

const plain = Buffer.from("confidential record 0123456789".repeat(100));

test("round trip returns the original file", async () => {
  const { key, blob } = await encrypt(plain);
  assert.deepEqual(await decrypt(key, blob), plain);
});

test("T1: a flipped ciphertext bit is rejected", async () => {
  const { key, blob } = await encrypt(plain);
  const bad = Buffer.from(blob);
  bad[20] ^= 1;
  await assert.rejects(decrypt(key, bad));
});

test("T2: a truncated ciphertext is rejected", async () => {
  const { key, blob } = await encrypt(plain);
  await assert.rejects(decrypt(key, blob.subarray(0, blob.length - 5)));
});

test("T3: another file's ciphertext cannot be substituted", async () => {
  const a = await encrypt(plain);
  const b = await encrypt(Buffer.from("a different file".repeat(100)));
  await assert.rejects(decrypt(a.key, b.blob));
});

test("T8: a wrong key is rejected", async () => {
  const a = await encrypt(plain);
  const b = await encrypt(plain);
  await assert.rejects(decrypt(b.key, a.blob));
});

test("each encryption uses a fresh nonce and key", async () => {
  const a = await encrypt(plain);
  const b = await encrypt(plain);
  assert.notDeepEqual(a.blob.subarray(0, 12), b.blob.subarray(0, 12));
  assert.notDeepEqual(a.blob, b.blob);
});

test("ciphertext length is file length plus 28 bytes", async () => {
  const { blob } = await encrypt(plain);
  assert.equal(blob.length, plain.length + 12 + 16);
});
