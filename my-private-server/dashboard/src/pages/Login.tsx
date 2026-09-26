import { useEffect, useState } from "react";
import { Lock, Palette } from "lucide-react";
import { api } from "../api";
import { loginBackground, type Appearance } from "../appearance";
import type { Me } from "../session";
import { Button, Modal } from "../ui";
import { LoginBackgroundControls } from "./Settings";

export default function Login({ serverName, serverId, appearance, setAppearance, onLogin }:
  { serverName: string; serverId: string; appearance: Appearance; setAppearance: (a: Appearance) => void; onLogin: (me: Me) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bgOpen, setBgOpen] = useState(false);
  useEffect(() => { api("/api/auth/csrf").catch(() => {}); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try { onLogin(await api<Me>("/api/auth/login", { body: { username, password } })); }
    catch (err: any) { setError(err.message); setPassword(""); }
    finally { setBusy(false); }
  }

  const input = "w-full rounded-[7px] border border-[#2a3f49] bg-[#0e181d] px-3 py-2.5 text-[14px] text-[#e1e8ed] focus:border-accent focus:outline-2 focus:outline-accent";
  return (
    <div className="grid min-h-full place-items-center p-4" style={{ background: loginBackground(appearance.login) }}>
      <form onSubmit={submit} className="grid w-full max-w-[380px] gap-4 rounded-[14px] border border-[#21363f] bg-[rgb(18_30_37/.88)] p-7 text-[#e1e8ed] shadow-[0_30px_80px_rgb(0_0_0/.45)] backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="logo grid h-[38px] w-[38px] flex-none place-content-center gap-[3px] rounded-lg px-2">{[0, 1, 2].map((i) => <i key={i} className="block h-1 w-5 rounded-sm bg-white/90" />)}</div>
          <div><h2 className="m-0 text-xl">{serverName}</h2><p className="m-0 text-[13px] text-[#8ea0aa]">My Private Server · {serverId}</p></div>
        </div>
        {appearance.login.message && <p className="m-0 text-[13.5px] text-[#c9d6dd]">{appearance.login.message}</p>}
        <label className="grid gap-1.5 text-[12.5px] font-semibold text-[#a8b6c0]">Username
          <input className={input} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
        </label>
        <label className="grid gap-1.5 text-[12.5px] font-semibold text-[#a8b6c0]">Password
          <input className={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <div className="rounded-md bg-[#3a1614] px-3 py-2 text-[13px] text-[#ff9d95]" role="alert">{error}</div>}
        <Button variant="primary" type="submit" disabled={busy} className="py-2.5">{busy ? "Signing in…" : "Sign in"}</Button>
        <p className="m-0 flex items-center gap-1.5 text-xs text-[#8ea0aa]"><Lock size={13} /> {location.protocol === "https:" ? "Encrypted connection" : "Use HTTPS or remote access for connections from outside your network."}</p>
      </form>
      <button onClick={() => setBgOpen(true)} className="fixed bottom-4 right-4 flex items-center gap-1.5 rounded-md border border-white/20 bg-black/50 px-2.5 py-1.5 text-[12.5px] text-[#e1e8ed] backdrop-blur hover:bg-black/70"><Palette size={15} /> Background</button>
      {bgOpen && <Modal title="Sign-in background" wide onClose={() => setBgOpen(false)} footer={<Button variant="primary" onClick={() => setBgOpen(false)}>Done</Button>}>
        <LoginBackgroundControls appearance={appearance} setAppearance={setAppearance} />
      </Modal>}
    </div>
  );
}
