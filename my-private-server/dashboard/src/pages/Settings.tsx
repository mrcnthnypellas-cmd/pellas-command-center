import { useEffect, useRef, useState } from "react";
import { Check, Monitor, Moon, Palette, Sun, Upload } from "lucide-react";
import { api, rel } from "../api";
import { ACCENTS, DEFAULT_APPEARANCE, LOGIN_PRESETS, SIDEBARS, loginBackground, readPicture, type Appearance } from "../appearance";
import { useSession } from "../session";
import { Button, Card, Field, PageError, Pill, Table, Toggle, cx, inputCls, useAction, useLoad, useToast } from "../ui";

export default function SettingsPage() {
  const s = useSession();
  const canAdmin = s.can("ManageSettings");
  const sections = [...(canAdmin ? ["General", "Security", "Network"] : []), "Appearance", "My account", "Sessions"];
  const [sec, setSec] = useState(() => (location.hash === "#appearance" ? "Appearance" : sections[0]));
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav className="flex gap-1 overflow-x-auto rounded-[10px] border border-line bg-surface p-2 lg:sticky lg:top-20 lg:grid">
        {sections.map((x) => <button key={x} onClick={() => setSec(x)} className={cx("whitespace-nowrap rounded-md px-3 py-2 text-left text-[13.5px]", sec === x ? "bg-accent-soft font-semibold text-accent" : "text-ink-2 hover:bg-surface-2")}>{x}</button>)}
      </nav>
      <div className="min-w-0">
        {sec === "General" && <ServerSettings part="general" />}
        {sec === "Security" && <ServerSettings part="security" />}
        {sec === "Network" && <ServerSettings part="network" />}
        {sec === "Appearance" && <AppearanceSettings />}
        {sec === "My account" && <Account />}
        {sec === "Sessions" && <Sessions />}
      </div>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div className="grid items-center gap-3 border-t border-line px-4.5 py-3.5 first:border-t-0 md:grid-cols-[minmax(0,1fr)_minmax(0,320px)]"><div><b className="block text-[13.5px]">{label}</b>{hint && <span className="block text-[12.5px] text-muted">{hint}</span>}</div><div className="flex md:justify-end">{children}</div></div>;
}

