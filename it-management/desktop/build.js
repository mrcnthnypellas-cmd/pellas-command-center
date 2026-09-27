// Builds the Windows installer: stages the app (server + public + desktop shell + production
// dependencies) in .stage/, then packages it with electron-builder into ../dist-desktop/.
// Usage: npm run build            (Windows installer, x64)
//        node build.js --stage-only (just prepare .stage/, e.g. to run it with `electron .stage`)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const STAGE = path.join(__dirname, '.stage');
const OUT = path.join(ROOT, 'dist-desktop');
const rootPkg = require(path.join(ROOT, 'package.json'));
const electronVersion = require('electron/package.json').version;

fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(path.join(STAGE, 'desktop'), { recursive: true });
for (const dir of ['server', 'public']) fs.cpSync(path.join(ROOT, dir), path.join(STAGE, dir), { recursive: true });
for (const f of ['main.js', 'icon.png']) fs.copyFileSync(path.join(__dirname, f), path.join(STAGE, 'desktop', f));
fs.writeFileSync(path.join(STAGE, 'package.json'), JSON.stringify({
  name: 'pellas-it-command',
  productName: 'Pellas IT Command',
  version: rootPkg.version,
  description: 'IT Asset, Inventory & Network Management',
  author: 'Pellas',
  main: 'desktop/main.js',
  dependencies: rootPkg.dependencies,
  overrides: rootPkg.overrides,
}, null, 2));
fs.copyFileSync(path.join(ROOT, 'package-lock.json'), path.join(STAGE, 'package-lock.json'));
console.log('Installing production dependencies…');
execSync('npm install --omit=dev --ignore-scripts --no-audit --no-fund', { cwd: STAGE, stdio: 'inherit' });

if (process.argv.includes('--stage-only')) {
  // Local run on this machine: build the native SQLite module for this machine's Electron.
  // projectRootPath stops the rebuild from walking up into the main project's node_modules.
  require('@electron/rebuild').rebuild({ buildPath: STAGE, projectRootPath: STAGE, electronVersion, force: true })
    .then(() => console.log(`Staged in ${STAGE}`))
    .catch((e) => { console.error(e); process.exit(1); });
  return;
}

const builder = require('electron-builder');
builder.build({
  projectDir: STAGE,
  targets: builder.Platform.WINDOWS.createTarget(['nsis'], builder.Arch.x64),
  config: {
    appId: 'com.pellas.itcommand',
    productName: 'Pellas IT Command',
    electronVersion,
    directories: { output: OUT },
    files: ['**/*', '!**/*.md', '!**/test/**', '!**/tests/**'],
    asar: true,
    publish: null,
    npmRebuild: true,
    win: { icon: 'desktop/icon.png', signAndEditExecutable: process.env.ITMS_EDIT_EXE === '1' },
    nsis: {
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: 'Pellas IT Command',
      artifactName: 'Pellas-IT-Command-Setup-${version}.${ext}',
    },
  },
}).then((files) => console.log('Built:\n' + files.join('\n'))).catch((e) => { console.error(e); process.exit(1); });
