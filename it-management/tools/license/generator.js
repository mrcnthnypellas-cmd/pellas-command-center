// License Generator page (software owner only). Runs offline in the browser: load the private key
// file, enter the customer and the expiry date, and copy the key. Keys never leave this page.
import { ed25519 } from '@noble/curves/ed25519.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const b64url = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const hexToBytes = (h) => Uint8Array.from(h.match(/.{2}/g).map((x) => parseInt(x, 16)));
const bytesToHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const PUBLIC_KEY = '__PUBLIC_KEY__'; // the app's public key, to check that the right private key was loaded

let secret = null;
const HISTORY = 'itms-license-history';
const history = () => { try { return JSON.parse(localStorage.getItem(HISTORY) || '[]'); } catch { return []; } };
const saveHistory = (h) => { try { localStorage.setItem(HISTORY, JSON.stringify(h)); } catch { /* ignore */ } };

function setKey(text) {
  const hex = String(text).trim().toLowerCase();
  const msg = $('#key-state');
  if (!/^[0-9a-f]{64}$/.test(hex)) { secret = null; msg.className = 'state bad'; msg.textContent = 'That is not the private key file (private-key.txt).'; return; }
  const pub = bytesToHex(ed25519.getPublicKey(hexToBytes(hex)));
  if (pub !== PUBLIC_KEY) { secret = null; msg.className = 'state bad'; msg.textContent = 'This private key does not belong to this version of the app.'; return; }
  secret = hexToBytes(hex);
  msg.className = 'state ok'; msg.textContent = 'Private key loaded. You can make keys now.';
  $('#make').disabled = false;
}

function makeKey(company, expires) {
  const id = bytesToHex(crypto.getRandomValues(new Uint8Array(4)));
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ c: company, e: expires, i: ymd(new Date()), n: id })));
  const sig = ed25519.sign(new TextEncoder().encode(`ITMS1.${payload}`), secret);
  return { key: `ITMS1.${payload}.${b64url(sig)}`, id };
}

function renderHistory() {
  const h = history();
  $('#history').innerHTML = h.length ? `<table><thead><tr><th>Made</th><th>Customer</th><th>Valid until</th><th>Key ID</th><th></th></tr></thead><tbody>${h.map((r, i) => `<tr><td>${esc(r.made)}</td><td>${esc(r.company)}</td><td>${r.expires === 'never' ? 'Lifetime' : esc(r.expires)}</td><td class="mono">${esc(r.id)}</td><td><button type="button" data-copy="${i}">Copy key</button></td></tr>`).join('')}</tbody></table>`
    : '<p class="muted">Keys you make appear here (saved in this browser only).</p>';
}

$('#key-file').addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) setKey(await f.text()); });
$('#key-text').addEventListener('input', (e) => { if (e.target.value.trim().length >= 64) setKey(e.target.value); });
$('#lifetime').addEventListener('change', (e) => { $('#expires').disabled = e.target.checked; document.querySelectorAll('[data-years],[data-months]').forEach((b) => { b.disabled = e.target.checked; }); });
document.querySelectorAll('[data-years]').forEach((b) => b.addEventListener('click', () => {
  const d = new Date(); d.setFullYear(d.getFullYear() + Number(b.dataset.years)); d.setDate(d.getDate() - 1); $('#expires').value = ymd(d);
}));
document.querySelectorAll('[data-months]').forEach((b) => b.addEventListener('click', () => {
  const d = new Date(); d.setMonth(d.getMonth() + Number(b.dataset.months)); d.setDate(d.getDate() - 1); $('#expires').value = ymd(d);
}));
$('#form').addEventListener('submit', (e) => {
  e.preventDefault();
  const company = $('#company').value.trim(); const expires = $('#lifetime').checked ? 'never' : $('#expires').value;
  const err = $('#err'); err.textContent = '';
  if (!secret) { err.textContent = 'Load the private key first.'; return; }
  if (!company) { err.textContent = 'Enter the customer / company name.'; return; }
  if (expires !== 'never' && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) { err.textContent = 'Choose the last valid date, or tick Lifetime.'; return; }
  if (expires !== 'never' && expires < ymd(new Date())) { err.textContent = 'That date is already in the past.'; return; }
  const { key, id } = makeKey(company, expires);
  $('#out').value = key; $('#result').hidden = false;
  $('#summary').innerHTML = `Licensed to <b>${esc(company)}</b>, ${expires === 'never' ? '<b>lifetime (never expires)</b>' : `valid until <b>${esc(expires)}</b>`}. Key ID ${esc(id)}.`;
  const h = history(); h.unshift({ made: ymd(new Date()), company, expires, id, key }); saveHistory(h.slice(0, 500)); renderHistory();
});
$('#copy').addEventListener('click', async () => { $('#out').select(); try { await navigator.clipboard.writeText($('#out').value); $('#copy').textContent = 'Copied'; } catch { document.execCommand('copy'); $('#copy').textContent = 'Copied'; } setTimeout(() => { $('#copy').textContent = 'Copy key'; }, 1500); });
$('#history').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]'); if (!b) return;
  const k = history()[Number(b.dataset.copy)].key;
  try { await navigator.clipboard.writeText(k); b.textContent = 'Copied'; } catch { $('#out').value = k; $('#result').hidden = false; }
});
$('#export').addEventListener('click', () => {
  const rows = [['Made', 'Customer', 'Valid until', 'Key ID', 'Key'], ...history().map((r) => [r.made, r.company, r.expires === 'never' ? 'Lifetime' : r.expires, r.id, r.key])];
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'license-keys.csv'; a.click();
});
renderHistory();
