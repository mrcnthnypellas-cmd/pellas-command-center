import { ExternalLink, GripVertical, Plus, Radar, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { seedStageTemplates } from '../lib/seed-content';
import { Badge, Button, Card, CardHeader, IconButton, Input, PageHeader, Progress, Select, StatusBadge, Table, Td, Th } from '../components/ui';
import { actorOf, audit, projectProgress } from '../lib/actions';
import { scopeProjects } from '../lib/permissions';
import { useSession, useStore, useToast } from '../lib/store';
import { fmtDate, timeAgo } from '../lib/utils';
import { customerOf, isMgmt } from './shared';

export default function Tracking() {
  const { db, update } = useStore();
  const { user } = useSession();
  const { push } = useToast();
  const cats = Object.keys(db.stageTemplates);
  const [cat, setCat] = useState(cats[0] ?? '');
  const [newStage, setNewStage] = useState('');
  if (!user) return null;
  const projects = scopeProjects(db, user).filter((p) => !['Cancelled'].includes(p.status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const portalLog = db.audit.filter((a) => a.role === 'customer').slice(0, 12);
  const stages = db.stageTemplates[cat] ?? [];
  const setStages = (s: string[]) =>
    update((d) => {
      d.stageTemplates[cat] = s;
    });

  const preview = (id: string) => {
    sessionStorage.setItem('marpel.portal', id);
    window.open(`${window.location.pathname}#/track`, '_blank');
  };

  return (
    <>
      <PageHeader title="Customer project tracking" subtitle="What customers see in the client portal, plus the stage templates used for new projects." />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Tracked projects" subtitle="Tracking references and portal status" />
          <Table>
            <thead>
              <tr>
                <Th>Tracking ref</Th>
                <Th>Project</Th>
                <Th>Current stage</Th>
                <Th>Progress</Th>
                <Th>Last customer update</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {projects.slice(0, 25).map((p) => {
                const last = p.updates.find((u) => u.visibleToCustomer);
                const cur = p.milestones.find((m) => m.status === 'active');
                return (
                  <tr key={p.id} className="hover:bg-white/[0.03]">
                    <Td className="font-mono text-xs text-gold-200">{p.trackingRef}</Td>
                    <Td>
                      <Link to={`/admin/projects/${p.id}`} className="text-slate-200 hover:text-gold-200">
                        {p.name}
                      </Link>
                      <p className="text-xs text-slate-500">{customerOf(db, p.customerId)?.name}</p>
                    </Td>
                    <Td className="text-xs">{p.status === 'Completed' ? <StatusBadge status="Completed" /> : cur?.name ?? '—'}</Td>
                    <Td className="w-36">
                      <Progress value={projectProgress(p)} size="sm" />
                    </Td>
                    <Td className="text-xs">{last ? timeAgo(last.at) : <Badge tone="amber">None yet</Badge>}</Td>
                    <Td>
                      <Button size="sm" variant="ghost" icon={<ExternalLink className="h-3.5 w-3.5" />} onClick={() => preview(p.id)}>
                        Preview as customer
                      </Button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
        <div className="space-y-6">
          {isMgmt(user) && (
            <Card>
              <CardHeader
                title="Project stage templates"
                subtitle="Customise the stages used when a project is created"
                action={
                  <IconButton
                    label="Restore default stages"
                    onClick={() => {
                      setStages(seedStageTemplates[cat] ?? []);
                      push({ tone: 'info', title: 'Default stages restored' });
                    }}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </IconButton>
                }
              />
              <div className="space-y-3 p-5">
                <Select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
                  {cats.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
                <ol className="space-y-1.5">
                  {stages.map((s, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
                      <GripVertical className="h-4 w-4 text-slate-600" />
                      <span className="w-5 text-xs text-slate-500">{i + 1}</span>
                      <input value={s} onChange={(e) => setStages(stages.map((x, j) => (j === i ? e.target.value : x)))} className="flex-1 bg-transparent text-sm text-slate-200 outline-none" aria-label={`Stage ${i + 1}`} />
                      <button type="button" disabled={i === 0} onClick={() => setStages(stages.map((x, j) => (j === i - 1 ? stages[i]! : j === i ? stages[i - 1]! : x)))} className="px-1 text-xs text-slate-500 hover:text-white disabled:opacity-20" aria-label="Move up">
                        ↑
                      </button>
                      <IconButton label="Remove stage" className="h-7 w-7 hover:text-rose-300" onClick={() => setStages(stages.filter((_, j) => j !== i))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
                    </li>
                  ))}
                </ol>
                <div className="flex gap-2">
                  <Input value={newStage} onChange={(e) => setNewStage(e.target.value)} placeholder="New stage name" />
                  <Button
                    icon={<Plus className="h-4 w-4" />}
                    disabled={!newStage.trim()}
                    onClick={() => {
                      setStages([...stages, newStage.trim()]);
                      update((d) => audit(d, actorOf(user), `Added stage "${newStage.trim()}"`, cat));
                      setNewStage('');
                    }}
                  >
                    Add
                  </Button>
                </div>
                <p className="text-[11px] text-slate-500">Existing projects keep their own stages; edit them on each project page.</p>
              </div>
            </Card>
          )}
          <Card>
            <CardHeader title="Portal access log" subtitle="Customer sign-ins to project tracking" />
            <ul className="divide-y divide-white/[0.05]">
              {portalLog.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <Radar className="h-4 w-4 text-gold-300" />
                  <span className="flex-1">
                    <span className="block text-slate-200">{l.user}</span>
                    <span className="block font-mono text-[11px] text-slate-500">{l.target}</span>
                  </span>
                  <span className="text-[11px] text-slate-500">{fmtDate(l.at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                </li>
              ))}
              {!portalLog.length && <li className="p-6 text-center text-sm text-slate-500">No customer sign-ins yet. Try the demo on the Track Project page.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
