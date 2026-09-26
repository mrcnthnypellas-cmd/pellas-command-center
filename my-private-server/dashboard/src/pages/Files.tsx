import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownAZ, ChevronRight, Copy, Download, Eye, FileText, Folder, FolderInput, FolderPlus, Grid2x2, Home, List, Pencil, RotateCcw, Search, Trash2, Upload, X } from "lucide-react";
import { api, ensureCsrf, fmtBytes, fmtDate, rel } from "../api";
import { Button, Card, Confirm, Empty, Field, Modal, PageError, Pill, Table, cx, inputCls, useAction, useLoad } from "../ui";

type Entry = { name: string; path: string; isDirectory: boolean; size: number; modified: string; access: "None" | "Read" | "ReadWrite" | "Full" };
type Listing = { path: string; name: string; access: Entry["access"]; entries: Entry[]; breadcrumbs: { name: string; path: string }[] };
type Transfer = { id: string; name: string; size: number; sent: number; state: "uploading" | "done" | "error" | "cancelled"; error?: string };

const CHUNK = 8 * 1024 * 1024;
const PREVIEW = /\.(png|jpe?g|gif|webp|bmp|pdf|txt|md|csv|log|json|mp4|webm|mp3|wav|ogg)$/i;
const canWrite = (a: Entry["access"]) => a === "ReadWrite" || a === "Full";

function badge(name: string) {
  const e = name.split(".").pop()?.toLowerCase() ?? "";
  const tone = e === "pdf" ? "bg-bad-soft text-bad" : ["xlsx", "xls", "csv"].includes(e) ? "bg-ok-soft text-ok" : ["docx", "doc", "txt", "md"].includes(e) ? "bg-info-soft text-info"
    : ["zip", "7z", "rar"].includes(e) ? "bg-warn-soft text-warn" : ["jpg", "jpeg", "png", "gif", "webp", "mp4", "mov", "mp3"].includes(e) ? "bg-vio-soft text-vio" : "bg-surface-3 text-ink-2";
  return <span className={cx("grid h-[34px] w-7 flex-none place-items-end justify-center rounded pb-1 text-[8.5px] font-bold", tone)}>{(e || "file").slice(0, 4).toUpperCase()}</span>;
}