function ServerSettings({ part }: { part: "general" | "security" | "network" }) {
  const s = useSession();
  const { data, error, reload } = useLoad<any>(() => api("/api/settings"));
  const [d, setD] = useState<any>(null);
  const { busy, run } = useAction();
  useEffect(() => { if (data) setD(structuredClone(data)); }, [data]);
  if (error) return <PageError error={error} />;
  if (!d) return null;
  const dirty = JSON.stringify(d) !== JSON.stringify(data);
  const save = () => run(async () => {
    await api("/api/settings", { method: "PATCH", body: part === "general" ? { serverName: d.serverName, deployPollMinutes: Number(d.deployPollMinutes), otlpEndpoint: d.otlpEndpoint ?? "" }
      : part === "security" ? { security: { ...d.security, minPasswordLength: Number(d.security.minPasswordLength), maxFailedLogins: Number(d.security.maxFailedLogins), lockoutMinutes: Number(d.security.lockoutMinutes), sessionIdleMinutes: Number(d.security.sessionIdleMinutes), sessionAbsoluteHours: Number(d.security.sessionAbsoluteHours) } }
      : { httpPort: Number(d.network.httpPort), httpsPort: Number(d.network.httpsPort), allowLan: d.network.allowLan } });
    reload(); s.refreshServer();
  }, part === "network" ? "Saved. Restart the My Private Server service to apply network changes." : "Settings saved");
  const num = (path: string[], v: string) => setD((x: any) => { const n = structuredClone(x); path.slice(0, -1).reduce((o, k) => o[k], n)[path.at(-1)!] = v; return n; });
  return (
    <Card pad={false} footer={<><span className="text-[12.5px] text-muted">{dirty ? <span className="font-semibold text-warn">Unsaved changes</span> : "All changes saved"}</span><span className="flex-1" /><Button disabled={!dirty} onClick={() => setD(structuredClone(data))}>Discard</Button><Button variant="primary" disabled={!dirty || busy} onClick={save}>Save changes</Button></>}>
      {part === "general" && <>
        <Row label="Server name" hint="Shown in the dashboard and to connected devices"><input className={inputCls} value={d.serverName} onChange={(e) => setD({ ...d, serverName: e.target.value })} /></Row>
        <Row label="Server ID" hint="Unique identity of this installation"><span className="font-mono">{d.serverId}</span></Row>
        <Row label="Storage folder"><span className="break-all font-mono text-xs">{d.storageRoot}</span></Row>
        <Row label="Check GitHub for new commits every" hint="Minutes, for automatic deployments"><input className={inputCls} type="number" min={1} value={d.deployPollMinutes} onChange={(e) => setD({ ...d, deployPollMinutes: e.target.value })} /></Row>
        <Row label="OpenTelemetry endpoint (optional)" hint="Send metrics to your own monitoring tool. Empty = nothing leaves this PC."><input className={inputCls} value={d.otlpEndpoint ?? ""} placeholder="http://localhost:4317" onChange={(e) => setD({ ...d, otlpEndpoint: e.target.value })} /></Row>
      </>}
      {part === "security" && <>
        <Row label="Minimum password length"><input className={inputCls} type="number" value={d.security.minPasswordLength} onChange={(e) => num(["security", "minPasswordLength"], e.target.value)} /></Row>
        <Row label="Lock account after failed sign-ins"><input className={inputCls} type="number" value={d.security.maxFailedLogins} onChange={(e) => num(["security", "maxFailedLogins"], e.target.value)} /></Row>
        <Row label="Lockout duration (minutes)"><input className={inputCls} type="number" value={d.security.lockoutMinutes} onChange={(e) => num(["security", "lockoutMinutes"], e.target.value)} /></Row>
        <Row label="Sign out idle sessions after (minutes)"><input className={inputCls} type="number" value={d.security.sessionIdleMinutes} onChange={(e) => num(["security", "sessionIdleMinutes"], e.target.value)} /></Row>
        <Row label="Maximum session length (hours)"><input className={inputCls} type="number" value={d.security.sessionAbsoluteHours} onChange={(e) => num(["security", "sessionAbsoluteHours"], e.target.value)} /></Row>
        <Row label="Always on" hint="Not configurable"><div className="flex flex-wrap gap-1.5 md:justify-end"><Pill tone="ok">Password hashing (PBKDF2)</Pill><Pill tone="ok">CSRF protection</Pill><Pill tone="ok">Rate limiting</Pill><Pill tone="ok">Encrypted secrets</Pill><Pill tone="ok">Audit log</Pill></div></Row>
      </>}
      {part === "network" && <>
        <Row label="Allow other devices on the local network" hint="Off = only this PC can open the dashboard (remote access still works)"><Toggle on={d.network.allowLan} onChange={(v) => setD({ ...d, network: { ...d.network, allowLan: v } })} label="Allow LAN" /></Row>
        <Row label="HTTP port" hint="Dashboard on the local network"><input className={inputCls} type="number" value={d.network.httpPort} onChange={(e) => num(["network", "httpPort"], e.target.value)} /></Row>
        <Row label="HTTPS port" hint="Encrypted local access (self-signed certificate)"><input className={inputCls} type="number" value={d.network.httpsPort} onChange={(e) => num(["network", "httpsPort"], e.target.value)} /></Row>
      </>}
    </Card>
  );
}

