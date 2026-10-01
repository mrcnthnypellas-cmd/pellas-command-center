// Makes a license key with the owner's private Ed25519 key (hex, 32 bytes).
const crypto = require('crypto');

const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex'); // DER header for a raw Ed25519 private key
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function makeKey(privateKeyHex, { company, expires, issued = new Date().toISOString().slice(0, 10), id = crypto.randomBytes(4).toString('hex') }) {
  if (!company || !String(company).trim()) throw new Error('Company name is required');
  if (expires !== 'never' && !/^\d{4}-\d{2}-\d{2}$/.test(expires || '')) throw new Error('Expiry date must look like 2027-12-31, or "never" for a lifetime key');
  const payload = b64url(JSON.stringify({ c: String(company).trim(), e: expires, i: issued, n: id }));
  const priv = crypto.createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, Buffer.from(privateKeyHex.trim(), 'hex')]), format: 'der', type: 'pkcs8' });
  const sig = crypto.sign(null, Buffer.from(`ITMS1.${payload}`), priv);
  return `ITMS1.${payload}.${b64url(sig)}`;
}

function publicKeyHex(privateKeyHex) {
  const priv = crypto.createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, Buffer.from(privateKeyHex.trim(), 'hex')]), format: 'der', type: 'pkcs8' });
  return crypto.createPublicKey(priv).export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');
}

module.exports = { makeKey, publicKeyHex };