/** Resumable upload: create a session, send 8 MB chunks, and resume from the server's offset after errors. */
async function uploadFile(folder: string, file: File, onProgress: (sent: number) => void, signal: AbortSignal) {
  const session = await api("/api/files/uploads", { body: { path: folder, fileName: file.name, size: file.size } });
  let offset = 0, failures = 0;
  const token = await ensureCsrf();
  while (offset < file.size || file.size === 0) {
    if (signal.aborted) { await api(`/api/files/uploads/${session.id}`, { method: "DELETE" }).catch(() => {}); throw new Error("Cancelled"); }
    const chunk = file.slice(offset, offset + CHUNK);
    try {
      const res = await fetch(`/api/files/uploads/${session.id}`, { method: "PATCH", body: chunk, signal, headers: { "Upload-Offset": String(offset), "X-MPS-CSRF": token }, credentials: "same-origin" });
      if (res.status === 409) { offset = Number(res.headers.get("Upload-Offset") ?? offset); continue; }
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Upload failed (${res.status})`);
      const body = await res.json();
      offset = body.session.received; failures = 0; onProgress(offset);
      if (body.completed || file.size === 0) return body.completed;
    } catch (e: any) {
      if (signal.aborted || ++failures > 5) throw e;
      await new Promise((r) => setTimeout(r, 1000 * failures));
      const st = await api(`/api/files/uploads/${session.id}`).catch(() => null); // resume from what the server has
      if (st) offset = st.received;
    }
  }
}

export default function FilesPage() {
  const { busy, run } = useAction();
  const [path, setPath] = useState("/home");
  const [view, setView] = useState<"list" | "grid">(() => (localStorage.getItem("mps-fileview") as any) || "list");
  const [sort, setSort] = useState<{ key: "name" | "size" | "modified"; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Entry[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"files" | "recycle">("files");
  const [modal, setModal] = useState<null | { kind: "folder" } | { kind: "rename"; e: Entry } | { kind: "move"; copy: boolean } | { kind: "delete"; paths: string[] } | { kind: "preview"; e: Entry }>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const aborts = useRef(new Map<string, AbortController>());
  const fileInput = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const list = useLoad<Listing>(() => api(`/api/files/list?path=${encodeURIComponent(path)}`), [path]);
  useEffect(() => { setSel(new Set()); setResults(null); setQuery(""); }, [path]);
  useEffect(() => { try { localStorage.setItem("mps-fileview", view); } catch { /* ignore */ } }, [view]);

  const entries = useMemo(() => {
    const src = results ?? list.data?.entries ?? [];
    return [...src].sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      const va = sort.key === "name" ? a.name.toLowerCase() : sort.key === "size" ? a.size : a.modified;
      const vb = sort.key === "name" ? b.name.toLowerCase() : sort.key === "size" ? b.size : b.modified;
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });
  }, [list.data, results, sort]);

  const writable = list.data ? canWrite(list.data.access) : false;
  const selected = entries.filter((e) => sel.has(e.path));
  const inVirtualRoot = path === "/" || path === "/shared" || path === "/users";

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) { setResults(null); return; }
    run(async () => setResults(await api(`/api/files/search?path=${encodeURIComponent(path)}&q=${encodeURIComponent(query)}`)));
  }

  const startUploads = useCallback((files: FileList | File[]) => {
    const folder = path;
    for (const f of Array.from(files)) {
      const id = crypto.randomUUID();
      const ctrl = new AbortController(); aborts.current.set(id, ctrl);
      setTransfers((t) => [...t, { id, name: f.name, size: f.size, sent: 0, state: "uploading" }]);
      uploadFile(folder, f, (sent) => setTransfers((t) => t.map((x) => (x.id === id ? { ...x, sent } : x))), ctrl.signal)
        .then(() => { setTransfers((t) => t.map((x) => (x.id === id ? { ...x, sent: f.size, state: "done" } : x))); list.reload(); })
        .catch((err) => setTransfers((t) => t.map((x) => (x.id === id ? { ...x, state: ctrl.signal.aborted ? "cancelled" : "error", error: err.message } : x))));
    }
  }, [path, list]);

  const download = (e: Entry) => { const a = document.createElement("a"); a.href = e.isDirectory ? `/api/files/zip?path=${encodeURIComponent(e.path)}` : `/api/files/download?path=${encodeURIComponent(e.path)}`; a.click(); };
  const toggle = (p: string) => setSel((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; });
  const open = (e: Entry) => (e.isDirectory ? setPath(e.path) : PREVIEW.test(e.name) ? setModal({ kind: "preview", e }) : download(e));
  const sortBy = (key: typeof sort.key) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }));

  return (
    <div className="grid gap-4">
      <div className="flex gap-1.5">
        {(["files", "recycle"] as const).map((t) => <Button key={t} size="sm" variant={tab === t ? "primary" : "default"} onClick={() => setTab(t)}>{t === "files" ? "Files" : "Recycle bin"}</Button>)}
      </div>
      {tab === "recycle" ? <RecycleBin onRestored={() => list.reload()} /> : (
        <section className={cx("min-w-0 rounded-[10px] border bg-surface", drag ? "border-accent ring-2 ring-accent" : "border-line")}
          onDragOver={(e) => { if (writable) { e.preventDefault(); setDrag(true); } }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (writable && e.dataTransfer.files.length) startUploads(e.dataTransfer.files); }}>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3.5 py-3">
            <Button variant="primary" disabled={!writable} onClick={() => fileInput.current?.click()}><Upload size={16} /> Upload</Button>
            <input ref={fileInput} type="file" multiple hidden onChange={(e) => { if (e.target.files) startUploads(e.target.files); e.target.value = ""; }} />
            <Button disabled={!writable} onClick={() => setModal({ kind: "folder" })}><FolderPlus size={16} /> <span className="hidden sm:inline">New folder</span></Button>
            <form onSubmit={search} className="relative order-first min-w-0 flex-[1_1_100%] sm:order-none sm:max-w-80 sm:flex-[1_1_200px]">
              <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input className={inputCls + " !pl-8"} placeholder={`Search in ${list.data?.name ?? ""}…`} value={query} onChange={(e) => { setQuery(e.target.value); if (!e.target.value) setResults(null); }} aria-label="Search files" />
            </form>
            <span className="flex-1" />
            <select className={inputCls + " !w-auto"} value={sort.key} onChange={(e) => setSort({ key: e.target.value as any, dir: 1 })} aria-label="Sort by">
              <option value="name">Sort: Name</option><option value="modified">Sort: Date modified</option><option value="size">Sort: Size</option>
            </select>
            <div className="inline-flex overflow-hidden rounded-[7px] border border-line-2">
              <button className={cx("px-2.5 py-1.5", view === "list" && "bg-accent-soft text-accent")} onClick={() => setView("list")} aria-label="List view"><List size={16} /></button>
              <button className={cx("border-l border-line-2 px-2.5 py-1.5", view === "grid" && "bg-accent-soft text-accent")} onClick={() => setView("grid")} aria-label="Grid view"><Grid2x2 size={16} /></button>
            </div>
          </div>
          <nav className="flex flex-wrap items-center gap-0.5 border-b border-line px-3.5 py-2.5 text-[13px]" aria-label="Folder path">
            {(list.data?.breadcrumbs ?? [{ name: "Home", path: "/" }]).map((c, i, a) => (
              <span key={c.path} className="flex items-center gap-0.5">
                {i > 0 && <ChevronRight size={14} className="text-muted" />}
                <button onClick={() => setPath(c.path)} className={cx("rounded px-1.5 py-0.5 hover:bg-surface-2", i === a.length - 1 ? "font-semibold" : "text-ink-2")}>{i === 0 ? <span className="flex items-center gap-1"><Home size={14} /> All</span> : c.name}</button>
              </span>
            ))}
            {results && <span className="ml-2 text-muted">· {results.length} result(s) for “{query}”</span>}
            {list.data && !inVirtualRoot && <span className="ml-auto"><Pill tone={writable ? "ok" : list.data.access === "Read" ? "info" : "none"}>{writable ? "You can edit" : list.data.access === "Read" ? "Read only" : "Browse only"}</Pill></span>}
          </nav>
          {selected.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 bg-accent-soft px-3.5 py-2 text-[13px] font-semibold text-accent">
              {selected.length} selected <span className="flex-1" />
              <Button size="sm" onClick={() => selected.forEach(download)}><Download size={14} /> Download</Button>
              {selected.length === 1 && canWrite(selected[0].access) && <Button size="sm" onClick={() => setModal({ kind: "rename", e: selected[0] })}><Pencil size={14} /> Rename</Button>}
              <Button size="sm" onClick={() => setModal({ kind: "move", copy: true })}><Copy size={14} /> Copy</Button>
              {selected.every((e) => canWrite(e.access)) && <>
                <Button size="sm" onClick={() => setModal({ kind: "move", copy: false })}><FolderInput size={14} /> Move</Button>
                <Button size="sm" variant="danger" onClick={() => setModal({ kind: "delete", paths: selected.map((e) => e.path) })}><Trash2 size={14} /> Delete</Button>
              </>}
              <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>Clear</Button>
            </div>
          )}
          {list.error ? <div className="p-4"><PageError error={list.error} retry={list.reload} /></div>
            : entries.length === 0 && !list.loading ? <Empty icon={<Folder size={44} />} title={results ? "No matching files" : "This folder is empty"}>{writable && !results && <span>Drag files here or use Upload.</span>}</Empty>
            : view === "grid" ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2.5 p-3.5">
                {entries.map((e) => (
                  <div key={e.path} className={cx("relative grid cursor-pointer justify-items-center gap-2 rounded-lg border px-2.5 pb-2.5 pt-3.5 text-center", sel.has(e.path) ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2")} onDoubleClick={() => open(e)} onClick={() => (e.isDirectory ? open(e) : toggle(e.path))}>
                    <input type="checkbox" className="absolute left-2 top-2 accent-[var(--accent)]" checked={sel.has(e.path)} onClick={(ev) => ev.stopPropagation()} onChange={() => toggle(e.path)} aria-label={`Select ${e.name}`} />
                    {e.isDirectory ? <Folder size={48} className="fill-folder text-folder" /> : <div className="scale-125">{badge(e.name)}</div>}
                    <div className="max-h-[2.6em] overflow-hidden text-[12.5px] font-medium [overflow-wrap:anywhere]">{e.name}</div>
                    <div className="text-[11.5px] text-muted">{e.isDirectory ? "Folder" : fmtBytes(e.size)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <Table head={[<input key="all" type="checkbox" className="accent-[var(--accent)]" aria-label="Select all" checked={entries.length > 0 && entries.every((e) => sel.has(e.path))} onChange={(ev) => setSel(ev.target.checked ? new Set(entries.map((e) => e.path)) : new Set())} />,
                <button key="n" onClick={() => sortBy("name")} className="uppercase">Name {sort.key === "name" && <ArrowDownAZ size={12} className="inline" />}</button>,
                ...(results ? ["Location"] : []),
                <button key="s" onClick={() => sortBy("size")} className="uppercase">Size</button>,
                <button key="m" onClick={() => sortBy("modified")} className="hidden uppercase md:inline">Modified</button>, ""]}>
                {entries.map((e) => (
                  <tr key={e.path} className={sel.has(e.path) ? "[&>td]:!bg-accent-soft" : ""}>
                    <td className="w-9"><input type="checkbox" className="accent-[var(--accent)]" checked={sel.has(e.path)} onChange={() => toggle(e.path)} aria-label={`Select ${e.name}`} /></td>
                    <td><button className="flex min-w-0 items-center gap-2.5 text-left hover:text-accent" onClick={() => open(e)}>
                      {e.isDirectory ? <Folder size={22} className="flex-none fill-folder text-folder" /> : badge(e.name)}
                      <span className="truncate font-medium">{e.name}</span>
                      {e.isDirectory && e.access === "None" && <Pill>browse only</Pill>}
                    </button></td>
                    {results && <td className="text-muted">{e.path.split("/").slice(0, -1).join("/") || "/"}</td>}
                    <td className="num whitespace-nowrap text-muted">{e.isDirectory ? "—" : fmtBytes(e.size)}</td>
                    <td className="hidden whitespace-nowrap text-muted md:table-cell" title={fmtDate(e.modified)}>{rel(e.modified)}</td>
                    <td className="w-24 text-right whitespace-nowrap">
                      {!e.isDirectory && PREVIEW.test(e.name) && <button className="rounded p-1.5 text-muted hover:bg-surface-3 hover:text-ink" onClick={() => setModal({ kind: "preview", e })} aria-label={`Preview ${e.name}`}><Eye size={16} /></button>}
                      {!inVirtualRoot && e.access !== "None" && <button className="rounded p-1.5 text-muted hover:bg-surface-3 hover:text-ink" onClick={() => download(e)} aria-label={`Download ${e.name}`}><Download size={16} /></button>}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          <div className="flex flex-wrap gap-2 border-t border-line px-4 py-2.5 text-xs text-muted">
            <span>{entries.length} items</span><span className="flex-1" /><span>Files are stored on this server's own drive.</span>
          </div>
        </section>
      )}

      {transfers.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 w-[340px] max-w-[calc(100vw-32px)] rounded-[10px] border border-line bg-surface shadow-2xl">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2.5 text-[13px] font-semibold">
            <Upload size={15} /> {transfers.filter((t) => t.state === "uploading").length ? `Uploading ${transfers.filter((t) => t.state === "uploading").length} file(s)` : "Uploads finished"}
            <span className="flex-1" />{!transfers.some((t) => t.state === "uploading") && <button onClick={() => setTransfers([])} aria-label="Close"><X size={16} /></button>}
          </div>
          <div className="grid max-h-60 gap-2.5 overflow-auto px-3 py-2.5">
            {transfers.map((t) => (
              <div key={t.id} className="grid gap-1 text-[12.5px]">
                <div className="flex items-center gap-2"><span className="flex-1 truncate">{t.name}</span>
                  <b className={cx("font-medium", t.state === "error" ? "text-bad" : "text-muted")}>{t.state === "done" ? "Done" : t.state === "error" ? "Failed" : t.state === "cancelled" ? "Cancelled" : `${Math.floor((t.sent / Math.max(1, t.size)) * 100)}%`}</b>
                  {t.state === "uploading" && <button onClick={() => aborts.current.get(t.id)?.abort()} aria-label="Cancel upload"><X size={14} /></button>}
                </div>
                <div className="h-[5px] overflow-hidden rounded bg-surface-3"><i className={cx("block h-full", t.state === "error" ? "bg-bad" : "bg-accent")} style={{ width: `${(t.sent / Math.max(1, t.size)) * 100}%` }} /></div>
                {t.error && t.state === "error" && <span className="text-bad">{t.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {modal?.kind === "folder" && <NameModal title="New folder" initial="New folder" label="Create" onClose={() => setModal(null)}
        onSubmit={(name) => run(async () => { await api("/api/files/folder", { body: { path, name } }); setModal(null); list.reload(); }, "Folder created")} busy={busy} />}
      {modal?.kind === "rename" && <NameModal title={`Rename ${modal.e.isDirectory ? "folder" : "file"}`} initial={modal.e.name} label="Rename" onClose={() => setModal(null)}
        onSubmit={(newName) => run(async () => { await api("/api/files/rename", { body: { path: modal.e.path, newName } }); setModal(null); setSel(new Set()); list.reload(); }, "Renamed")} busy={busy} />}
      {modal?.kind === "move" && <MoveModal copy={modal.copy} onClose={() => setModal(null)} onSubmit={(destination) => run(async () => {
        await api("/api/files/move", { body: { sources: selected.map((e) => e.path), destination, copy: modal.copy } }); setModal(null); setSel(new Set()); list.reload();
      }, modal.copy ? "Copied" : "Moved")} />}
      {modal?.kind === "delete" && <Confirm title={`Delete ${modal.paths.length} item(s)?`} confirmLabel="Delete" onClose={() => setModal(null)}
        message={<>The selected items will be moved to the recycle bin. You can restore them for 30 days.</>}
        onConfirm={() => run(async () => { await api("/api/files/delete", { body: { paths: modal.paths } }); setSel(new Set()); list.reload(); }, "Moved to recycle bin")} />}
      {modal?.kind === "preview" && <Modal title={modal.e.name} wide onClose={() => setModal(null)} footer={<Button variant="primary" onClick={() => download(modal.e)}><Download size={15} /> Download</Button>}>
        <Preview entry={modal.e} />
      </Modal>}
    </div>
  );
}

function Preview({ entry }: { entry: Entry }) {
  const url = `/api/files/preview?path=${encodeURIComponent(entry.path)}`;
  const ext = entry.name.split(".").pop()!.toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext)) return <img src={url} alt={entry.name} className="mx-auto max-h-[70vh] rounded" />;
  if (["mp4", "webm"].includes(ext)) return <video src={url} controls className="max-h-[70vh] w-full rounded" />;
  if (["mp3", "wav", "ogg"].includes(ext)) return <audio src={url} controls className="w-full" />;
  if (ext === "pdf") return <iframe src={url} title={entry.name} className="h-[70vh] w-full rounded border border-line" />;
  return <TextPreview url={url} />;
}

function TextPreview({ url }: { url: string }) {
  const [text, setText] = useState("Loading…");
  useEffect(() => { fetch(url, { credentials: "same-origin" }).then((r) => r.text()).then((t) => setText(t.slice(0, 200_000))); }, [url]);
  return <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded bg-surface-2 p-3 font-mono text-[12.5px]">{text}</pre>;
}

function NameModal({ title, initial, label, onSubmit, onClose, busy }: { title: string; initial: string; label: string; onSubmit: (v: string) => void; onClose: () => void; busy: boolean }) {
  const [v, setV] = useState(initial);
  return (
    <Modal title={title} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || !v.trim()} onClick={() => onSubmit(v.trim())}>{label}</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(v.trim()); }}>
        <Field label="Name"><input className={inputCls} value={v} onChange={(e) => setV(e.target.value)} autoFocus onFocus={(e) => { const d = initial.lastIndexOf("."); e.target.setSelectionRange(0, d > 0 ? d : initial.length); }} /></Field>
      </form>
    </Modal>
  );
}

function MoveModal({ copy, onSubmit, onClose }: { copy: boolean; onSubmit: (dest: string) => void; onClose: () => void }) {
  const [path, setPath] = useState("/home");
  const l = useLoad<Listing>(() => api(`/api/files/list?path=${encodeURIComponent(path)}`), [path]);
  const ok = l.data && canWrite(l.data.access) && !["/", "/shared", "/users"].includes(path);
  return (
    <Modal title={copy ? "Copy to…" : "Move to…"} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!ok} onClick={() => onSubmit(path)}>{copy ? "Copy here" : "Move here"}</Button></>}>
      <div className="mb-2 flex flex-wrap items-center gap-1 text-[13px]">
        {l.data?.breadcrumbs.map((c, i) => <span key={c.path} className="flex items-center">{i > 0 && <ChevronRight size={13} className="text-muted" />}<button className="rounded px-1 hover:bg-surface-2" onClick={() => setPath(c.path)}>{i === 0 ? "All" : c.name}</button></span>)}
      </div>
      <div className="max-h-72 overflow-auto rounded-md border border-line">
        {l.data?.entries.filter((e) => e.isDirectory).map((e) => (
          <button key={e.path} onClick={() => setPath(e.path)} className="flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left last:border-0 hover:bg-surface-2"><Folder size={18} className="fill-folder text-folder" />{e.name}</button>
        ))}
        {l.data && l.data.entries.filter((e) => e.isDirectory).length === 0 && <p className="m-0 p-3 text-muted">No subfolders.</p>}
      </div>
      {!ok && l.data && <p className="mb-0 mt-2 text-xs text-muted">Open a folder you can edit.</p>}
    </Modal>
  );
}

function RecycleBin({ onRestored }: { onRestored: () => void }) {
  const { data, error, reload } = useLoad<any[]>(() => api("/api/files/recycle"));
  const { run } = useAction();
  const [confirm, setConfirm] = useState<null | string | "all">(null);
  return (
    <Card title="Recycle bin" icon={<Trash2 size={15} />} pad={false} actions={data?.length ? <Button size="sm" variant="danger" onClick={() => setConfirm("all")}>Empty recycle bin</Button> : undefined}
      footer={<span className="text-xs text-muted">Deleted items are kept for 30 days, then removed automatically.</span>}>
      {error && <div className="p-4"><PageError error={error} /></div>}
      <Table head={["Name", "Original location", "Size", "Deleted", ""]} empty="The recycle bin is empty.">
        {data?.map((i) => (
          <tr key={i.id}>
            <td><span className="flex items-center gap-2">{i.isDirectory ? <Folder size={18} className="fill-folder text-folder" /> : <FileText size={18} className="text-muted" />}{i.name}</span></td>
            <td className="text-muted">{i.originalPath}</td><td className="num text-muted">{fmtBytes(i.size)}</td><td className="text-muted">{rel(i.deletedAt)} · {i.deletedBy}</td>
            <td className="whitespace-nowrap text-right">
              <Button size="sm" onClick={() => run(async () => { await api(`/api/files/recycle/${i.id}/restore`, { method: "POST" }); reload(); onRestored(); }, "Restored")}><RotateCcw size={14} /> Restore</Button>{" "}
              <Button size="sm" variant="danger" onClick={() => setConfirm(i.id)}>Delete</Button>
            </td>
          </tr>
        ))}
      </Table>
      {confirm && <Confirm title={confirm === "all" ? "Empty the recycle bin?" : "Delete permanently?"} confirmLabel="Delete permanently" onClose={() => setConfirm(null)}
        message="This cannot be undone." onConfirm={() => run(async () => { await api(confirm === "all" ? "/api/files/recycle" : `/api/files/recycle/${confirm}`, { method: "DELETE" }); reload(); }, "Deleted")} />}
    </Card>
  );
}
