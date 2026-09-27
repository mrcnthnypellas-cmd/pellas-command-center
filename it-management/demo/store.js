// Key/value storage that never throws. In the Android app it goes to the app's own files through
// the native bridge (no size limit, survives clearing the browser); otherwise localStorage.
const mem = new Map();
const bridge = typeof window !== 'undefined' ? window.ItmsAndroid : null;

module.exports = {
  get(k) {
    if (bridge) { try { const v = bridge.load(k); return v === null || v === undefined ? (mem.get(k) ?? null) : v; } catch { return mem.get(k) ?? null; } }
    try { const v = localStorage.getItem(k); return v === null ? (mem.get(k) ?? null) : v; } catch { return mem.get(k) ?? null; }
  },
  set(k, v) {
    mem.set(k, v);
    if (bridge) { try { return !!bridge.save(k, v); } catch { return false; } }
    try { localStorage.setItem(k, v); return true; } catch { return false; }
  },
  del(k) {
    mem.delete(k);
    if (bridge) { try { bridge.remove(k); } catch { /* ignore */ } return; }
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  },
};
