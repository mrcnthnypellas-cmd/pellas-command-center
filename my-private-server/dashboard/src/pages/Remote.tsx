import { useEffect, useState } from "react";
import { CheckCircle2, Cloud, ExternalLink, Globe, Info, Laptop, Lock, Router, Server, ShieldAlert, Smartphone, XCircle, AlertTriangle } from "lucide-react";
import { api, fmtDate, rel } from "../api";
import { useSession } from "../session";
import { Button, Card, Dot, Field, KV, PageError, Pill, Table, Toggle, cx, inputCls, useAction, useLoad } from "../ui";

type Option = { key: string; label: string; help: string; secret: boolean; required: boolean; placeholder?: string };
type Provider = { id: string; name: string; summary: string; cost: string; howItWorks: string; needs: string[]; options: Option[]; supportsDirect: boolean; supportsRelay: boolean; encryption: string;
  disclosure: { dataTransmitted: string; purpose: string; destination: string }; executableFound: boolean; installHelp?: string };
type Status = { state: string; method: string; encryption: string; providerId: string; providerName: string; accessAddresses: string[]; relayRequired: boolean | null; reason?: string; actionUrl?: string;
  peers: { name: string; os?: string; online: boolean; method: string; via?: string; lastSeen?: string }[]; checkedAt: string; lastConnectedAt?: string };
type View = { serverId: string; enabled: boolean; providerId: string; status: Status; providers: Provider[]; options: Record<string, string>; events: { at: string; level: string; message: string }[]; local: string[] };
type Check = { name: string; outcome: "Pass" | "Warn" | "Fail" | "Info"; detail: string };

const METHOD: Record<string, string> = { Direct: "Direct (same network)", NatTraversal: "NAT Traversal (peer-to-peer)", Relay: "Relay", Tunnel: "HTTPS tunnel", Pending: "Ready (chosen when a device connects)", None: "—" };

