// Without a valid license only these still work: signing in, the first-run setup, entering a
// license key, and downloading a backup (the customer's data is never held back).
const license = require('./license');

const OPEN = ['/public/', '/auth/', '/license', '/backup/download', '/backup/status'];

function licenseGate(req, res, next) {
  const p = req.path;
  if (OPEN.some((o) => p === o.replace(/\/$/, '') || p.startsWith(o))) return next();
  const s = license.status();
  if (s.valid) return next();
  res.status(402).json({ error: s.state === 'expired' ? `The license expired on ${s.expires}. Enter a renewed license key.` : 'A valid license key is required.', license: s.state });
}

module.exports = { licenseGate };
