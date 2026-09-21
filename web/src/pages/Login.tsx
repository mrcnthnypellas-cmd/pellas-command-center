import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { LogIn, Building2 } from "lucide-react";
import { useAuth } from "../lib/auth";
import { supabase, setRememberMe } from "../lib/supabase";
import { Button, Input, Modal } from "../components/ui/ui";

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
    <div
      className={`min-h-screen p-4 bg-cover bg-center ${
        backgroundUrl ? "" : "bg-gradient-to-br from-brand-950 via-brand-800 to-brand-600"
      }`}
      style={backgroundUrl ? { backgroundImage: `url(${backgroundUrl})` } : undefined}
    >
      {backgroundUrl && <div className="fixed inset-0 bg-slate-900/40" />}
      <div className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex flex-col sm:flex-row">
          <div className="flex flex-col items-center justify-center gap-2 p-8 text-center sm:w-2/5 sm:border-r sm:border-slate-100">
            {logoUrl ? (
              <img src={logoUrl} alt="Company logo" className="h-12 w-12 rounded-xl object-cover" />
            ) : (
              <div className="h-12 w-12 rounded-xl bg-brand-600 flex items-center justify-center text-white">
                <Building2 className="h-6 w-6" />
              </div>
            )}
            <h1 className="text-xl font-bold text-slate-800">{loginTitle}</h1>
            <p className="text-sm text-slate-500">Sign in to your account</p>
          </div>

          <div className="flex-1 p-8">
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input label="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
              <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />

              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 text-slate-600">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="rounded border-slate-300" />
                  Remember me
                </label>
                <button type="button" onClick={() => setForgotOpen(true)} className="text-brand-600 hover:underline">
                  Forgot password?
                </button>
              </div>

              <Button type="submit" className="w-full" loading={submitting}>
                <LogIn className="h-4 w-4" /> Login
              </Button>
            </form>

            <p className="mt-6 text-center text-xs text-slate-400">{footerText}</p>
          </div>
        </div>
      </div>

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
