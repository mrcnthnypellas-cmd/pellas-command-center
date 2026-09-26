// Backup files can't be saved or opened from the browser preview; the local version does this.
const unavailable = () => { const e = new Error('Backup & restore works in the local version (npm start). The browser preview keeps its data in this browser only.'); e.status = 501; throw e; };
module.exports = { createBackup: unavailable, openBackup: unavailable, restoreBackup: unavailable };
