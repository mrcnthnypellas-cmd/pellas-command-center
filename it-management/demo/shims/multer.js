// Browser stand-in for multer: files arrive pre-read on req._files (see demo/server.js).
const fs = require('./fs');
const MAX = 3 * 1024 * 1024; // keep the browser-stored database small

function multer(opts = {}) {
  return {
    single: (field) => (req, _res, next) => {
      const f = req._files && req._files[field];
      if (!f || !f.size) return next();
      if (f.size > MAX) { const e = new Error('File is too large for the browser preview (max 3 MB)'); e.status = 400; throw e; }
      const check = (err, ok) => { if (err) throw err; if (!ok) { const e = new Error('Unsupported file type'); e.status = 400; throw e; } };
      if (opts.fileFilter) opts.fileFilter(req, { mimetype: f.type, originalname: f.name }, check);
      const ext = (f.name.match(/\.[a-z0-9]{1,8}$/i) || [''])[0].toLowerCase();
      const stored = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('') + ext;
      if (opts.storage && opts.storage.memory) {
        req.file = { originalname: f.name, mimetype: f.type, size: f.size, buffer: f.bytes };
        return next();
      }
      fs.saveFile(stored, f.type, f.bytes);
      req.file = { filename: stored, originalname: f.name, mimetype: f.type, size: f.size };
      next();
    },
  };
}
multer.diskStorage = (o) => o;
multer.memoryStorage = () => ({ memory: true });
module.exports = multer;
