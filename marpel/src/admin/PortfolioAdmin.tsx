import { Images, Pencil, Plus, Star } from 'lucide-react';
import { useState } from 'react';
import { Artwork } from '../components/brand';
import { Badge, Button, Card, ConfirmButton, EmptyState, Field, ImageInput, Input, ListEditor, Modal, PageHeader, Select, StatusBadge, Tabs, Textarea, Toggle } from '../components/ui';
import { actorOf, audit } from '../lib/actions';
import { useSession, useStore, useToast } from '../lib/store';
import { PORTFOLIO_CATEGORIES, type PortfolioItem } from '../lib/types';
import { fmtDate, todayYMD, uid } from '../lib/utils';
import { StatusActions } from './cms';

export default function PortfolioAdmin() {
  const { db, update } = useStore();
  const { user } = useSession();
  const { push } = useToast();
  const [editing, setEditing] = useState<PortfolioItem | null>(null);
  const [filter, setFilter] = useState('all');
  const items = db.portfolio.filter((p) => filter === 'all' || p.status === filter).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  return (
    <>
      <PageHeader
        title="Portfolio management"
        subtitle="Projects showcased on the website. Featured items appear on the homepage."
        actions={
          <Button
            variant="gold"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setEditing({ id: uid('pf_'), title: '', category: 'IT Projects', client: '', location: '', summary: '', description: '', completedAt: todayYMD(), technologies: [], featured: false, status: 'draft' })}
          >
            Add project
          </Button>
        }
      />
      <Tabs
        value={filter}
        onChange={setFilter}
        className="mb-4"
        tabs={[
          { value: 'all', label: 'All', count: db.portfolio.length },
          { value: 'published', label: 'Published', count: db.portfolio.filter((p) => p.status === 'published').length },
          { value: 'draft', label: 'Drafts', count: db.portfolio.filter((p) => p.status === 'draft').length },
          { value: 'archived', label: 'Archived', count: db.portfolio.filter((p) => p.status === 'archived').length },
        ]}
      />
      {items.length === 0 ? (
        <Card>
          <EmptyState icon={<Images className="h-6 w-6" />} title="No portfolio items" />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((p) => (
            <Card key={p.id} className="overflow-hidden">
              <div className="relative aspect-video">
                <Artwork topic={p.category} image={p.image ?? p.afterImage} label={p.title} />
                <div className="absolute left-3 top-3 flex gap-1.5">
                  <StatusBadge status={p.status} className="bg-navy-950/80" />
                  {p.featured && (
                    <Badge tone="gold" className="bg-navy-950/80">
                      <Star className="h-3 w-3" /> Featured
                    </Badge>
                  )}
                </div>
              </div>
              <div className="p-4">
                <p className="text-xs text-gold-300">{p.category}</p>
                <p className="mt-1 font-display font-semibold text-white">{p.title}</p>
                <p className="text-xs text-slate-500">
                  {p.client} · {fmtDate(p.completedAt)}
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  <Button size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(structuredClone(p))}>
                    Edit
                  </Button>
                  <StatusActions
                    status={p.status}
                    onChange={(st) => {
                      update((d) => {
                        d.portfolio.find((x) => x.id === p.id)!.status = st;
                        audit(d, actorOf(user), `Portfolio item ${st}`, p.title);
                      });
                      push({ tone: 'success', title: `${p.title}: ${st}` });
                    }}
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing && <PortfolioEditor initial={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function PortfolioEditor({ initial, onClose }: { initial: PortfolioItem; onClose: () => void }) {
  const { db, update } = useStore();
  const { user } = useSession();
  const { push } = useToast();
  const [p, setP] = useState(initial);
  const [err, setErr] = useState('');
  const isNew = !db.portfolio.some((x) => x.id === p.id);
  const set = <K extends keyof PortfolioItem>(k: K, v: PortfolioItem[K]) => setP({ ...p, [k]: v });
  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'New portfolio project' : `Edit: ${initial.title}`}
      size="xl"
      footer={
        <>
          {!isNew && (
            <ConfirmButton
              label="Delete project"
              onConfirm={() => {
                update((d) => {
                  d.portfolio = d.portfolio.filter((x) => x.id !== p.id);
                  audit(d, actorOf(user), 'Deleted portfolio item', p.title);
                });
                onClose();
              }}
            />
          )}
          <span className="flex-1" />
          {err && <span className="self-center text-sm text-rose-300">{err}</span>}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="gold"
            onClick={() => {
              if (p.title.trim().length < 3) return setErr('Title is required.');
              update((d) => {
                const i = d.portfolio.findIndex((x) => x.id === p.id);
                if (i >= 0) d.portfolio[i] = p;
                else d.portfolio.push(p);
                audit(d, actorOf(user), isNew ? 'Added portfolio item' : 'Edited portfolio item', p.title);
              });
              push({ tone: 'success', title: 'Portfolio saved' });
              onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project title" required className="sm:col-span-2">
            <Input value={p.title} onChange={(e) => set('title', e.target.value)} />
          </Field>
          <Field label="Category">
            <Select value={p.category} onChange={(e) => set('category', e.target.value as PortfolioItem['category'])}>
              {PORTFOLIO_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Completion date">
            <Input type="date" value={p.completedAt} onChange={(e) => set('completedAt', e.target.value)} />
          </Field>
          <Field label="Client">
            <Input value={p.client} onChange={(e) => set('client', e.target.value)} />
          </Field>
          <Field label="Location">
            <Input value={p.location} onChange={(e) => set('location', e.target.value)} />
          </Field>
          <Field label="Summary" className="sm:col-span-2">
            <Input value={p.summary} onChange={(e) => set('summary', e.target.value)} />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea rows={5} value={p.description} onChange={(e) => set('description', e.target.value)} />
          </Field>
          <Field label="Technologies used" className="sm:col-span-2">
            <ListEditor value={p.technologies} onChange={(v) => set('technologies', v)} placeholder="e.g. MikroTik CCR2004" />
          </Field>
          <div className="flex gap-6 sm:col-span-2">
            <Toggle checked={p.featured} onChange={(v) => set('featured', v)} label="Featured project" description="Shown on the homepage" />
            <Select value={p.status} onChange={(e) => set('status', e.target.value as PortfolioItem['status'])} className="w-40">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </Select>
          </div>
        </div>
        <div className="space-y-4">
          <Field label="Cover image">
            <ImageInput value={p.image} onChange={(v) => set('image', v)} />
          </Field>
          <Field label="Before image" hint="Optional — enables the before/after slider">
            <ImageInput value={p.beforeImage} onChange={(v) => set('beforeImage', v)} />
          </Field>
          <Field label="After image">
            <ImageInput value={p.afterImage} onChange={(v) => set('afterImage', v)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
