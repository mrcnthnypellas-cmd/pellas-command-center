import { useEffect, useState } from "react";
import { Check, HardDrive, Server, ShieldCheck, TriangleAlert } from "lucide-react";
import { api, fmtBytes } from "../api";
import { Button, Field, Pill, cx, inputCls } from "../ui";

type Drive = { drive: { id: string; root: string; label: string; kind: string; fileSystem: string; totalBytes: number; freeBytes: number; isSystem: boolean; isReady: boolean; recommended: boolean; note?: string; model?: string }; suggestedPath: string };
const STEPS = ["Welcome", "Server name", "Storage", "Administrator", "Finish"];

export default function Setup({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [token, setToken] = useState("");
  const [name, setName] = useState("My Private Server");
  const [drives, setDrives] = useState<Drive[] | null>(null);
  const [path, setPath] = useState("");
  const [user, setUser] = useState("admin");
  const [display, setDisplay] = useState("Administrator");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const headers = token ? { "X-Setup-Token": token.trim() } : undefined;

  useEffect(() => { api("/api/setup/status").then((s) => { setAllowed(s.allowedFromThisDevice); setName(s.serverName); }); }, []);

  async function scan() {
    setDrives(null); setError(null);
    try {
      const d = await api<Drive[]>("/api/setup/drives", { headers });
      setDrives(d);
      const best = d.find((x) => x.drive.recommended) ?? d.find((x) => x.drive.isReady);
      if (best && !path) setPath(best.suggestedPath);
    } catch (e: any) { setError(e.message); }
  }
  useEffect(() => { if (step === 2) scan(); /* eslint-disable-next-line */ }, [step]);

  async function finish() {
    setBusy(true); setError(null);
    try {
      await api("/api/setup/complete", { body: { serverName: name, storagePath: path, adminUsername: user, adminDisplayName: display, adminPassword: pw }, headers });
      setStep(4);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  const canNext = step === 0 ? allowed || token.length > 5 : step === 1 ? name.trim().length > 0 : step === 2 ? !!path : step === 3 ? pw.length >= 10 && pw === pw2 && user.length >= 3 : true;

  return (
    <div className="grid min-h-full place-items-center bg-bg p-4">
      <div className="grid w-full max-w-[960px] overflow-hidden rounded-[14px] border border-line bg-surface shadow-2xl md:min-h-[560px] md:grid-cols-[260px_1fr]">
        <aside className="grid content-start gap-4 bg-side p-5 text-side-ink">
          <div className="flex items-center gap-2.5"><div className="logo grid h-[30px] w-[30px] place-content-center gap-[3px] rounded-lg px-1.5">{[0, 1, 2].map((i) => <i key={i} className="block h-[3px] w-4 rounded-sm bg-white/90" />)}</div><b className="text-white">Set up your server</b></div>
          <ol className="m-0 flex list-none gap-1 overflow-x-auto p-0 md:grid">
            {STEPS.map((s, i) => (
              <li key={s} className={cx("flex items-center gap-2.5 whitespace-nowrap rounded-md px-2 py-2 text-[13.5px]", i === step ? "bg-side-3 text-white" : i < step ? "text-side-ink" : "text-side-muted")}>
                <i className={cx("grid h-6 w-6 flex-none place-items-center rounded-full border-[1.5px] text-[11.5px] font-semibold not-italic", i < step ? "border-ok bg-ok text-white" : i === step ? "border-side-accent text-side-accent" : "border-[#2b4552]")}>{i < step ? <Check size={12} strokeWidth={3} /> : i + 1}</i>
                <span className={cx(i !== step && "hidden md:inline")}>{s}</span>
              </li>
            ))}
          </ol>
        </aside>
        <div className="flex min-w-0 flex-col">
          <div className="grid flex-1 content-start gap-4 p-6 md:p-9">
            {step === 0 && <>
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-accent text-accent-ink"><Server size={28} /></div>
              <h2 className="m-0 text-2xl">Welcome to My Private Server</h2>
              <p className="m-0 text-muted">This PC will become your private file server, database and web host. Your files stay on your own drives, and nothing requires a subscription.</p>
              {allowed === false && <div className="grid gap-2 rounded-lg bg-warn-soft p-3 text-[13px] text-warn">
                <span className="flex items-center gap-2 font-semibold"><TriangleAlert size={16} /> You are setting up from another device.</span>
                <span>For safety, enter the setup code shown on the server PC (in the file <code>setup-token.txt</code> in the server's data folder).</span>
                <input className={inputCls} placeholder="Setup code" value={token} onChange={(e) => setToken(e.target.value)} />
              </div>}
            </>}
            {step === 1 && <>
              <h2 className="m-0 text-2xl">Name your server</h2>
              <p className="m-0 text-muted">This name appears in the dashboard and on every connected device.</p>
              <Field label="Server name" hint="For example: QMARC NASH SERVER"><input className={inputCls + " !py-3 !text-base"} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
            </>}
            {step === 2 && <>
              <h2 className="m-0 text-2xl">Choose where to keep your files</h2>
              <p className="m-0 text-muted">These are the drives in this PC. Nothing is formatted or erased. The server only creates a folder.</p>
              {!drives && !error && <p className="text-muted">Scanning for storage devices…</p>}
              <div className="grid gap-2">
                {drives?.map((d) => (
                  <label key={d.drive.id} className={cx("flex cursor-pointer items-center gap-3 rounded-lg border-[1.5px] p-3", path === d.suggestedPath ? "border-accent bg-accent-soft" : "border-line hover:border-line-2", !d.drive.isReady && "opacity-50")}>
                    <input type="radio" name="drive" className="accent-[var(--accent)]" checked={path === d.suggestedPath} disabled={!d.drive.isReady} onChange={() => setPath(d.suggestedPath)} />
                    <HardDrive size={22} className="text-ink-2" />
                    <span className="grid flex-1 gap-0.5">
                      <b className="text-[13.5px]">{d.drive.root} {d.drive.label} <span className="font-normal text-muted">· {d.drive.kind} · {d.drive.fileSystem}</span></b>
                      <small className="text-xs text-muted">{fmtBytes(d.drive.freeBytes)} free of {fmtBytes(d.drive.totalBytes)}{d.drive.note ? ` · ${d.drive.note}` : ""}</small>
                    </span>
                    {d.drive.recommended && <Pill tone="ok">Recommended</Pill>}
                    {d.drive.isSystem && <Pill tone="warn">System drive</Pill>}
                  </label>
                ))}
              </div>
              <Field label="Storage folder" hint="All files, databases, websites and backups are kept inside this folder."><input className={inputCls + " font-mono"} value={path} onChange={(e) => setPath(e.target.value)} /></Field>
            </>}
            {step === 3 && <>
              <h2 className="m-0 text-2xl">Create the administrator</h2>
              <p className="m-0 text-muted">The administrator manages users, storage and settings.</p>
              <div className="grid gap-3.5 sm:grid-cols-2">
                <Field label="Username"><input className={inputCls} value={user} onChange={(e) => setUser(e.target.value.toLowerCase())} autoComplete="off" /></Field>
                <Field label="Display name"><input className={inputCls} value={display} onChange={(e) => setDisplay(e.target.value)} /></Field>
                <Field label="Password" hint="At least 10 characters, with letters and numbers or symbols."><input className={inputCls} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
                <Field label="Confirm password" error={pw2 && pw !== pw2 ? "Passwords do not match." : null}><input className={inputCls} type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></Field>
              </div>
            </>}
            {step === 4 && <>
              <div className="grid h-16 w-16 place-items-center rounded-full bg-ok-soft text-ok"><Check size={34} strokeWidth={2.4} /></div>
              <h2 className="m-0 text-2xl">Your server is ready.</h2>
              <p className="m-0 text-muted">Sign in with your administrator account. Next, turn on Remote Access to reach the server from your phone or laptop.</p>
              <div className="flex items-center gap-2 rounded-lg bg-surface-2 p-3 text-[13px]"><ShieldCheck size={18} className="text-ok" /> Storage folder: <code className="font-mono">{path}</code></div>
            </>}
            {error && <div className="rounded-md bg-bad-soft px-3 py-2 text-[13px] text-bad" role="alert">{error}</div>}
          </div>
          <div className="flex items-center gap-2 border-t border-line px-6 py-3.5 md:px-9">
            {step > 0 && step < 4 && <Button onClick={() => { setError(null); setStep(step - 1); }}>Back</Button>}
            <span className="flex-1" />
            <span className="hidden text-xs text-muted sm:inline">Step {step + 1} of {STEPS.length}</span>
            {step < 3 && <Button variant="primary" disabled={!canNext} onClick={() => { setError(null); setStep(step + 1); }}>{step === 0 ? "Get started" : "Next"}</Button>}
            {step === 3 && <Button variant="primary" disabled={!canNext || busy} onClick={finish}>{busy ? "Setting up…" : "Finish setup"}</Button>}
            {step === 4 && <Button variant="primary" onClick={onDone}>Go to sign in</Button>}
          </div>
        </div>
      </div>
    </div>
  );
}
