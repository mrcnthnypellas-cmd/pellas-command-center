import '@fontsource-variable/inter';
import '@fontsource-variable/sora';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Some embedded viewers block Web Storage; fall back to in-memory storage so the prototype still runs.
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}
for (const name of ['localStorage', 'sessionStorage'] as const) {
  try {
    const s = window[name];
    s.setItem('__marpel_probe', '1');
    s.removeItem('__marpel_probe');
  } catch {
    Object.defineProperty(window, name, { value: memoryStorage(), configurable: true });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
