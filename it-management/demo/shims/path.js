// Minimal POSIX path helpers (only what the server code uses).
const norm = (p) => p.replace(/\/+/g, '/').replace(/\/\.\//g, '/');
const join = (...parts) => norm(parts.filter(Boolean).join('/'));
module.exports = {
  join,
  resolve: (...parts) => join(...parts),
  dirname: (p) => p.split('/').slice(0, -1).join('/') || '/',
  basename: (p) => p.split('/').pop(),
  extname: (p) => { const b = p.split('/').pop(); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : ''; },
  relative: (_a, b) => b,
  sep: '/',
};
