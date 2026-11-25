import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Field, Input, Modal, Select, Textarea } from '../components/ui';
import { actorOf, createProject } from '../lib/actions';
import { useSession, useStore, useToast } from '../lib/store';
import { addDays, clean, todayYMD } from '../lib/utils';

export interface ProjectSeed {
  name: string;
  customerId: string;
  category: string;
  description: string;
  budget: number;
  quotationId?: string;
  inquiryId?: string;
}

/** Create a project — standalone, or converted from an approved inquiry / quotation. */
export function ProjectFormModal({ open, onClose, seed, title = 'Create project' }: { open: boolean; onClose: () => void; seed?: Partial<ProjectSeed>; title?: string }) {
  const { db, update } = useStore();
  const { user } = useSession();
  const { push } = useToast();
  const nav = useNavigate();
  const blank = () => ({
    name: seed?.name ?? '',
    customerId: seed?.customerId ?? '',
    category: seed?.category ?? db.services[0]?.name ?? '',
    description: seed?.description ?? '',
    budget: String(Math.round(seed?.budget ?? 0)),
    managerId: 'u_admin',
    staffIds: [] as string[],
    startDate: todayYMD(addDays(new Date(), 3)),
    targetDate: todayYMD(addDays(new Date(), 30)),
  });
  const [f, setF] = useState(blank);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (open) {
      setF(blank());
      setErr('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const save = () => {
    if (clean(f.name).length < 3) return setErr('Enter a project name');
    if (!f.customerId) return setErr('Choose a customer');
    if (f.targetDate < f.startDate) return setErr('Target date must be after the start date');
    let id = '';
    update((d) => {
      id = createProject(
        d,
        { name: clean(f.name, 200), customerId: f.customerId, category: f.category, description: clean(f.description, 4000), budget: Number(f.budget) || 0, managerId: f.managerId, staffIds: f.staffIds, startDate: f.startDate, targetDate: f.targetDate, quotationId: seed?.quotationId, inquiryId: seed?.inquiryId },
        actorOf(user),
      ).id;
    });
    push({ tone: 'success', title: 'Project created', body: 'Tracking reference and milestones were generated.' });
    onClose();
    nav(`/admin/projects/${id}`);
  };
  const customers = db.customers.filter((c) => !c.archived).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle="Milestones are generated from the stage template of the selected category."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="gold" onClick={save}>
            Create project
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Project name" required className="sm:col-span-2">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Customer" required>
          <Select value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value })} disabled={!!seed?.customerId}>
            <option value="">Select customer…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.company ? ` — ${c.company}` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category">
          <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {Object.keys(db.stageTemplates).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Start date">
          <Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} />
        </Field>
        <Field label="Target completion">
          <Input type="date" value={f.targetDate} onChange={(e) => setF({ ...f, targetDate: e.target.value })} />
        </Field>
        <Field label={`Budget (${db.settings.currency})`}>
          <Input type="number" min={0} value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} />
        </Field>
        <Field label="Project manager">
          <Select value={f.managerId} onChange={(e) => setF({ ...f, managerId: e.target.value })}>
            {db.users
              .filter((u) => u.active)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Assigned staff" className="sm:col-span-2">
          <div className="flex flex-wrap gap-2">
            {db.users
              .filter((u) => u.active)
              .map((u) => {
                const on = f.staffIds.includes(u.id);
                return (
                  <button key={u.id} type="button" onClick={() => setF({ ...f, staffIds: on ? f.staffIds.filter((x) => x !== u.id) : [...f.staffIds, u.id] })} className={`rounded-full border px-3 py-1 text-xs ${on ? 'border-gold-400/60 bg-gold-400/15 text-gold-100' : 'border-white/10 text-slate-400'}`}>
                    {u.name}
                  </button>
                );
              })}
          </div>
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
      </div>
      {err && <p className="mt-4 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{err}</p>}
    </Modal>
  );
}
