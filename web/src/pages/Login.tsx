import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { LogIn, Building2, Move, Copy, RotateCcw } from "lucide-react";
import { useAuth } from "../lib/auth";
import { supabase, setRememberMe } from "../lib/supabase";
import { Button, Modal } from "../components/ui/ui";

const BACKGROUND_VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260403_050628_c4e32401-fab4-4a27-b7a8-6e9291cd5959.mp4";

// Admin preview-only layout editor for the login card: open the login page
// with ?edit=1 to drag/resize it and find the exact spot/size that looks
// best. Saved to localStorage so it survives reloads WHILE you're testing,
// but this override only ever applies in edit mode — anyone visiting the
// plain /login URL always sees the shipped default layout below. Once a
// position/size is chosen, report the numbers (the HUD has a Copy button)
// so they can be committed as the new permanent default.
const EDIT_STORAGE_KEY = "login_card_layout_v1";

interface CardLayout {
  left: number;
  top: number;
  width: number;
  height: number;
}

export default function Login() {
  const { session, profile, loading, signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loginTitle, setLoginTitle] = useState("Employee Attendance System");
  const [footerText, setFooterText] = useState("All Rights Reserved 2026 PELLAS Command Centre");

  const isEditMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("edit") === "1";
  const cardRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<CardLayout | null>(null);
  const dragState = useRef<{ mode: "move" | "resize"; startX: number; startY: number; base: CardLayout } | null>(null);

  useEffect(() => {
    supabase
      .from("companies")
      .select("login_background_url, logo_url, login_title, login_footer_text")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.login_background_url) setBackgroundUrl(data.login_background_url);
        if (data?.logo_url) setLogoUrl(data.logo_url);
        if (data?.login_title) setLoginTitle(data.login_title);
        if (data?.login_footer_text) setFooterText(data.login_footer_text);
      });
  }, []);

  useEffect(() => {
    if (!isEditMode) return;
    const saved = localStorage.getItem(EDIT_STORAGE_KEY);
    if (saved) {
      try {
        setLayout(JSON.parse(saved));
        return;
      } catch {
        // fall through to measuring the current natural position
      }
    }
    const rect = cardRef.current?.getBoundingClientRect();
    if (rect) setLayout({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode]);

  function persist(next: CardLayout) {
    setLayout(next);
    localStorage.setItem(EDIT_STORAGE_KEY, JSON.stringify(next));
  }

  function startDrag(e: React.PointerEvent, mode: "move" | "resize") {
    if (!layout) return;
    e.preventDefault();
    e.stopPropagation();
    dragState.current = { mode, startX: e.clientX, startY: e.clientY, base: layout };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onDragMove(e: React.PointerEvent) {
    const ds = dragState.current;
    if (!ds) return;
    const dx = e.clientX - ds.startX;
    const dy = e.clientY - ds.startY;
    if (ds.mode === "move") {
      persist({ ...ds.base, left: ds.base.left + dx, top: ds.base.top + dy });
    } else {
      persist({ ...ds.base, width: Math.max(280, ds.base.width + dx), height: Math.max(200, ds.base.height + dy) });
    }
  }

  function endDrag(e: React.PointerEvent) {
    dragState.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // no-op
    }
  }

  function resetLayout() {
    localStorage.removeItem(EDIT_STORAGE_KEY);
    const rect = cardRef.current?.getBoundingClientRect();
    if (rect) setLayout({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
  }

  function copyLayout() {
    if (!layout) return;
    navigator.clipboard?.writeText(JSON.stringify(layout, null, 2)).catch(() => {});
  }

  if (!loading && session && profile) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username || !password) {
      setError("Enter your username and password.");
      return;
    }
    setSubmitting(true);
    setRememberMe(remember);
    const { error } = await signIn(username, password);
    setSubmitting(false);
    if (error) setError(error);
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-end bg-black p-4">
      {/* Full-screen background video, no dimming/overlay of any kind. Fixed
          (not absolute) so it always covers the actual viewport regardless
          of how tall this page's content ends up being — on a short/mobile
          viewport the card below can push the page taller than one screen,
          and a merely-absolute video tied to that taller box would leave
          the card scrolled out of view with nothing visibly wrong above it. */}
      <video
        className="fixed inset-0 h-full w-full object-cover"
        src={BACKGROUND_VIDEO_URL}
        poster={backgroundUrl ?? undefined}
        autoPlay
        loop
        muted
        playsInline
      />

      <div
        // Found the real bug: the "permanent desktop placement" below used
        // hardcoded pixel coordinates (left:923 top:920) captured from one
        // specific screen, applied via lg: (>=1024px CSS width) to ANY
        // device in that range — including tablets, whose viewport can
        // easily be narrower/shorter than the screen those numbers came
        // from. A position:fixed element with coordinates beyond a given
        // viewport's actual bounds renders fully off-screen — invisible,
        // and un-reachable by scrolling, since fixed elements don't move
        // with the page. That's exactly what an Android tablet (CSS width
        // >=1024px, triggering lg:) with different dimensions than the
        // admin's test screen would hit. Reverted to the same responsive
        // centered-at-bottom flow on every screen size — safe by
        // construction, since it can never place the card outside the
        // viewport regardless of device.
        className="relative z-10 mx-auto w-full max-w-3xl"
        style={isEditMode && layout ? { position: "fixed", left: layout.left, top: layout.top, width: layout.width, height: layout.height, maxWidth: "none", margin: 0 } : undefined}
      >
        <div ref={cardRef} className="liquid-glass relative h-full overflow-hidden rounded-2xl border border-white/20">
          {isEditMode && (
            <div
              onPointerDown={(e) => startDrag(e, "move")}
              onPointerMove={onDragMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              className="absolute inset-x-0 top-0 z-20 flex h-8 cursor-grab touch-none items-center justify-center gap-1.5 bg-brand-600/80 text-xs font-medium text-white active:cursor-grabbing"
            >
              <Move className="h-3.5 w-3.5" /> Drag to reposition
            </div>
          )}
          <div className="flex h-full flex-col sm:flex-row">
            <div className="flex flex-col items-center justify-center gap-2 border-b border-white/10 p-8 text-center sm:w-2/5 sm:border-b-0 sm:border-r">
              {logoUrl ? (
                <img src={logoUrl} alt="Company logo" className="h-12 w-12 rounded-xl object-cover" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-white">
                  <Building2 className="h-6 w-6" />
                </div>
              )}
              <h1 className="text-xl font-semibold tracking-tight text-white">{loginTitle}</h1>
              <p className="text-sm text-gray-300">Sign in to your account</p>
            </div>

            <div className="flex-1 p-8">
              <form onSubmit={handleSubmit} className="space-y-4">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-gray-200">Username</span>
                  <input
                    className="w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white/40"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoFocus
                    autoComplete="username"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-gray-200">Password</span>
                  <input
                    className="w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white/40"
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </label>

                {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-2 text-gray-300">
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="rounded border-white/30 bg-transparent" />
                    Remember me
                  </label>
                  <button type="button" onClick={() => setForgotOpen(true)} className="text-gray-300 hover:text-white hover:underline">
                    Forgot password?
                  </button>
                </div>

                <Button type="submit" className="w-full !bg-white !text-black hover:!bg-gray-100" loading={submitting}>
                  <LogIn className="h-4 w-4" /> Login
                </Button>
              </form>

              <p className="mt-6 text-center text-xs text-gray-400">{footerText}</p>
            </div>
          </div>

          {isEditMode && (
            <div
              onPointerDown={(e) => startDrag(e, "resize")}
              onPointerMove={onDragMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              className="absolute bottom-0 right-0 z-20 h-6 w-6 cursor-nwse-resize touch-none rounded-tl-lg bg-brand-600/80"
              aria-label="Resize card"
            />
          )}
        </div>
      </div>

      {isEditMode && layout && (
        <div className="fixed bottom-4 left-4 z-30 space-y-2 rounded-xl bg-black/80 p-3 text-xs text-white shadow-xl">
          <p className="font-mono">
            left: {Math.round(layout.left)} · top: {Math.round(layout.top)} · w: {Math.round(layout.width)} · h: {Math.round(layout.height)}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={copyLayout} className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 hover:bg-white/20">
              <Copy className="h-3 w-3" /> Copy values
            </button>
            <button type="button" onClick={resetLayout} className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 hover:bg-white/20">
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
          </div>
          <p className="text-gray-400">Preview mode only — remove ?edit=1 from the URL to see the real page. Tell Claude the values to make them permanent.</p>
        </div>
      )}

      <Modal open={forgotOpen} onClose={() => setForgotOpen(false)} title="Forgot Password">
        <p className="text-sm text-slate-600">
          For security, passwords can only be reset by your system Administrator or HR. Please contact them directly
          with your username to request a password reset.
        </p>
        <Button className="mt-4 w-full" variant="secondary" onClick={() => setForgotOpen(false)}>Close</Button>
      </Modal>
    </div>
  );
}
