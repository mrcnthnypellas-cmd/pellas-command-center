import { HardDrive } from "lucide-react";
import { api, fmtBytes } from "../api";
import { Card, Donut, KV, Meter, PageError, Pill, Table, useLoad } from "../ui";

export default function StoragePage() {
  const { data, error, reload } = useLoad<any>(() => api("/api/storage"), [], 30000);
  const st = data?.status;
  const used = st ? st.totalBytes - st.freeBytes : 0;
  return (
    <div className="grid gap-4">
      {error && <PageError error={error} retry={reload} />}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card title="Storage folder" icon={<HardDrive size={15} />}>
          {st && <div className="flex flex-wrap items-center gap-5">
            <Donut pct={st.totalBytes ? (used / st.totalBytes) * 100 : 0} label="used" />
            <div className="min-w-44 flex-1"><KV rows={[["Status", st.online ? <Pill tone="ok" dot>Online</Pill> : <Pill tone="bad" dot>Offline</Pill>], ["Capacity", fmtBytes(st.totalBytes)], ["Used", fmtBytes(used)], ["Free", fmtBytes(st.freeBytes)]]} /></div>
          </div>}
          {st?.problem && <p className="mb-0 mt-3 rounded-md bg-warn-soft px-3 py-2 text-[13px] text-warn">{st.problem}</p>}
          {st?.root && <p className="mb-0 mt-3 text-xs text-muted">Folder: <code className="font-mono">{st.root}</code></p>}
        </Card>
        <Card title="Drives in this PC" icon={<HardDrive size={15} />} pad={false} footer={<span className="text-xs text-muted">Read-only detection. The server never formats or erases a drive.</span>}>
          <Table head={["Drive", "Type", "Capacity", "Free", "Health", ""]}>
            {data?.drives.map((d: any) => (
              <tr key={d.id}>
                <td><b>{d.root}</b> <span className="text-muted">{d.label}</span>{d.model && <small className="block text-xs text-muted">{d.model}</small>}</td>
                <td>{d.kind} · {d.fileSystem || "—"}</td>
                <td className="num">{fmtBytes(d.totalBytes)}</td>
                <td className="min-w-32"><div className="grid gap-1"><span className="num text-xs">{fmtBytes(d.freeBytes)}</span><Meter pct={d.totalBytes ? ((d.totalBytes - d.freeBytes) / d.totalBytes) * 100 : 0} /></div></td>
                <td>{d.health ? <Pill tone={d.health === "Healthy" ? "ok" : "warn"}>{d.health}</Pill> : <span className="text-muted">—</span>}</td>
                <td>{d.isSystem && <Pill tone="warn">System</Pill>} {d.recommended && <Pill tone="ok">Best for data</Pill>}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
      {data?.folders?.length > 0 && <Card title="Folder layout" pad={false}>
        <Table head={["Folder", "Location"]}>{data.folders.map((f: any) => <tr key={f.name}><td><b>{f.name}</b></td><td className="font-mono text-xs text-muted">{f.path}</td></tr>)}</Table>
      </Card>}
    </div>
  );
}
