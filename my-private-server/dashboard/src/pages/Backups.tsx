import { useState } from "react";
import { Archive, Play, Plus, RotateCcw, ShieldCheck } from "lucide-react";
import { api, fmtBytes, fmtDate, rel } from "../api";
import { Button, Card, Confirm, Empty, Field, Modal, PageError, Pill, Table, Toggle, inputCls, useAction, useLoad } from "../ui";

const TYPES = [["Files", "Chosen folders"], ["Database", "PostgreSQL databases"], ["Application", "Websites, apps and their databases"], ["Configuration", "Server settings and keys"], ["FullServer", "Everything"]];
const tone = (s: string) => (s === "Succeeded" ? "ok" : s === "Failed" ? "bad" : s === "Running" ? "info" : "warn") as any;

export default function BackupsPage() {
  const jobs = useLoad<any[]>(() => api("/api/backups/jobs"), [], 10000);
  const runs = useLoad<any[]>(() => api("/api/backups/runs"), [], 5000);
  const { busy, run } = useAction();
  const [edit, setEdit] = useState<any>(null);
  const [restore, setRestore] = useState<any>(null);
  const [del, setDel] = useState<any>(null);

  return (
    <div className="grid gap-4">
      <Card title="Backup jobs" icon={<Archive size={15} />} pad={false} actions={<Button size="sm" variant="primary" onClick={() => setEdit({})}><Plus size={15} /> New backup</Button>}
        footer={<span className="text-xs text-muted">Backups are copied to another drive, an external disk or a network share. Nothing is uploaded to any cloud.</span>}>
        {jobs.error && <div className="p-4"><PageError error={jobs.error} /></div>}
        {jobs.data?.length === 0 ? <Empty icon={<Archive size={40} />} title="No backups configured">Protect your files and databases with an automatic backup to another drive.</Empty> : (
          <Table head={["Backup", "What", "Schedule", "Destination", "Last run", "Next run", ""]}>
            {jobs.data?.map(({ job: j, next, last, warnings }) => <tr key={j.id}>
              <td><b>{j.name}</b>{!j.enabled && <Pill>Paused</Pill>}</td>
              <td>{TYPES.find((t) => t[0] === j.type)?.[1]}{j.type === "Files" && <small className="block text-xs text-muted">{j.sources.join(", ")}</small>}</td>
              <td>{j.frequency === "Manual" ? "Manual" : j.frequency === "Weekly" ? `Weekly · ${j.day} ${j.time}` : `Daily · ${j.time}`}<small className="block text-xs text-muted">keep last {j.keepLast}</small></td>
              <td className="max-w-56"><span className="break-all font-mono text-xs">{j.destination}</span>{warnings.map((w: string) => <small key={w} className="block text-xs text-warn">{w}</small>)}</td>
              <td>{last ? <><Pill tone={tone(last.status)} dot>{last.status === "CompletedWithWarnings" ? "Completed" : last.status}</Pill><small className="block text-xs text-muted">{rel(last.startedAt)}</small></> : <span className="text-muted">never</span>}</td>
              <td className="text-muted">{next ? fmtDate(next) : "—"}</td>
              <td className="whitespace-nowrap text-right">
                <Button size="sm" variant="primary" disabled={busy || last?.status === "Running"} onClick={() => run(async () => { await api(`/api/backups/jobs/${j.id}/run`, { method: "POST" }); setTimeout(runs.reload, 800); }, "Backup started")}><Play size={14} /> Backup now</Button>{" "}
                <Button size="sm" onClick={() => setEdit(j)}>Edit</Button>{" "}
                <Button size="sm" variant="danger" onClick={() => setDel(j)}>Delete</Button>
              </td>
            </tr>)}
          </Table>
        )}
      </Card>
      <Card title="Backup history" icon={<ShieldCheck size={15} />} pad={false}>
        <Table head={["Started", "Backup", "Result", "Size", "Archives", ""]} empty="No backups have run yet.">
          {runs.data?.map((r) => <tr key={r.id}>
            <td className="whitespace-nowrap text-muted">{fmtDate(r.startedAt)}</td><td>{r.jobName}<small className="block text-xs text-muted">{r.trigger}</small></td>
            <td><Pill tone={tone(r.status)} dot>{r.status === "CompletedWithWarnings" ? "Completed with notes" : r.status}</Pill>{r.message && <small className="block max-w-80 text-xs text-muted">{r.message}</small>}</td>
            <td className="num">{fmtBytes(r.bytes)}</td><td className="num">{r.items}</td>
            <td className="whitespace-nowrap text-right">{r.status !== "Running" && r.status !== "Failed" && <>
              <Button size="sm" onClick={() => run(async () => { await api(`/api/backups/runs/${r.id}/verify`, { method: "POST" }); }, "Checksums verified. The backup is intact.")}>Verify</Button>{" "}
              <Button size="sm" onClick={() => run(async () => setRestore({ run: r, manifest: await api(`/api/backups/runs/${r.id}/verify`, { method: "POST" }) }))}><RotateCcw size={14} /> Restore</Button></>}
            </td>
          </tr>)}
        </Table>
      </Card>
      {edit && <JobModal job={edit} busy={busy} onClose={() => setEdit(null)} onSave={(j) => run(async () => { await api("/api/backups/jobs", { body: j }); setEdit(null); jobs.reload(); }, "Backup saved")} />}
      {restore && <RestoreModal data={restore} busy={busy} onClose={() => setRestore(null)} onRestore={(artifact, overwrite) => run(async () => {
        const r = await api(`/api/backups/runs/${restore.run.id}/restore`, { body: { artifact, overwriteOriginal: overwrite } }); setRestore(null); return r;
      }, "Restore completed")} />}
      {del && <Confirm title={`Delete backup job “${del.name}”?`} confirmLabel="Delete" onClose={() => setDel(null)} message="Backups already written to the destination are kept." onConfirm={() => run(async () => { await api(`/api/backups/jobs/${del.id}`, { method: "DELETE" }); jobs.reload(); }, "Deleted")} />}
    </div>
  );
}

