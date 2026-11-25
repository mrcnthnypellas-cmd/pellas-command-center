import { FolderKanban, LayoutGrid, List, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, Pager, Progress, SearchInput, Select, StatusBadge, Table, Tabs, Td, Th, usePaged } from '../components/ui';
import { projectProgress } from '../lib/actions';
import { scopeProjects } from '../lib/permissions';
import { useSession, useStore } from '../lib/store';
import { PROJECT_STATUSES } from '../lib/types';
import { cx, fmtDate, money, todayYMD } from '../lib/utils';
import { ProjectFormModal } from './ProjectForm';
import { customerOf, isMgmt, userName } from './shared';

export default function Projects() {
  const { db } = useStore();
  const { user } = useSession();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'Active';
  const [view, setView] = useState<'board' | 'table'>('table');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [creating, setCreating] = useState(false);
  if (!user) return null;
  const scoped = scopeProjects(db, user);
  const rows = scoped
    .filter((p) => (status === 'All' ? true : status === 'Active' ? ['Planning', 'Approved', 'In Progress', 'On Hold'].includes(p.status) : p.status === status))
    .filter((p) => !cat || p.category === cat)
    .filter((p) => !q || `${p.code} ${p.name} ${p.trackingRef} ${customerOf(db, p.customerId)?.name} ${customerOf(db, p.customerId)?.company}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const paged = usePaged(rows, 15);
  const today = todayYMD();
  const sym = db.settings.currencySymbol;

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle={user.role === 'staff' ? 'Projects you manage or are assigned to' : 'Plan, deliver and track every engagement.'}
        actions={
          <>
            <div className="flex rounded-xl border border-white/10 p-1">
              <button type="button" onClick={() => setView('table')} className={cx('rounded-lg p-1.5', view === 'table' ? 'bg-gold-400/15 text-gold-100' : 'text-slate-400')} aria-label="Table view">
                <List className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setView('board')} className={cx('rounded-lg p-1.5', view === 'board' ? 'bg-gold-400/15 text-gold-100' : 'text-slate-400')} aria-label="Board view">
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
            {isMgmt(user) && (
              <Button variant="gold" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
                New project
              </Button>
            )}
          </>
        }
      />
      <Tabs
        value={status}
        onChange={(v) => setParams({ status: v })}
        className="mb-4"
        tabs={[
          { value: 'Active', label: 'Active', count: scoped.filter((p) => ['Planning', 'Approved', 'In Progress', 'On Hold'].includes(p.status)).length },
          ...PROJECT_STATUSES.map((s) => ({ value: s, label: s, count: scoped.filter((p) => p.status === s).length })),
          { value: 'All', label: 'All', count: scoped.length },
        ]}
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <SearchInput value={q} onChange={setQ} placeholder="Search projects, refs, customers…" className="sm:w-80" />
        <Select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {Object.keys(db.stageTemplates).map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={<FolderKanban className="h-6 w-6" />} title="No projects here" body="Convert an approved quotation or inquiry into a project." />
        </Card>
      ) : view === 'board' ? (
        <div className="grid gap-4 overflow-x-auto pb-2 lg:grid-cols-3 2xl:grid-cols-6">
          {PROJECT_STATUSES.map((s) => {
            const col = rows.filter((p) => p.status === s);
            return (
              <div key={s} className="min-w-[260px] rounded-2xl border border-white/[0.06] bg-navy-900/40 p-3">
                <div className="mb-3 flex items-center justify-between px-1">
                  <StatusBadge status={s} />
                  <span className="text-xs text-slate-500">{col.length}</span>
                </div>
                <div className="space-y-2">
                  {col.map((p) => (
                    <Link key={p.id} to={`/admin/projects/${p.id}`} className="block rounded-xl border border-white/[0.07] bg-navy-850 p-3 transition hover:border-gold-400/40">
                      <p className="text-sm font-medium text-slate-100">{p.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{customerOf(db, p.customerId)?.company || customerOf(db, p.customerId)?.name}</p>
                      <Progress value={projectProgress(p)} size="sm" className="mt-3" />
                      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                        <span className={p.targetDate < today && p.status !== 'Completed' ? 'text-rose-300' : ''}>Due {fmtDate(p.targetDate, { month: 'short', day: 'numeric' })}</span>
                        <span className="flex -space-x-1.5">
                          {p.staffIds.slice(0, 3).map((sid) => (
                            <Avatar key={sid} name={userName(db, sid)} size="sm" className="ring-2 ring-navy-850" />
                          ))}
                        </span>
                      </div>
                    </Link>
                  ))}
                  {!col.length && <p className="px-1 py-4 text-center text-xs text-slate-600">Empty</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Project</Th>
                <Th>Customer</Th>
                <Th>Category</Th>
                <Th>Progress</Th>
                <Th>Target</Th>
                {isMgmt(user) && <Th className="text-right">Budget</Th>}
                <Th>Team</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {paged.rows.map((p) => {
                const pct = projectProgress(p);
                const late = p.targetDate < today && !['Completed', 'Cancelled'].includes(p.status);
                return (
                  <tr key={p.id} onClick={() => nav(`/admin/projects/${p.id}`)} className="cursor-pointer hover:bg-white/[0.03]">
                    <Td>
                      <p className="text-slate-100">{p.name}</p>
                      <p className="font-mono text-[11px] text-slate-500">
                        {p.code} · {p.trackingRef}
                      </p>
                    </Td>
                    <Td className="text-xs">{customerOf(db, p.customerId)?.company || customerOf(db, p.customerId)?.name}</Td>
                    <Td className="text-xs">{p.category}</Td>
                    <Td className="w-40">
                      <div className="flex items-center gap-2">
                        <Progress value={pct} size="sm" />
                        <span className="w-9 text-right text-xs tabular-nums">{pct}%</span>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap text-xs">
                      {fmtDate(p.targetDate)} {late && <Badge tone="red">Overdue</Badge>}
                    </Td>
                    {isMgmt(user) && <Td className="text-right tabular-nums text-xs">{money(p.budget, sym, 0)}</Td>}
                    <Td>
                      <span className="flex -space-x-1.5">
                        {[p.managerId, ...p.staffIds.filter((s) => s !== p.managerId)].slice(0, 4).map((sid) => (
                          <Avatar key={sid} name={userName(db, sid)} size="sm" className="ring-2 ring-navy-850" />
                        ))}
                      </span>
                    </Td>
                    <Td>
                      <StatusBadge status={p.status} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <Pager page={paged.page} pages={paged.pages} onPage={paged.setPage} total={paged.total} />
        </Card>
      )}
      <ProjectFormModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
