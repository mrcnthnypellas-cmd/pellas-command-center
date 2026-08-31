import { useState } from "react";
import { Navigate } from "react-router-dom";
import { LogIn, Building2 } from "lucide-react";
import { useAuth } from "../lib/auth";
import { setRememberMe } from "../lib/supabase";
import { Button, Input, Modal } from "../components/ui/ui";

export default function Login() {
  const { session, profile, loading, signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-950 via-brand-800 to-brand-600 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-8">
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="h-12 w-12 rounded-xl bg-brand-600 flex items-center justify-center text-white">
            <Building2 className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">Employee Attendance System</h1>
          <p className="text-sm text-slate-500">Sign in to your account</p>
        </div>

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

        <p className="mt-6 text-center text-xs text-slate-400">
          Demo accounts: admin1 / Admin@123 &middot; hr1 / Hr@12345 &middot; employee1 / Employee@123
        </p>
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
