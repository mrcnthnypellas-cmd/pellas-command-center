// localStorage wrapper that never throws (private windows, blocked storage, previews).
const mem = new Map();
module.exports = {
  get(k) { try { const v = localStorage.getItem(k); return v === null ? (mem.get(k) ?? null) : v; } catch { return mem.get(k) ?? null; } },
  set(k, v) { mem.set(k, v); try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k) { mem.delete(k); try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