export default function RemotePage() {
  const s = useSession();
  const { data, error, reload } = useLoad<View>(() => api("/api/remote-access"), [], 8000);
  const { busy, run } = useAction();
  const [provider, setProvider] = useState<string | null>(null);
  const [opts, setOpts] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [stun, setStun] = useState(false);

  useEffect(() => { if (data && provider === null) { setProvider(data.providerId); setOpts(data.options); } }, [data, provider]);
  if (error) return <PageError error={error} retry={reload} />;
  if (!data) return <p className="text-muted">Loading…</p>;

  const st = data.status;
  const on = st.state === "Connected";
  const tone = on ? "ok" : st.state === "Disabled" ? "none" : st.state === "Starting" || st.state === "NeedsSetup" ? "warn" : "bad";
  const chosen = data.providers.find((p) => p.id === provider) ?? data.providers[0];

  return (
    <div className="grid gap-4">
      <section className="grid overflow-hidden rounded-[10px] border border-line bg-surface lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="grid content-start gap-3.5 border-b border-line p-5.5 lg:border-b-0 lg:border-r">
          <span className="text-[13px] font-semibold uppercase tracking-[.08em] text-muted">Remote access</span>
          <div className={cx("flex items-center gap-3 text-[28px] font-bold tracking-wide", tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-muted")}>
            <Dot tone={tone as any} pulse={on} />{st.state === "Disabled" ? "OFF" : st.state === "NeedsSetup" ? "NEEDS SETUP" : st.state.toUpperCase()}
          </div>
          <p className="m-0 text-[13px] text-ink-2">{st.reason}</p>
          {st.actionUrl && <a className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent" href={st.actionUrl} target="_blank" rel="noreferrer">Finish sign-in <ExternalLink size={14} /></a>}
          <div className="flex flex-wrap gap-2">
            {data.enabled ? <>
              <Button disabled={busy} onClick={() => run(async () => { await api("/api/remote-access/reconnect", { method: "POST" }); reload(); }, "Reconnecting")}>Reconnect</Button>
              <Button disabled={busy} onClick={() => run(async () => setChecks(await api("/api/remote-access/test", { body: { stun } })))}>Test Connection</Button>
              <Button variant="danger" disabled={busy} onClick={() => run(async () => { await api("/api/remote-access/disable", { method: "POST" }); reload(); }, "Remote access turned off")}>Disable Remote Access</Button>
            </> : <Button variant="primary" disabled={busy} onClick={() => run(async () => { await api("/api/remote-access/enable", { body: { providerId: chosen.id, options: opts } }); reload(); })}>Enable Remote Access</Button>}
          </div>
        </div>
        <div className="p-5.5">
          <KV rows={[
            ["Status", <Pill tone={tone as any} dot>{st.state === "Disabled" ? "Off (local network only)" : st.state}</Pill>],
            ["Server ID", <span className="font-mono">{data.serverId}</span>],
            ["Connection", METHOD[st.method] ?? st.method],
            ["Encryption", on ? <span className="inline-flex items-center gap-1.5"><Lock size={13} className="text-ok" />{st.encryption}</span> : "—"],
            ["Relay", st.relayRequired === null || st.relayRequired === undefined ? (on ? "Not in use right now" : "—") : st.relayRequired ? "In use (direct connection unavailable)" : "Not Required"],
            ["Method", data.enabled ? st.providerName : "—"],
            ["Last Connection", st.lastConnectedAt ? `${fmtDate(st.lastConnectedAt)} (${rel(st.lastConnectedAt)})` : "—"],
            ["Remote address", st.accessAddresses.length ? <span className="grid gap-0.5">{st.accessAddresses.map((a) => <a key={a} className="font-mono text-accent" href={a} target="_blank" rel="noreferrer">{a}</a>)}</span> : "—"],
            ["On this network", <span className="grid gap-0.5">{data.local.map((a) => <span key={a} className="font-mono">{a}</span>)}</span>],
            ["Port forwarding", <Pill tone="ok">Not required</Pill>],
          ]} />
        </div>
      </section>

      {checks && <Card title="Connection test" icon={<CheckCircle2 size={15} />} actions={<Button size="sm" variant="ghost" onClick={() => setChecks(null)}>Close</Button>}>
        <ul className="m-0 grid list-none gap-2 p-0">
          {checks.map((c, i) => <li key={i} className="flex gap-2.5 text-[13px]">
            {c.outcome === "Pass" ? <CheckCircle2 size={17} className="flex-none text-ok" /> : c.outcome === "Fail" ? <XCircle size={17} className="flex-none text-bad" /> : c.outcome === "Warn" ? <AlertTriangle size={17} className="flex-none text-warn" /> : <Info size={17} className="flex-none text-info" />}
            <span><b>{c.name}.</b> {c.detail}</span></li>)}
        </ul>
      </Card>}

      <Card title="How your devices reach this server" icon={<Globe size={15} />}>
        <div className="flex items-center overflow-x-auto pb-1">
          {[[Smartphone, "Phone, tablet, laptop", "Anywhere with Internet"], [Cloud, "Coordination / relay", on && st.method === "Relay" || st.method === "Tunnel" ? "Carrying encrypted traffic" : "Helps devices find each other"], [Router, "Your router (NAT/CGNAT)", "No port forwarding"], [Server, s.serverName, "Connects out, never exposed"]].map(([Icon, t, sub]: any, i, a) => (
            <div key={i} className="flex flex-1 items-center">
              <div className="grid min-w-[110px] justify-items-center gap-1.5 text-center"><div className={cx("grid h-12 w-12 place-items-center rounded-xl border", (i === 0 || i === 3) && on ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface-2 text-ink-2")}><Icon size={22} /></div><b className="text-[12.5px]">{t}</b><small className="max-w-[140px] text-[11.5px] text-muted">{sub}</small></div>
              {i < a.length - 1 && <div className={cx("mx-1 mb-10 h-0.5 min-w-8 flex-1", on ? "bg-[repeating-linear-gradient(90deg,var(--accent)_0_6px,transparent_6px_12px)]" : "bg-[repeating-linear-gradient(90deg,var(--line-2)_0_6px,transparent_6px_12px)]")} />}
            </div>
          ))}
        </div>
        <p className="mb-0 mt-3 text-[12.5px] text-muted">The server always makes the outgoing connection, so it works behind NAT, carrier-grade NAT (CGNAT) and changing IP addresses. When two networks are both very strict, a relay is needed. With the WireGuard method the relay only forwards encrypted packets it cannot read.</p>
      </Card>

      {st.peers.length > 0 && <Card title="Connected devices" icon={<Laptop size={15} />} pad={false}>
        <Table head={["Device", "Status", "Connection", "Via"]}>
          {st.peers.map((p) => <tr key={p.name}><td><b>{p.name}</b> <span className="text-muted">{p.os}</span></td><td>{p.online ? <Pill tone="ok" dot>Online</Pill> : <Pill>Offline</Pill>}</td><td>{METHOD[p.method] ?? p.method}</td><td className="font-mono text-xs text-muted">{p.via ?? "—"}</td></tr>)}
        </Table>
      </Card>}

      <Card title="Connection method" icon={<Globe size={15} />} footer={<span className="text-xs text-muted">No method requires a paid subscription. You can switch at any time.</span>}>
        <div className="grid gap-2.5 md:grid-cols-3">
          {data.providers.map((p) => (
            <button key={p.id} onClick={() => { setProvider(p.id); setOpts(p.id === data.providerId ? data.options : {}); }}
              className={cx("grid min-w-0 content-start gap-1.5 rounded-lg border-[1.5px] p-3.5 text-left", provider === p.id ? "border-accent bg-accent-soft" : "border-line hover:border-line-2")}>
              <b className="text-[13.5px]">{p.name}</b>
              <span className="text-[12.5px] text-ink-2">{p.summary}</span>
              <span className="flex flex-wrap gap-1.5"><Pill tone="ok" wrap>{p.cost}</Pill>{p.supportsDirect && <Pill tone="info">Peer-to-peer</Pill>}{p.executableFound ? <Pill tone="acc">Installed</Pill> : <Pill tone="warn">Not installed</Pill>}</span>
            </button>
          ))}
        </div>
        {chosen && <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="grid content-start gap-3">
            <p className="m-0 text-[13px] text-ink-2">{chosen.howItWorks}</p>
            <div className="text-[13px]"><b>You need:</b><ul className="my-1 pl-5 text-ink-2">{chosen.needs.map((n) => <li key={n}>{n}</li>)}</ul></div>
            {chosen.installHelp && <p className="m-0 rounded-md bg-warn-soft px-3 py-2 text-[13px] text-warn">{chosen.installHelp}</p>}
            <div className="rounded-lg border border-line bg-surface-2 p-3 text-[12.5px]">
              <b className="mb-1 flex items-center gap-1.5"><ShieldAlert size={14} /> External service</b>
              <div><span className="text-muted">Data sent:</span> {chosen.disclosure.dataTransmitted}</div>
              <div><span className="text-muted">Why:</span> {chosen.disclosure.purpose}</div>
              <div><span className="text-muted">Where:</span> {chosen.disclosure.destination}</div>
            </div>
          </div>
          <form className="grid content-start gap-3" onSubmit={(e) => { e.preventDefault(); run(async () => { await api("/api/remote-access/enable", { body: { providerId: chosen.id, options: opts } }); reload(); }); }}>
            {chosen.options.map((o) => (
              <Field key={o.key} label={o.label + (o.required ? "" : " (optional)")} hint={o.help}>
                <input className={inputCls} type={o.secret ? "password" : "text"} placeholder={o.placeholder} value={opts[o.key] ?? ""} onChange={(e) => setOpts({ ...opts, [o.key]: e.target.value })} autoComplete="off" />
              </Field>
            ))}
            <label className="flex items-center gap-2.5 text-[13px]"><Toggle on={stun} onChange={setStun} label="Include NAT test" /> Include a NAT/CGNAT test when testing (contacts public STUN servers)</label>
            <div className="flex gap-2"><Button variant="primary" type="submit" disabled={busy}>{data.enabled && data.providerId === chosen.id ? "Save and reconnect" : "Use this method"}</Button></div>
          </form>
        </div>}
      </Card>

      <Card title="Recent events" pad={false}>
        <Table head={["Time", "Event"]} empty="No events yet.">
          {data.events.slice(0, 15).map((e, i) => <tr key={i}><td className="whitespace-nowrap text-muted">{fmtDate(e.at)}</td><td className={e.level === "warn" ? "text-warn" : e.level === "ok" ? "text-ok" : ""}>{e.message}</td></tr>)}
        </Table>
      </Card>
    </div>
  );
}
