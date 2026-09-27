// Local entry point: `npm start` → http://localhost:4000
const config = require('./config');
const db = require('./db/connection');
const { createApp } = require('./app');

db.open();
const firstRun = require('./lib/setup').needsSetup();

createApp().listen(config.PORT, config.HOST, () => {
  const url = `http://${config.HOST === '0.0.0.0' ? 'localhost' : config.HOST}:${config.PORT}`;
  console.log(`\n  IT Management System running at ${url}`);
  if (firstRun) console.log('  First start: open the address above on this PC to set up the system (company name and your admin account).');
  console.log('');
  // START-SERVER.bat sets this so the browser opens only once the server is ready.
  if (process.env.ITMS_OPEN_BROWSER === '1') {
    const open = `http://127.0.0.1:${config.PORT}`;
    const { exec } = require('child_process');
    const cmd = process.platform === 'win32' ? `start "" "${open}"` : process.platform === 'darwin' ? `open "${open}"` : `xdg-open "${open}"`;
    exec(cmd, () => {});
  }
});
