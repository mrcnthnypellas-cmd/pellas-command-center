// Bundles the prototype into self-contained HTML files (no network needed):
//   dist/index.html     full document — browsers and the Android WebView shell
//   dist/artifact.html  body-only variant for publishing as a hosted preview
import { build, context } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const r = (p) => resolve(root, p);
const watch = process.argv.includes('--watch');

const FONTS = [
  ['Syncopate', 700, '@fontsource/syncopate/files/syncopate-latin-700-normal.woff2'],
  ['IBM Plex Sans', 400, '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2'],
  ['IBM Plex Sans', 500, '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2'],
  ['IBM Plex Sans', 600, '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2'],
  ['IBM Plex Mono', 400, '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2'],
  ['IBM Plex Mono', 500, '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2'],
];

function fontCss() {
  return FONTS.map(([family, weight, file]) => {
    const b64 = readFileSync(r(`node_modules/${file}`)).toString('base64');
    return `@font-face{font-family:"${family}";font-weight:${weight};font-style:normal;font-display:swap;src:url(data:font/woff2;base64,${b64}) format("woff2")}`;
  }).join('\n');
}

const buildOptions = {
  entryPoints: [r('src/main.js')],
  bundle: true, minify: true, format: 'iife', target: ['es2020', 'chrome90', 'safari15'],
  write: false, legalComments: 'none', logLevel: 'warning',
};

function emit(js) {
  const css = `${fontCss()}\n${readFileSync(r('src/styles.css'), 'utf8')}`;
  const markup = readFileSync(r('src/app.html'), 'utf8');
  const safeJs = js.replace(/<\/script/gi, '<\\/script');
  const head = `<title>George Universal Sunbox</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<style>\n${css}\n</style>`;
  const body = `${markup}\n<script>\n${safeJs}\n</script>`;
  mkdirSync(r('dist'), { recursive: true });
  writeFileSync(r('dist/index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="theme-color" content="#03050c">
${head}
</head>
<body>
${body}
</body>
</html>
`);
  writeFileSync(r('dist/artifact.html'), `${head}\n${body}\n`);
  const kb = (Buffer.byteLength(js) / 1024).toFixed(0);
  console.log(`built dist/index.html and dist/artifact.html (script ${kb} KB)`);
}

if (watch) {
  const ctx = await context({ ...buildOptions, plugins: [{ name: 'emit', setup(b) { b.onEnd((res) => res.outputFiles && emit(res.outputFiles[0].text)); } }] });
  await ctx.watch();
  console.log('watching src/ for changes…');
} else {
  const res = await build(buildOptions);
  emit(res.outputFiles[0].text);
}