function JobModal({ job, onSave, onClose, busy }: { job: any; onSave: (j: any) => void; onClose: () => void; busy: boolean }) {
  const dests = useLoad<any[]>(() => api("/api/backups/destinations"));
  const [j, setJ] = useState({ id: job.id ?? "", name: job.name ?? "Nightly backup", type: job.type ?? "Files", sources: (job.sources ?? ["Shared", "Users"]).join(", "), destination: job.destination ?? "",
    frequency: job.frequency ?? "Daily", time: job.time ?? "02:00", day: job.day ?? "Sunday", keepLast: job.keepLast ?? 14, enabled: job.enabled ?? true });
  return (
    <Modal wide title={job.id ? "Edit backup" : "New backup"} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy} onClick={() => onSave({ ...j, sources: j.type === "Files" || j.type === "Database" ? j.sources.split(/[,\n]+/).map((x: string) => x.trim()).filter(Boolean) : [], keepLast: Number(j.keepLast), createdAt: job.createdAt ?? new Date().toISOString() })}>Save</Button></>}>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Name"><input className={inputCls} value={j.name} onChange={(e) => setJ({ ...j, name: e.target.value })} /></Field>
        <Field label="What to back up"><select className={inputCls} value={j.type} onChange={(e) => setJ({ ...j, type: e.target.value })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        {(j.type === "Files" || j.type === "Database") && <div className="sm:col-span-2"><Field label={j.type === "Files" ? "Folders" : "Databases (empty = all)"} hint={j.type === "Files" ? "Folders inside the storage folder, comma separated: Shared, Users, Shared/Accounting" : "Comma separated"}>
          <input className={inputCls} value={j.sources} onChange={(e) => setJ({ ...j, sources: e.target.value })} /></Field></div>}
        <div className="sm:col-span-2"><Field label="Destination" hint="Another drive, an external disk, or a network share like \\nas\backups">
          <input className={inputCls + " font-mono"} value={j.destination} onChange={(e) => setJ({ ...j, destination: e.target.value })} list="dest-list" />
          <datalist id="dest-list">{dests.data?.map((d) => <option key={d.suggested} value={d.suggested}>{d.label}</option>)}</datalist>
        </Field>
          <div className="mt-2 flex flex-wrap gap-1.5">{dests.data?.map((d) => <button type="button" key={d.suggested} onClick={() => setJ({ ...j, destination: d.suggested })} className="rounded-md border border-line px-2 py-1 text-xs hover:border-accent">{d.label} <span className="text-muted">{d.root}</span>{d.warnings.length > 0 && <span className="text-warn"> ⚠</span>}</button>)}</div>
        </div>
        <Field label="Schedule"><select className={inputCls} value={j.frequency} onChange={(e) => setJ({ ...j, frequency: e.target.value })}><option>Daily</option><option>Weekly</option><option>Manual</option></select></Field>
        <Field label="Time"><input className={inputCls} type="time" value={j.time} onChange={(e) => setJ({ ...j, time: e.target.value })} /></Field>
        {j.frequency === "Weekly" && <Field label="Day"><select className={inputCls} value={j.day} onChange={(e) => setJ({ ...j, day: e.target.value })}>{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d) => <option key={d}>{d}</option>)}</select></Field>}
        <Field label="Keep the last" hint="Older backups are removed automatically."><input className={inputCls} type="number" min={1} max={365} value={j.keepLast} onChange={(e) => setJ({ ...j, keepLast: e.target.value as any })} /></Field>
        <label className="flex items-center gap-2.5 text-[13px]"><Toggle on={j.enabled} onChange={(v) => setJ({ ...j, enabled: v })} label="Enabled" /> Run on schedule</label>
      </div>
    </Modal>
  );
}

