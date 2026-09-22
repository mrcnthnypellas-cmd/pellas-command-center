// Browser replacement for server/lib/passwords.js (scrypt via @noble/hashes, lighter cost for the preview).
const { scrypt } = require('@noble/hashes/scrypt.js');
const { bytesToHex, hexToBytes } = require('@noble/hashes/utils.js');
const OPTS = { N: 2 ** 12, r: 8, p: 1, dkLen: 32 };

function hashPassword(plain) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return `scrypt:${bytesToHex(salt)}:${bytesToHex(scrypt(String(plain), salt, OPTS))}`;
}
function verifyPassword(plain, stored) {
  if (!stored || !stored.startsWith('scrypt:')) return false;
  const [, saltHex, hashHex] = stored.split(':');
  const a = scrypt(String(plain), hexToBytes(saltHex), OPTS);
  const b = hexToBytes(hashHex);
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
module.exports = { hashPassword, verifyPassword };
