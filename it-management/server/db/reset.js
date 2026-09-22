// `npm run db:reset` — deletes the local database + uploads and reloads sample data.
const fs = require('fs');
const path = require('path');
const config = require('../config');

for (const f of [config.DB_FILE, `${config.DB_FILE}-wal`, `${config.DB_FILE}-shm`]) fs.rmSync(f, { force: true });
fs.rmSync(config.UPLOAD_DIR, { recursive: true, force: true });
fs.mkdirSync(config.UPLOAD_DIR, { recursive: true });

require('./seed').seed();
require('./connection').close();
console.log(`Database reset with sample data: ${path.relative(process.cwd(), config.DB_FILE)}`);
console.log('Logins: admin / admin123 · itstaff / itstaff123 · jtech / jtech123 · viewer / viewer123');
