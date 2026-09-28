// Browser/phone version of server/lib/licenseKey.js: same Ed25519 check with @noble/curves.
const { ed25519 } = require('@noble/curves/ed25519.js');
const { hexToBytes } = require('@noble/hashes/utils.js');

const key = {
  publicKeyHex: '63d2372112805189c8024bd78a1a47c93b2a14a23b54122cfd2bff87ac89b18d',
  verify(message, signature) {
    try { return ed25519.verify(new Uint8Array(signature), new Uint8Array(message), hexToBytes(key.publicKeyHex)); } catch { return false; }
  },
};
module.exports = key;