function RestoreModal({ data, onRestore, onClose, busy }: { data: any; onRestore: (a: string, o: boolean) => void; onClose: () => void; busy: boolean }) {
  const restorable = data.manifest.artifacts.filter((a: any) => a.kind !== "configuration");
  const [artifact, setArtifact] = useState(restorable[0]?.file ?? "");
  const [overwrite, setOverwrite] = useState(false);
  const chosen = restorable.find((a: any) => a.file === artifact);
  return (
    <Modal title="Restore from backup" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || !artifact} onClick={() => onRestore(artifact, overwrite)}>{busy ? "Restoring…" : "Restore"}</Button></>}>
      <div className="grid gap-3.5 text-[13px]">
        <p className="m-0">Backup from {fmtDate(data.manifest.createdAt)}. Checksums verified.</p>
        <Field label="Restore"><select className={inputCls} value={artifact} onChange={(e) => setArtifact(e.target.value)}>{restorable.map((a: any) => <option key={a.file} value={a.file}>{a.kind === "database" ? `Database ${a.source}` : `Folder ${a.source}`} ({fmtBytes(a.bytes)})</option>)}</select></Field>
        {chosen?.kind === "files" && <label className="flex items-start gap-2.5"><Toggle on={overwrite} onChange={setOverwrite} label="Overwrite" /><span>{overwrite ? "Put files back in their original folder, replacing current versions." : "Restore into a new folder under Shared (nothing is overwritten)."}</span></label>}
        {chosen?.kind === "database" && <p className="m-0 rounded-md bg-warn-soft px-3 py-2 text-warn">The database's current contents are replaced.</p>}
        {data.manifest.artifacts.some((a: any) => a.kind === "configuration") && <p className="m-0 text-xs text-muted">Configuration archives are restored manually (see the server documentation).</p>}
      </div>
    </Modal>
  );
}
