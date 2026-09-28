// Checks license key signatures (Ed25519). Only the PUBLIC key is here; the private key that
// makes keys stays with the software owner (tools/license/, never committed).
// The phone app / browser preview uses demo/shims/licenseKey.js (same check in plain JavaScript).
const crypto = require('crypto');

const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex'); // DER header for a raw Ed25519 public key

const key = {
  publicKeyHex: '63d2372112805189c8024bd78a1a47c93b2a14a23b54122cfd2bff87ac89b18d',
  verify(message, signature) {
    try {
      const pub = crypto.createPublicKey({ key: Buffer.concat([SPKI_PREFIX, Buffer.from(key.publicKeyHex, 'hex')]), format: 'der', type: 'spki' });
      return crypto.verify(null, Buffer.from(message), pub, Buffer.from(signature));
    } catch { return false; }
  },
};
module.exports = key;
