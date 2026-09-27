// Browser replacement for server/lib/passwords.js. Same scrypt settings as the PC version
// (N=16384, r=8, p=1, 64-byte hash) so accounts move between the phone and the PC in backups.
// Hashes from older preview builds (32-byte, N=4096) are still accepted.
const { scrypt } = require('@noble/hashes/scrypt.js');
const { bytesToHex, hexToBytes } = require('@noble/hashes/utils.js');
const OPTS = { N: 2 ** 14, r: 8, p: 1, dkLen: 64 };
const LEGACY = { N: 2 ** 12, r: 8, p: 1, dkLen: 32 };

function hashPassword(plain) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return `scrypt:${bytesToHex(salt)}:${bytesToHex(scrypt(String(plain), salt, OPTS))}`;
}
function verifyPassword(plain, stored) {
  if (!stored || !stored.startsWith('scrypt:')) return false;
  const [, saltHex, hashHex] = stored.split(':');
  const b = hexToBytes(hashHex);
  const a = scrypt(String(plain), hexToBytes(saltHex), b.length === 32 ? LEGACY : OPTS);
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
module.exports = { hashPassword, verifyPassword };
