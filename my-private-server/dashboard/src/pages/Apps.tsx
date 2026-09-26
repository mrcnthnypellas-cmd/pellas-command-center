import { useState } from "react";
import { Code2, KeyRound, Plus, Table2, Trash2 } from "lucide-react";
import { api, fmtDate, rel } from "../api";
import { Button, Card, Confirm, Empty, Field, KV, Modal, PageError, Pill, Secret, Table, inputCls, useAction, useLoad } from "../ui";

export default function AppsPage() {
  const list = useLoad<any[]>(() => api("/api/apps"));
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<any>(null);
  const { busy, run } = useAction();

  return (
    <div className="grid gap-4">
      <Card title="Your apps" icon={<Code2 size={15} />} pad={false} actions={<Button size="sm" variant="primary" onClick={() => setCreating(true)}><Plus size={15} /> New app</Button>}
        footer={<span className="text-xs text-muted">Each app gets its own PostgreSQL database, API keys, sign-in for your app's users, and file storage, all on this PC.</span>}>
        {list.error && <div className="p-4"><PageError error={list.error} retry={list.reload} /></div>}
        {list.data?.length === 0 ? <Empty icon={<Code2 size={40} />} title="No apps yet">Create an app to get a database and a REST API for a website or mobile app.</Empty> : (
          <Table head={["App", "Database", "Created", ""]}>
            {list.data?.map((a) => <tr key={a.id}><td><b>{a.slug}</b></td><td className="font-mono text-xs">{a.database}</td><td className="text-muted">{rel(a.createdAt)}</td><td className="text-right"><Button size="sm" onClick={() => setOpen(a.slug)}>Open</Button></td></tr>)}
          </Table>
        )}
      </Card>
      {open && <AppDetail slug={open} onClose={() => setOpen(null)} onDeleted={() => { setOpen(null); list.reload(); }} />}
      {creating && <NewApp busy={busy} onClose={() => setCreating(false)} onSave={(name) => run(async () => { setCreated(await api("/api/apps", { body: { name } })); setCreating(false); list.reload(); })} />}
      {created && <Modal title={`App “${created.app.slug}” created`} onClose={() => setCreated(null)} footer={<Button variant="primary" onClick={() => setCreated(null)}>I've saved it</Button>}>
        <div className="grid gap-3">
          <p className="m-0 text-[13px]">Database credentials for your server-side code. The password is stored encrypted and is only shown again through an audited reveal.</p>
          <Secret label="Connection string" value={created.connection.uri} />
          <p className="m-0 text-xs text-muted">Next: create an API key for your website or mobile app.</p>
        </div>
      </Modal>}
    </div>
  );
}

function NewApp({ onSave, onClose, busy }: { onSave: (n: string) => void; onClose: () => void; busy: boolean }) {
  const [n, setN] = useState("");
  return (
    <Modal title="New app" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || !n} onClick={() => onSave(n)}>{busy ? "Creating…" : "Create app"}</Button></>}>
      <Field label="App name" hint="Lowercase letters, numbers and dashes, e.g. inventory or company-portal."><input className={inputCls} value={n} onChange={(e) => setN(e.target.value.toLowerCase())} autoFocus /></Field>
    </Modal>
  );
}