export function LoginBackgroundControls({ appearance: ap, setAppearance }: { appearance: Appearance; setAppearance: (a: Appearance) => void }) {
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const l = ap.login;
  const set = (patch: Partial<Appearance["login"]>) => setAppearance({ ...ap, login: { ...l, ...patch } });
  return (
    <div className="grid gap-3.5">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2.5">
        {LOGIN_PRESETS.map(([k, n, css]) => <button key={k} onClick={() => set({ kind: "preset", preset: k })} className={cx("flex h-[72px] items-end gap-1 rounded-lg border-2 p-2 text-left text-xs font-semibold text-white [text-shadow:0_1px_3px_rgb(0_0_0/.6)]", l.kind === "preset" && l.preset === k ? "border-accent ring-2 ring-accent" : "border-transparent ring-1 ring-line-2")} style={{ background: css }}>{l.kind === "preset" && l.preset === k && <Check size={13} strokeWidth={3} />}{n}</button>)}
        <button onClick={() => set({ kind: "color" })} className={cx("flex h-[72px] items-end gap-1 rounded-lg border-2 p-2 text-left text-xs font-semibold text-white [text-shadow:0_1px_3px_rgb(0_0_0/.6)]", l.kind === "color" ? "border-accent ring-2 ring-accent" : "border-transparent ring-1 ring-line-2")} style={{ background: `linear-gradient(160deg,${l.c1},${l.c2})` }}>{l.kind === "color" && <Check size={13} strokeWidth={3} />}Custom colors</button>
        <button onClick={() => (l.image ? set({ kind: "image" }) : file.current?.click())} className={cx("flex h-[72px] flex-col items-center justify-center gap-1 rounded-lg border-2 text-xs font-semibold", l.image ? "text-white [text-shadow:0_1px_3px_rgb(0_0_0/.6)]" : "border-dashed border-line-2 text-ink-2", l.kind === "image" && "!border-solid border-accent ring-2 ring-accent")}
          style={l.image ? { background: `linear-gradient(rgba(0,0,0,.25),rgba(0,0,0,.25)), url('${l.image}') center / cover` } : undefined}>{l.image ? "My picture" : <><Upload size={18} />Upload picture</>}</button>
      </div>
      <input ref={file} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; try { set({ kind: "image", image: await readPicture(f) }); toast("Sign-in background updated"); } catch (err: any) { toast(err.message, "bad"); } }} />
      {l.kind === "color" && <div className="flex flex-wrap gap-4 text-xs text-muted"><label className="flex items-center gap-2">Top color <input type="color" value={l.c1} onChange={(e) => set({ c1: e.target.value })} className="h-9 w-9 cursor-pointer rounded border border-line-2 bg-surface p-0.5" /></label><label className="flex items-center gap-2">Bottom color <input type="color" value={l.c2} onChange={(e) => set({ c2: e.target.value })} className="h-9 w-9 cursor-pointer rounded border border-line-2 bg-surface p-0.5" /></label></div>}
      {l.kind === "image" && l.image && <div className="flex flex-wrap items-center gap-3"><Button size="sm" onClick={() => file.current?.click()}>Change picture</Button><Button size="sm" variant="danger" onClick={() => set({ kind: "preset", image: "" })}>Remove picture</Button><label className="flex items-center gap-2 text-xs text-muted">Darken <input type="range" min={0} max={80} value={l.dim} onChange={(e) => set({ dim: Number(e.target.value) })} className="accent-[var(--accent)]" /></label></div>}
      <Field label="Welcome message"><input className={inputCls} value={l.message} maxLength={80} onChange={(e) => set({ message: e.target.value })} /></Field>
      <div className="grid h-52 place-items-center overflow-hidden rounded-[10px] border border-line p-4" style={{ background: loginBackground(l) }}>
        <div className="grid w-56 gap-1.5 rounded-[10px] border border-[#21363f] bg-[rgb(18_30_37/.86)] p-3.5 text-[11px] text-[#e1e8ed] shadow-xl"><b className="text-xs">Sign-in preview</b><span className="text-[#8ea0aa]">{l.message}</span><i className="block h-4 rounded bg-[#0e181d]" /><i className="block h-4 rounded bg-[#0e181d]" /><i className="block h-5 rounded bg-accent" /></div>
      </div>
    </div>
  );
}

