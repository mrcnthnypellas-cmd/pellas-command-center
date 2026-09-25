// `npm run build:demo` → demo/dist/it-manager.html: the whole app in one self-contained page
// (frontend + real route code + SQLite compiled to JavaScript), for sharing as a browser preview.
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const SHIMS = path.join(__dirname, 'shims');
const OUT = path.join(__dirname, 'dist');

// Node-only modules → browser stand-ins.
const PACKAGE_SHIMS = { fs: 'fs.js', path: 'path.js', crypto: 'crypto.js', express: 'express.js', multer: 'multer.js', 'cookie-parser': 'cookie-parser.js', exceljs: 'exceljs.js' };
const FILE_SHIMS = {
  [path.join(ROOT, 'server/db/connection.js')]: 'connection.js',
  [path.join(ROOT, 'server/lib/vault.js')]: 'vault.js',
  [path.join(ROOT, 'server/lib/passwords.js')]: 'passwords.js',
  [path.join(ROOT, 'server/lib/pdf.js')]: 'pdf.js',
  [path.join(ROOT, 'server/lib/labelsPdf.js')]: 'pdf.js',
};

const shimPlugin = {
  name: 'browser-shims',
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      const bare = args.path.replace(/^node:/, '');
      if (PACKAGE_SHIMS[bare]) return { path: path.join(SHIMS, PACKAGE_SHIMS[bare]) };
      if (args.path.startsWith('.') && args.importer && !args.importer.startsWith(SHIMS)) {
        let abs = path.resolve(path.dirname(args.importer), args.path);
        if (!abs.endsWith('.js') && !abs.endsWith('.sql')) abs += '.js';
        if (FILE_SHIMS[abs]) return { path: path.join(SHIMS, FILE_SHIMS[abs]) };
      }
      return undefined;
    });
  },
};

(async () => {
  const result = await esbuild.build({
    entryPoints: [path.join(__dirname, 'client.js')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    minify: true,
    write: false,
    legalComments: 'none',
    loader: { '.sql': 'text' },
    define: { 'process.env': '{}', __dirname: '"/app/server"', 'process.platform': '"browser"' },
    plugins: [shimPlugin],
    logLevel: 'warning',
  });
  const js = result.outputFiles[0].text;
  const css = fs.readFileSync(path.join(ROOT, 'public/css/app.css'), 'utf8');
  const chart = fs.readFileSync(path.join(ROOT, 'node_modules/chart.js/dist/chart.umd.min.js'), 'utf8');
  const safe = (s) => s.replace(/<\/script/gi, '<\\/script');

  const html = `<title>Pellas IT Command</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">
<style>
${css}
/* Browser-preview additions */
#demo-bar { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; justify-content: space-between; padding-block: 7px; padding-inline: 16px;
  background: var(--primary-soft); color: var(--text-2); border-bottom: 1px solid var(--border); font-size: 12.5px; }
#demo-bar b { color: var(--text); }
[data-print] { display: none !important; }
</style>
<div id="app"><div class="boot">Loading the IT management system…</div></div>
<div id="modal-root"></div>
<div id="toasts"></div>
<script>${safe(chart)}</script>
<script>${safe(js)}</script>
`;
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, 'it-manager.html');
  fs.writeFileSync(file, html);
  console.log(`Built ${path.relative(ROOT, file)} (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
})().catch((e) => { console.error(e); process.exit(1); });
