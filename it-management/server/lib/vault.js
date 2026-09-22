// AES-256-GCM encryption for stored secrets (credential & Wi-Fi passwords).
// Ciphertext format: v1:<iv b64>:<auth tag b64>:<data b64>
// Production: set ITMS_VAULT_KEY (64 hex chars) from a secrets manager / KMS.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config');

let key;

function loadKey() {
  if (key) return key;
  if (config.VAULT_KEY) {
    key = Buffer.from(config.VAULT_KEY, 'hex');
  } else if (fs.existsSync(config.VAULT_KEY_FILE)) {
    key = Buffer.from(fs.readFileSync(config.VAULT_KEY_FILE, 'utf8').trim(), 'hex');
  } else {
    fs.mkdirSync(path.dirname(config.VAULT_KEY_FILE), { recursive: true });
    key = crypto.randomBytes(32);
    fs.writeFileSync(config.VAULT_KEY_FILE, key.toString('hex'), { mode: 0o600 });
  }
  if (key.length !== 32) throw new Error('Vault key must be 32 bytes (64 hex characters)');
  return key;
}

function encrypt(plain) {
  if (plain === null || plain === undefined || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', loadKey(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

function decrypt(blob) {
  if (!blob) return '';
  const [v, iv, tag, data] = blob.split(':');
  if (v !== 'v1') throw new Error('Unknown ciphertext version');
  const decipher = crypto.createDecipheriv('aes-256-gcm', loadKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
