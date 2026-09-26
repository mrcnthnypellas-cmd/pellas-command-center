// Per-browser appearance preferences (theme, accent, sidebar colour, sign-in background).
// Carried over from the approved Phase 1 prototype. Stored in localStorage only.

export type LoginBg = { kind: "preset" | "color" | "image"; preset: string; c1: string; c2: string; image: string; dim: number; message: string };
export type Appearance = { mode: "light" | "dark" | "system"; accent: string; sidebar: string; login: LoginBg };

export const ACCENTS: [string, string][] = [["Teal", "#0d7680"], ["Blue", "#2563c9"], ["Indigo", "#4f46e5"], ["Green", "#1d8048"], ["Amber", "#b7791f"], ["Orange", "#c2571a"], ["Red", "#c0392b"], ["Pink", "#c02672"], ["Slate", "#475569"]];
export const SIDEBARS: [string, string][] = [["Midnight", "#0f1b23"], ["Graphite", "#18191d"], ["Navy", "#0d1830"], ["Plum", "#1c1226"], ["Forest", "#0e1c16"], ["Espresso", "#1e1611"], ["Steel", "#243240"]];
export const LOGIN_PRESETS: [string, string, string][] = [
  ["aurora", "Aurora", "radial-gradient(1200px 600px at 20% 0%,#16323b,#0a1216 60%)"],
  ["ocean", "Ocean", "radial-gradient(900px 600px at 80% 10%,#1d4f8a,transparent 60%),linear-gradient(160deg,#0b1a33,#06101f)"],
  ["sunset", "Sunset", "linear-gradient(150deg,#3b1d3f 0%,#7a2e3a 45%,#c0602b 100%)"],
  ["forest", "Forest", "radial-gradient(1000px 600px at 10% 90%,#1f5a3a,transparent 60%),linear-gradient(180deg,#0c1a14,#07110c)"],
  ["royal", "Royal", "radial-gradient(900px 600px at 70% 20%,#4b2a86,transparent 60%),linear-gradient(160deg,#17112b,#0a0814)"],
  ["slate", "Slate", "linear-gradient(160deg,#2a2f38,#14171c)"],
  ["sky", "Sky", "linear-gradient(160deg,#8fb6d9,#3d6e9e)"],
];

export const DEFAULT_APPEARANCE: Appearance = {
  mode: "system", accent: "#0d7680", sidebar: "#0f1b23",
  login: { kind: "preset", preset: "aurora", c1: "#1d3b6a", c2: "#0a1020", image: "", dim: 35, message: "Sign in to manage your server." },
};

export function loadAppearance(): Appearance {
  try {
    const raw = localStorage.getItem("mps-appearance");
    if (raw) { const v = JSON.parse(raw); return { ...DEFAULT_APPEARANCE, ...v, login: { ...DEFAULT_APPEARANCE.login, ...(v.login ?? {}) } }; }
  } catch { /* storage unavailable */ }
  return structuredClone(DEFAULT_APPEARANCE);
}

export function saveAppearance(a: Appearance) {
  try { localStorage.setItem("mps-appearance", JSON.stringify(a)); return true; } catch { return false; }
}

const hexRgb = (h: string) => { let x = h.replace("#", ""); if (x.length === 3) x = [...x].map((c) => c + c).join(""); const n = parseInt(x, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const rgbHex = (r: number[]) => "#" + r.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
export const mix = (a: string, b: string, t: number) => { const x = hexRgb(a), y = hexRgb(b); return rgbHex(x.map((v, i) => v + (y[i] - v) * t)); };
const lum = (h: string) => { const c = hexRgb(h).map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };

export const isDark = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
};

const VARS = ["--accent", "--accent-2", "--accent-ink", "--accent-soft", "--side-accent", "--logo-a", "--logo-b", "--side", "--side-2", "--side-3", "--side-line"];

export function applyAppearance(ap: Appearance) {
  const root = document.documentElement;
  if (ap.mode === "system") delete root.dataset.theme; else root.dataset.theme = ap.mode;
  VARS.forEach((v) => root.style.removeProperty(v));
  const dark = isDark();
  if (ap.accent.toLowerCase() !== DEFAULT_APPEARANCE.accent) {
    const c = ap.accent;
    const a = dark ? (lum(c) < .3 ? mix(c, "#ffffff", .32) : c) : (lum(c) > .45 ? mix(c, "#000000", .3) : c);
    root.style.setProperty("--accent", a);
    root.style.setProperty("--accent-2", dark ? mix(a, "#ffffff", .18) : mix(a, "#000000", .18));
    root.style.setProperty("--accent-soft", dark ? mix(a, "#121a20", .8) : mix(a, "#ffffff", .86));
    root.style.setProperty("--accent-ink", lum(a) > (dark ? .4 : .5) ? "#06181b" : "#ffffff");
    root.style.setProperty("--side-accent", lum(c) < .35 ? mix(c, "#ffffff", .4) : c);
    root.style.setProperty("--logo-a", mix(c, "#ffffff", .12));
    root.style.setProperty("--logo-b", mix(c, "#000000", .3));
  }
  if (ap.sidebar.toLowerCase() !== DEFAULT_APPEARANCE.sidebar) {
    const b = lum(ap.sidebar) > .12 ? mix(ap.sidebar, "#000000", .55) : ap.sidebar;
    root.style.setProperty("--side", b); root.style.setProperty("--side-2", mix(b, "#ffffff", .06));
    root.style.setProperty("--side-3", mix(b, "#ffffff", .11)); root.style.setProperty("--side-line", mix(b, "#ffffff", .07));
  }
}

export function loginBackground(l: LoginBg) {
  if (l.kind === "image" && l.image) { const d = l.dim / 100; return `linear-gradient(rgba(0,0,0,${d}),rgba(0,0,0,${d})), url('${l.image}') center / cover no-repeat`; }
  if (l.kind === "color") return `linear-gradient(160deg,${l.c1},${l.c2})`;
  return (LOGIN_PRESETS.find((p) => p[0] === l.preset) ?? LOGIN_PRESETS[0])[2];
}

/** Downscales a chosen picture to at most 1920px so it can be kept in browser storage. */
export function readPicture(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Choose an image file (JPG, PNG or WebP)."));
    if (file.size > 15e6) return reject(new Error("That picture is over 15 MB."));
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, 1920 / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", .82));
      };
      img.onerror = () => reject(new Error("That picture could not be opened."));
      img.src = r.result as string;
    };
    r.readAsDataURL(file);
  });
}
