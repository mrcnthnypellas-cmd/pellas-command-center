// Local entry point: `npm start` → http://localhost:4000
const config = require('./config');
const db = require('./db/connection');
const { createApp } = require('./app');

db.open();
if (!db.get('SELECT 1 FROM users LIMIT 1')) {
  console.log('Empty database detected — loading sample data...');
  require('./db/seed').seed();
}

createApp().listen(config.PORT, config.HOST, () => {
  const url = `http://${config.HOST === '0.0.0.0' ? 'localhost' : config.HOST}:${config.PORT}`;
  console.log(`\n  IT Management System running at ${url}`);
  console.log('  Default logins: admin / admin123 · itstaff / itstaff123 · jtech / jtech123 · viewer / viewer123');
  console.log('  Reset sample data: npm run db:reset\n');
  // START-SERVER.bat sets this so the browser opens only once the server is ready.
  if (process.env.ITMS_OPEN_BROWSER === '1') {
    const open = `http://127.0.0.1:${config.PORT}`;
    const { exec } = require('child_process');
    const cmd = process.platform === 'win32' ? `start "" "${open}"` : process.platform === 'darwin' ? `open "${open}"` : `xdg-open "${open}"`;
    exec(cmd, () => {});
  }
});