function AppearanceSettings() {
  const { appearance: ap, setAppearance } = useSession();
  const swatch = (list: [string, string][], value: string, onPick: (v: string) => void, label: string) => (
    <div className="flex flex-wrap items-center gap-2 md:justify-end">
      {list.map(([n, h]) => <button key={h} title={n} aria-label={n} aria-pressed={value.toLowerCase() === h} onClick={() => onPick(h)} className={cx("grid h-[30px] w-[30px] place-items-center rounded-full border-2 border-surface text-white", value.toLowerCase() === h ? "ring-2 ring-ink" : "ring-1 ring-line-2")} style={{ background: h }}>{value.toLowerCase() === h && <Check size={14} strokeWidth={3} />}</button>)}
      <label className="flex items-center gap-1.5 text-xs text-muted" title="Pick any color"><input type="color" aria-label={`Custom ${label}`} value={value} onChange={(e) => onPick(e.target.value)} className="h-[34px] w-[34px] cursor-pointer rounded-lg border border-line-2 bg-surface p-0.5" />Custom</label>
    </div>
  );
  return (
    <Card pad={false} footer={<><span className="text-xs text-muted">Appearance is saved in this browser.</span><span className="flex-1" /><Button variant="danger" onClick={() => setAppearance(structuredClone(DEFAULT_APPEARANCE))}>Reset appearance</Button></>}>
      <div className="flex items-center gap-3 border-b border-line px-4.5 py-4"><span className="grid h-9 w-9 place-items-center rounded-lg bg-accent-soft text-accent"><Palette size={18} /></span><div><b className="block">Appearance</b><span className="text-[12.5px] text-muted">Theme, colors and the sign-in screen</span></div></div>
      <Row label="Theme" hint="Light, dark, or follow the device">
        <div className="inline-flex overflow-hidden rounded-[7px] border border-line-2">
          {([["light", "Light", Sun], ["dark", "Dark", Moon], ["system", "System", Monitor]] as const).map(([k, l, I]) => <button key={k} onClick={() => setAppearance({ ...ap, mode: k })} className={cx("flex items-center gap-1.5 border-l border-line-2 px-3 py-1.5 text-[12.5px] first:border-l-0", ap.mode === k ? "bg-accent-soft font-semibold text-accent" : "text-ink-2")}><I size={14} />{l}</button>)}
        </div>
      </Row>
      <Row label="Accent color" hint="Buttons, highlights, charts and links">{swatch(ACCENTS, ap.accent, (v) => setAppearance({ ...ap, accent: v }), "accent color")}</Row>
      <Row label="Sidebar color" hint="Background of the navigation menu">{swatch(SIDEBARS, ap.sidebar, (v) => setAppearance({ ...ap, sidebar: v }), "sidebar color")}</Row>
      <div className="grid gap-3 border-t border-line px-4.5 py-4"><div><b className="block text-[13.5px]">Sign-in screen background</b><span className="text-[12.5px] text-muted">A preset, your own two colors, or a picture</span></div><LoginBackgroundControls appearance={ap} setAppearance={setAppearance} /></div>
    </Card>
  );
}

function Account() {
  const s = useSession();
  const { busy, run } = useAction();
  const [cur, setCur] = useState(""); const [pw, setPw] = useState(""); const [pw2, setPw2] = useState("");
  return (
    <Card title="My account">
      <div className="grid max-w-md gap-3.5">
        <p className="m-0 text-[13px]">Signed in as <b>{s.me.username}</b> ({s.me.role}).</p>
        <Field label="Current password"><input className={inputCls} type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></Field>
        <Field label="New password" hint="At least 10 characters. Other devices will be signed out."><input className={inputCls} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
        <Field label="Confirm new password" error={pw2 && pw !== pw2 ? "Passwords do not match." : null}><input className={inputCls} type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></Field>
        <div><Button variant="primary" disabled={busy || !cur || pw.length < 10 || pw !== pw2} onClick={() => run(async () => { await api("/api/auth/password", { body: { currentPassword: cur, newPassword: pw } }); setCur(""); setPw(""); setPw2(""); }, "Password changed")}>Change password</Button></div>
      </div>
    </Card>
  );
}

function Sessions() {
  const { data, reload } = useLoad<any[]>(() => api("/api/auth/sessions"));
  const { run } = useAction();
  return (
    <Card title="Signed-in devices" pad={false}>
      <Table head={["User", "Device", "Address", "Last active", ""]}>
        {data?.map((x) => <tr key={x.id}><td><b>{x.username}</b></td><td className="max-w-72 truncate text-xs text-muted" title={x.userAgent}>{x.userAgent ?? "—"}</td><td className="font-mono text-xs">{x.ip}</td><td className="text-muted">{rel(x.lastSeenAt)}</td>
          <td className="text-right">{x.id.endsWith(":current") ? <Pill tone="acc">This device</Pill> : <Button size="sm" variant="danger" onClick={() => run(async () => { await api(`/api/auth/sessions/${x.id}`, { method: "DELETE" }); reload(); }, "Signed out")}>Sign out</Button>}</td></tr>)}
      </Table>
    </Card>
  );
}
