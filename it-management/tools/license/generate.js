#!/usr/bin/env node
// Make a license key for a customer (software owner only — needs tools/license/private-key.txt).
//   node tools/license/generate.js --company "Acme Trading" --days 365
//   node tools/license/generate.js --company "Acme Trading" --expires 2027-12-31
const fs = require('fs');
const path = require('path');
const { makeKey } = require('./sign');

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const keyFile = arg('key') || path.join(__dirname, 'private-key.txt');
if (!fs.existsSync(keyFile)) { console.error(`Private key not found: ${keyFile}`); process.exit(1); }
const company = arg('company');
let expires = arg('expires');
if (!expires && arg('days')) { const d = new Date(Date.now() + Number(arg('days')) * 86400000); expires = d.toISOString().slice(0, 10); }
if (!company || !expires) { console.error('Usage: generate.js --company "Name" (--days 365 | --expires YYYY-MM-DD)'); process.exit(1); }
const key = makeKey(fs.readFileSync(keyFile, 'utf8'), { company, expires });
console.log(`Licensed to: ${company}\nValid until: ${expires}\n\n${key}`);
