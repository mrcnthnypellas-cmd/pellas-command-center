// Builds tools/license/dist/license-generator.html (one offline file for the software owner).
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const pub = require('../../server/lib/licenseKey').publicKeyHex;

(async () => {
  const js = (await esbuild.build({ entryPoints: [path.join(__dirname, 'generator.js')], bundle: true, format: 'iife', minify: true, write: false, target: ['es2020'], logLevel: 'warning' })).outputFiles[0].text.replace('__PUBLIC_KEY__', pub);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>License Generator · Pellas IT Command</title>
<style>
:root { --bg:#f5f7fb; --card:#fff; --text:#0f172a; --muted:#64748b; --border:#e2e8f0; --primary:#2563eb; --ok:#15803d; --bad:#b91c1c; color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { --bg:#0b1120; --card:#111827; --text:#e5e7eb; --muted:#94a3b8; --border:#1f2a3d; --primary:#60a5fa; --ok:#4ade80; --bad:#f87171; } }
* { box-sizing: border-box; } body { margin:0; background:var(--bg); color:var(--text); font:15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 760px; margin: 0 auto; padding: 24px 16px 48px; } h1 { font-size: 22px; margin: 0 0 4px; } h2 { font-size: 15px; margin: 0 0 12px; }
section { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 18px; margin-top: 16px; }
label { display:block; font-weight: 600; font-size: 13px; margin: 12px 0 6px; } .muted { color: var(--muted); font-size: 13px; }
input, textarea { width: 100%; font: inherit; padding: 9px 11px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--text); }
textarea { font-family: ui-monospace, Consolas, monospace; font-size: 12.5px; word-break: break-all; }
button { font: inherit; font-weight: 600; padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border); background: var(--card); color: var(--text); cursor: pointer; }
button.primary { background: var(--primary); border-color: var(--primary); color: #fff; } button:disabled { opacity: .5; cursor: not-allowed; }
.row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; } .state { margin-top: 10px; font-weight: 600; font-size: 13.5px; } .ok { color: var(--ok); } .bad, #err { color: var(--bad); }
table { width: 100%; border-collapse: collapse; font-size: 13px; } th, td { text-align: left; padding: 7px 6px; border-bottom: 1px solid var(--border); } .mono { font-family: ui-monospace, Consolas, monospace; }
.warn { background: #fef3c7; color: #78350f; border-radius: 8px; padding: 10px 12px; font-size: 13px; margin-top: 12px; } @media (prefers-color-scheme: dark) { .warn { background:#2d2410; color:#fde68a; } }
.table-wrap { overflow-x: auto; }
.lifetime { display: flex; gap: 8px; align-items: center; font-weight: 400; font-size: 14px; margin-top: 12px; } .lifetime input { width: auto; }
</style></head><body><main>
<h1>License Generator</h1><p class="muted" style="margin:0">Make license keys for Pellas IT Command. Works offline; nothing is sent anywhere.</p>
<section><h2>1 · Load your private key</h2>
<p class="muted" style="margin:0">Choose the <b>private-key.txt</b> file (or paste its text). Keep that file secret: anyone who has it can make keys.</p>
<label for="key-file">Private key file</label><input id="key-file" type="file" accept=".txt,text/plain">
<label for="key-text">…or paste it</label><input id="key-text" type="password" autocomplete="off" placeholder="64 characters">
<div id="key-state" class="state muted">No private key loaded.</div></section>
<form id="form" novalidate><section><h2>2 · Customer and expiry</h2>
<label for="company">Customer / company name</label><input id="company" maxlength="80" placeholder="e.g. Acme Trading">
<label for="expires">Valid until (last day it works)</label><input id="expires" type="date">
<label class="lifetime"><input id="lifetime" type="checkbox"> <span><b>Lifetime license</b> (never expires)</span></label>
<div class="row"><button type="button" data-months="1">1 month</button><button type="button" data-months="6">6 months</button><button type="button" data-years="1">1 year</button><button type="button" data-years="2">2 years</button><button type="button" data-years="3">3 years</button></div>
<p id="err"></p><button id="make" class="primary" type="submit" disabled>Make license key</button></section></form>
<section id="result" hidden><h2>3 · Send this key to the customer</h2><p id="summary" class="muted" style="margin-top:0"></p>
<textarea id="out" rows="4" readonly></textarea><div class="row"><button id="copy" type="button" class="primary">Copy key</button></div>
<p class="warn">The customer pastes it in the setup screen, or in <b>Settings → License</b> to renew.</p></section>
<section><h2>Keys made on this computer</h2><div id="history" class="table-wrap"></div><div class="row"><button id="export" type="button">Export list (CSV)</button></div></section>
</main><script>${js.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
  const out = path.join(__dirname, 'dist', 'license-generator.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  console.log(`Built ${path.relative(process.cwd(), out)} (${Math.round(html.length / 1024)} KB)`);
})().catch((e) => { console.error(e); process.exit(1); });
