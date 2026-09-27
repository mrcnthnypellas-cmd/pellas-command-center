// Windows desktop app: runs the same server inside the app (this PC only) and shows it in its own window.
// Works on its own — no browser, no Node.js install, no network needed. Data: Documents\Pellas IT Command.
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');

const APP_NAME = 'Pellas IT Command';
app.setName(APP_NAME);
if (process.platform === 'win32') app.setAppUserModelId('com.pellas.itcommand');

if (!app.requestSingleInstanceLock()) { app.quit(); } else {
  let win = null;
  let baseUrl = null;
  const dataDir = path.join(app.getPath('documents'), APP_NAME, 'data');

  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

  // Fixed port so saved preferences (theme, filters) stay put between launches; next free one if taken.
  const PREFERRED_PORT = 4817;
  const freePort = (port) => new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(freePort(port + 1)));
    s.once('listening', () => s.close(() => resolve(port)));
    s.listen(port, '127.0.0.1');
  });

  async function startServer() {
    fs.mkdirSync(dataDir, { recursive: true });
    const port = await freePort(PREFERRED_PORT);
    process.env.ITMS_DATA_DIR = dataDir;
    process.env.HOST = '127.0.0.1';
    process.env.PORT = String(port);
    process.env.ITMS_SECURE_COOKIE = '0';
    const db = require('../server/db/connection');
    const { createApp } = require('../server/app');
    db.open();
    if (!db.get('SELECT 1 FROM users LIMIT 1')) require('../server/db/seed').seed();
    await new Promise((resolve, reject) => {
      const srv = createApp().listen(port, '127.0.0.1', resolve);
      srv.once('error', reject);
    });
    return `http://127.0.0.1:${port}`;
  }

  const isOwn = (url) => url.startsWith(`${baseUrl}/`) || url === baseUrl;

  function createWindow() {
    win = new BrowserWindow({
      width: 1440, height: 920, minWidth: 900, minHeight: 600, show: false,
      title: APP_NAME, backgroundColor: '#f5f7fb',
      icon: path.join(__dirname, 'icon.png'),
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true },
    });
    win.once('ready-to-show', () => { win.maximize(); win.show(); });
    // Print pages / QR labels open in their own app window; everything else (tel:, mailto:, web links) goes to the system.
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (isOwn(url)) return { action: 'allow', overrideBrowserWindowOptions: { width: 1000, height: 800, autoHideMenuBar: true, icon: path.join(__dirname, 'icon.png') } };
      if (/^(https?|mailto|tel):/i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (e, url) => {
      if (!isOwn(url)) { e.preventDefault(); if (/^(https?|mailto|tel):/i.test(url)) shell.openExternal(url); }
    });
    win.loadURL(baseUrl);
    win.on('closed', () => { win = null; });
  }

  function buildMenu() {
    const template = [
      { label: 'File', submenu: [
        { label: 'Open data folder', click: () => shell.openPath(dataDir) },
        { label: 'Backup && Restore…', click: () => win && win.loadURL(`${baseUrl}/#/settings?tab=backup`) },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' },
      ] },
      { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
      { label: 'View', submenu: [
        { role: 'reload' }, { type: 'separator' },
        { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }, { type: 'separator' },
        { role: 'togglefullscreen' }, { role: 'toggleDevTools', visible: false },
      ] },
      { label: 'Help', submenu: [
        { label: `About ${APP_NAME}`, click: () => dialog.showMessageBox(win, { type: 'info', title: APP_NAME, message: `${APP_NAME} ${app.getVersion()}`, detail: `IT asset, inventory and network management.\n\nYour data is saved on this PC in:\n${dataDir}\n\nMake regular backups from Settings → Backup & Restore.` }) },
      ] },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }

  app.whenReady().then(async () => {
    try {
      baseUrl = await startServer();
    } catch (err) {
      dialog.showErrorBox(APP_NAME, `The app could not start.\n\n${err && err.message}\n\nData folder: ${dataDir}`);
      app.quit();
      return;
    }
    buildMenu();
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
