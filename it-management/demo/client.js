// Browser preview entry: starts the in-page server, routes /api calls to it, then boots the real app.
import server from './server.js';

const ready = server.init();
const realFetch = window.fetch.bind(window);
const isLocal = (url) => typeof url === 'string' && (url.startsWith('/api/') || url.startsWith('/uploads/'));

async function toRequest(url, init = {}) {
  let body; let files;
  if (init.body instanceof FormData) {
    body = {}; files = {};
    for (const [k, v] of init.body.entries()) {
      if (v instanceof File) files[k] = { name: v.name, type: v.type, size: v.size, bytes: new Uint8Array(await v.arrayBuffer()) };
      else body[k] = v;
    }
  } else if (typeof init.body === 'string') {
    try { body = JSON.parse(init.body); } catch { body = {}; }
  }
  return { method: (init.method || 'GET').toUpperCase(), url, body, files };
}

async function call(url, init) {
  await ready;
  return server.request(await toRequest(url, init));
}

window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  if (!isLocal(url)) return realFetch(input, init);
  const r = await call(url, init);
  return new Response(r.body, { status: r.status, headers: r.headers });
};

// Images served by the API (QR codes, photos) → blob URLs.
const blobFor = new Map();
async function hydrateImg(img) {
  const src = img.getAttribute('src');
  if (!isLocal(src)) return;
  img.setAttribute('src', 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==');
  const key = src.replace(/[?&]origin=[^&]*/, '');
  if (!blobFor.has(key)) {
    blobFor.set(key, call(src).then((r) => (r.status < 300 ? URL.createObjectURL(new Blob([r.body], { type: r.headers['content-type'] })) : null)));
  }
  const url = await blobFor.get(key);
  if (url) img.src = url;
}
// Lets pages ask for a blob URL up front instead of rendering a blocked /api URL first.
window.itmsResolveImage = async (src) => {
  const key = src.replace(/[?&]origin=[^&]*/, '');
  if (!blobFor.has(key)) blobFor.set(key, call(src).then((r) => (r.status < 300 ? URL.createObjectURL(new Blob([r.body], { type: r.headers['content-type'] })) : null)));
  return (await blobFor.get(key)) || '';
};
new MutationObserver((muts) => {
  for (const m of muts) for (const n of m.addedNodes) {
    if (n.nodeType !== 1) continue;
    if (n.tagName === 'IMG') hydrateImg(n);
    n.querySelectorAll?.('img').forEach(hydrateImg);
  }
}).observe(document.documentElement, { childList: true, subtree: true });

// Downloads and printing are blocked in the preview frame → show exports on screen instead.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function showDialog(title, html) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal lg"><div class="modal-head"><h3>${esc(title)}</h3><button type="button" class="icon-btn" data-x aria-label="Close">✕</button></div><div class="modal-body">${html}</div></div>`;
  const close = () => wrap.remove();
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  wrap.querySelector('[data-x]').addEventListener('click', close);
  document.getElementById('modal-root').appendChild(wrap);
  return wrap;
}
document.addEventListener('click', async (e) => {
  const a = e.target.closest('a[href^="/api/"]');
  if (!a) return;
  e.preventDefault();
  const href = a.getAttribute('href');
  const r = await call(href);
  if (r.status >= 400) {
    let msg = 'This file could not be opened.';
    try { msg = JSON.parse(r.body).error; } catch { /* keep default */ }
    showDialog('Not available in the preview', `<p>${esc(msg)}</p>`);
    return;
  }
  const type = r.headers['content-type'] || '';
  if (type.startsWith('text/csv')) {
    const text = String(r.body).replace(/^﻿/, '');
    const box = showDialog('CSV export', `<p class="muted" style="margin-top:0">File downloads are blocked in this preview. Copy the CSV and paste it into Excel or Google Sheets. In the local version this button downloads a .csv file.</p>
      <textarea id="demo-csv" readonly style="width:100%;height:320px;font:12px/1.4 var(--font-mono);border:1px solid var(--border-strong);border-radius:8px;padding:8px;background:var(--surface-2);color:var(--text)">${esc(text)}</textarea>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px"><button class="btn primary" type="button" data-copy>Copy CSV</button></div>`);
    box.querySelector('[data-copy]').addEventListener('click', async (ev) => {
      const ta = box.querySelector('textarea');
      try { await navigator.clipboard.writeText(ta.value); ev.target.textContent = 'Copied'; } catch { ta.focus(); ta.select(); ev.target.textContent = 'Press Ctrl/⌘+C'; }
    });
  } else if (type.startsWith('image/')) {
    const url = URL.createObjectURL(new Blob([r.body], { type }));
    showDialog(a.textContent.trim() || 'Image', `<img src="${url}" alt="" style="max-width:100%;border-radius:8px">`);
  } else {
    showDialog('Download blocked in the preview', '<p>This file is stored with the record, but the preview frame cannot save files to your computer. Run the local version (<code>npm start</code>) to download it.</p>');
  }
}, true);

// Banner explaining what this build is.
const bar = document.createElement('div');
bar.id = 'demo-bar';
bar.innerHTML = `<span><b>Browser preview.</b> Runs entirely in this page with sample data. Your changes are saved only in this browser.</span>
  <span class="demo-actions"><button type="button" class="btn xs" data-demo-reset>Reset sample data</button></span>`;
document.body.prepend(bar);
bar.querySelector('[data-demo-reset]').addEventListener('click', () => {
  const box = showDialog('Reset sample data?', `<p>This discards every change made in this browser and reloads the original sample data. You'll be signed in as <b>admin</b>.</p>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn ghost" type="button" data-no>Cancel</button><button class="btn danger" type="button" data-yes>Reset</button></div>`);
  box.querySelector('[data-no]').addEventListener('click', () => box.remove());
  box.querySelector('[data-yes]').addEventListener('click', async () => {
    await server.resetData();
    box.remove();
    blobFor.clear();
    location.hash = '#/dashboard';
    location.reload();
  });
});

ready.then(() => import('../public/js/app.js')).catch((e) => {
  document.getElementById('app').innerHTML = `<div class="boot">Could not start the preview: ${esc(e.message)}</div>`;
});