function AppDetail({ slug, onClose, onDeleted }: { slug: string; onClose: () => void; onDeleted: () => void }) {
  const d = useLoad<any>(() => api(`/api/apps/${slug}`), [slug]);
  const { busy, run } = useAction();
  const [newKey, setNewKey] = useState<string | null>(null);
  const [keyName, setKeyName] = useState(""); const [scope, setScope] = useState("Read");
  const [envKey, setEnvKey] = useState(""); const [envVal, setEnvVal] = useState("");
  const [origins, setOrigins] = useState<string | null>(null);
  const [reveal, setReveal] = useState<any>(null);
  const [del, setDel] = useState(false);
  const base = `${location.origin}/api/data/${slug}`;
  const data = d.data;

  return (
    <Modal wide title={`App: ${slug}`} onClose={onClose} footer={<><Button variant="danger" onClick={() => setDel(true)}><Trash2 size={14} /> Delete app</Button><span className="flex-1" /><Button onClick={onClose}>Close</Button></>}>
      {d.error && <PageError error={d.error} />}
      {data && <div className="grid gap-5">
        <KV rows={[["Database", <span className="font-mono">{data.app.database}</span>], ["REST endpoint", <span className="font-mono text-xs">{base}/rest/&#123;table&#125;</span>], ["App user sign-in", <span className="font-mono text-xs">{base}/auth/login</span>], ["File storage", <span className="font-mono text-xs">{base}/storage/&#123;path&#125;</span>]]} />
        <section className="grid gap-2">
          <h3 className="m-0 flex items-center gap-2 text-sm"><KeyRound size={15} /> API keys</h3>
          <Table head={["Name", "Key", "Access", "Last used", ""]} empty="No keys yet.">
            {data.keys.map((k: any) => <tr key={k.id}><td>{k.name}</td><td className="font-mono text-xs">{k.prefix}…</td><td><Pill tone={k.scope === "Write" ? "warn" : "info"}>{k.scope === "Write" ? "Read & write" : "Read only"}</Pill></td><td className="text-muted">{rel(k.lastUsedAt)}</td>
              <td className="text-right"><Button size="sm" variant="danger" onClick={() => run(async () => { await api(`/api/apps/${slug}/keys/${k.id}`, { method: "DELETE" }); d.reload(); }, "Key revoked")}>Revoke</Button></td></tr>)}
          </Table>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Key name"><input className={inputCls} value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="website" /></Field>
            <Field label="Access"><select className={inputCls} value={scope} onChange={(e) => setScope(e.target.value)}><option value="Read">Read only (safe in a browser)</option><option value="Write">Read &amp; write (server only)</option></select></Field>
            <Button disabled={busy} onClick={() => run(async () => { const r = await api(`/api/apps/${slug}/keys`, { body: { name: keyName, scope } }); setNewKey(r.key); d.reload(); })}>Create key</Button>
          </div>
          {newKey && <div className="grid gap-1"><Secret value={newKey} /><span className="text-xs text-warn">Copy this key now. Only a fingerprint is stored.</span></div>}
          <pre className="m-0 overflow-x-auto rounded-md bg-surface-2 p-3 font-mono text-[12px]">{`fetch("${base}/rest/items?select=name,qty&qty=gte.5&order=qty.desc", {
  headers: { apikey: "mps_…" }
})`}</pre>
        </section>
        <section className="grid gap-2">
          <h3 className="m-0 flex items-center gap-2 text-sm"><Table2 size={15} /> Tables</h3>
          {Array.isArray(data.tables) ? (data.tables.length ? <div className="flex flex-wrap gap-1.5">{data.tables.map((t: any) => <Pill key={t.table} tone="acc">{t.table} · {t.columns.length} columns</Pill>)}</div>
            : <p className="m-0 text-[13px] text-muted">No tables yet. Create them with any PostgreSQL tool using the app's connection string, or from a deployment's migrations.</p>) : <p className="m-0 text-[13px] text-warn">{data.tables.error}</p>}
          <p className="m-0 text-xs text-muted">Row-level security works: requests with an app-user token expose the user id as <code>current_setting('request.jwt.claim.sub')</code>.</p>
        </section>
        <section className="grid gap-2">
          <h3 className="m-0 text-sm">Environment variables</h3>
          <div className="flex flex-wrap gap-1.5">{data.env.map((k: string) => <span key={k} className="inline-flex items-center gap-1"><Pill>{k}</Pill><button className="text-muted hover:text-bad" aria-label={`Remove ${k}`} onClick={() => run(async () => { await api(`/api/apps/${slug}/env`, { method: "PUT", body: { key: k, value: null } }); d.reload(); })}><Trash2 size={13} /></button></span>)}{data.env.length === 0 && <span className="text-[13px] text-muted">None. DATABASE_URL is provided automatically to linked websites.</span>}</div>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Name"><input className={inputCls + " font-mono"} value={envKey} onChange={(e) => setEnvKey(e.target.value.toUpperCase())} placeholder="SMTP_PASSWORD" /></Field>
            <Field label="Value"><input className={inputCls} type="password" value={envVal} onChange={(e) => setEnvVal(e.target.value)} /></Field>
            <Button disabled={busy || !envKey} onClick={() => run(async () => { await api(`/api/apps/${slug}/env`, { method: "PUT", body: { key: envKey, value: envVal } }); setEnvKey(""); setEnvVal(""); d.reload(); }, "Saved (encrypted)")}>Save</Button>
          </div>
        </section>
        <section className="grid gap-2">
          <h3 className="m-0 text-sm">Allowed website origins (CORS)</h3>
          <p className="m-0 text-xs text-muted">For a frontend hosted elsewhere, for example on Vercel. One per line.</p>
          <textarea className={inputCls + " min-h-20 font-mono"} value={origins ?? data.app.allowedOrigins.join("\n")} onChange={(e) => setOrigins(e.target.value)} placeholder="https://myapp.vercel.app" />
          <div><Button disabled={busy || origins === null} onClick={() => run(async () => { await api(`/api/apps/${slug}/origins`, { method: "PUT", body: { origins: origins!.split("\n") } }); setOrigins(null); d.reload(); }, "Origins saved")}>Save origins</Button></div>
        </section>
        <section className="grid gap-2">
          <h3 className="m-0 text-sm">Database credentials</h3>
          {reveal ? <Secret value={reveal.uri} /> : <div><Button onClick={() => run(async () => setReveal(await api(`/api/apps/${slug}/connection/reveal`, { method: "POST" })))}>Reveal connection string</Button> <span className="text-xs text-muted">Each reveal is recorded in the activity log.</span></div>}
        </section>
        <p className="m-0 text-xs text-muted">Created {fmtDate(data.app.createdAt)}</p>
      </div>}
      {del && <Confirm title={`Delete app ${slug}?`} typeToConfirm={slug} confirmLabel="Delete app" onClose={() => setDel(false)} message="The app's database, users and keys are permanently deleted."
        onConfirm={() => run(async () => { await api(`/api/apps/${slug}?confirm=${slug}`, { method: "DELETE" }); onDeleted(); }, "App deleted")} />}
    </Modal>
  );
}
