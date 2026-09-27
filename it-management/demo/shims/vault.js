// Browser replacement for server/lib/vault.js — same AES-256-GCM format (v1:iv:tag:data).
// In the browser preview the key lives in this browser's storage next to the demo database.
const { gcm } = require('@noble/ciphers/aes.js');
const { utf8ToBytes, bytesToUtf8, hexToBytes, bytesToHex } = require('@noble/ciphers/utils.js');
const store = require('../store');

let key;
function loadKey() {
  if (key) return key;
  const saved = store.get('itms-demo-vault-key');
  if (saved) key = hexToBytes(saved);
  else {
    key = new Uint8Array(32);
    crypto.getRandomValues(key);
    store.set('itms-demo-vault-key', bytesToHex(key));
  }
  return key;
}
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function encrypt(plain) {
  if (plain === null || plain === undefined || plain === '') return null;
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const sealed = gcm(loadKey(), iv).encrypt(utf8ToBytes(String(plain)));
  return ['v1', b64(iv), b64(sealed.slice(-16)), b64(sealed.slice(0, -16))].join(':');
}
function decrypt(blob) {
  if (!blob) return '';
  const [v, iv, tag, data] = blob.split(':');
  if (v !== 'v1') throw new Error('Unknown ciphertext version');
  const sealed = new Uint8Array([...unb64(data), ...unb64(tag)]);
  return bytesToUtf8(gcm(loadKey(), unb64(iv)).decrypt(sealed));
}
// Same helpers as server/lib/vault.js, used by backup/restore to re-lock saved passwords.
function encryptWith(k, plain) {
  if (plain === null || plain === undefined || plain === '') return null;
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const sealed = gcm(k, iv).encrypt(utf8ToBytes(String(plain)));
  return ['v1', b64(iv), b64(sealed.slice(-16)), b64(sealed.slice(0, -16))].join(':');
}
function decryptWith(k, blob) {
  if (!blob) return '';
  const [v, iv, tag, data] = blob.split(':');
  if (v !== 'v1') throw new Error('Unknown ciphertext version');
  return bytesToUtf8(gcm(k, unb64(iv)).decrypt(new Uint8Array([...unb64(data), ...unb64(tag)])));
}
const keyHex = () => bytesToHex(loadKey());
module.exports = { encrypt, decrypt, encryptWith, decryptWith, keyHex, resetKey: () => { key = null; } };
