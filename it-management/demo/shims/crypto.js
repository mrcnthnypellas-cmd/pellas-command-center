// The two Node crypto calls used by auth/util: randomBytes().toString('hex') and sha256 hex digests.
const { sha256 } = require('@noble/hashes/sha2.js');
const { bytesToHex, utf8ToBytes } = require('@noble/hashes/utils.js');

function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return { bytes: b, length: n, toString: () => bytesToHex(b) };
}
function createHash() {
  let data = '';
  return { update(s) { data += s; return this; }, digest: () => bytesToHex(sha256(utf8ToBytes(data))) };
}
module.exports = { randomBytes, createHash };
