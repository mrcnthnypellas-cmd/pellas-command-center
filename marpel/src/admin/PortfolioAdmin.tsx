import { ExternalLink, Images, Pencil, Plus, Star } from 'lucide-react';
import { useState } from 'react';
import { Artwork } from '../components/brand';
import { Badge, Button, Card, CardHeader, ConfirmButton, EmptyState, Field, ImageInput, Input, ListEditor, Modal, PageHeader, Select, StatusBadge, Tabs, Textarea, Toggle } from '../components/ui';
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
      <PageBackgroundCard />
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
                  {p.client}
                  {p.completedAt && ` · ${fmtDate(p.completedAt)}`}
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
          <Field label="Live demo link" hint="Optional. Shows a “Try the live demo” button" className="sm:col-span-2">
            <Input value={p.demoUrl ?? ''} onChange={(e) => set('demoUrl', e.target.value.trim() || undefined)} placeholder="https://" />
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
          <Field label="More screenshots" hint="Shown as a gallery in the project view">
            <div className="grid grid-cols-3 gap-2">
              {(p.gallery ?? []).map((g, i) => (
                <div key={i} className="group relative">
                  <img src={g} alt="" className="aspect-video w-full rounded-lg object-cover" />
                  <button type="button" onClick={() => set('gallery', (p.gallery ?? []).filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded bg-black/70 px-1.5 text-xs text-white opacity-0 group-hover:opacity-100" aria-label="Remove screenshot">
                    ×
                  </button>
                </div>
              ))}
              {(p.gallery ?? []).length < 6 && <ImageInput value={undefined} onChange={(v) => v && set('gallery', [...(p.gallery ?? []), v])} aspect="aspect-video" label="Add" />}
            </div>
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

/** Background photo for the public Portfolio page header. */
function PageBackgroundCard() {
  const { db, update } = useStore();
  const { user } = useSession();
  const { push } = useToast();
  const bg = db.content.pageBackgrounds?.portfolio ?? { dim: 60 };
  const save = (next: { image?: string; dim: number }, msg?: string) =>
    update((d) => {
      d.content.pageBackgrounds = { ...(d.content.pageBackgrounds ?? {}), portfolio: next };
      if (msg) audit(d, actorOf(user), msg, 'Portfolio page');
    });
  return (
    <Card className="mb-6">
      <CardHeader
        title="Portfolio page background"
        subtitle="Photo shown behind the title at the top of the public Portfolio page"
        action={
          <a href="#/portfolio" target="_blank" rel="noreferrer">
            <Button size="sm" variant="ghost" icon={<ExternalLink className="h-3.5 w-3.5" />}>
              View page
            </Button>
          </a>
        }
      />
      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="space-y-4">
          <ImageInput
            value={bg.image}
            aspect="aspect-[21/8]"
            label="Upload background photo (landscape works best)"
            onChange={(v) => {
              save({ ...bg, image: v }, v ? 'Set portfolio page background' : 'Removed portfolio page background');
              push({ tone: 'success', title: v ? 'Background saved' : 'Background removed', body: v ? 'Live on the Portfolio page.' : undefined });
            }}
          />
          <Field label={`Darkness overlay: ${bg.dim}%`} hint="Higher keeps the white title easy to read">
            <input type="range" min={0} max={90} step={5} value={bg.dim} disabled={!bg.image} onChange={(e) => save({ ...bg, dim: Number(e.target.value) })} className="w-full accent-[#d8ae5a] disabled:opacity-40" aria-label="Darkness overlay" />
          </Field>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">Preview</p>
          <div className="relative aspect-[21/8] overflow-hidden rounded-xl border border-white/10 bg-navy-950">
            {bg.image && (
              <>
                <img src={bg.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute inset-0 bg-navy-950" style={{ opacity: bg.dim / 100 }} />
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-navy-950 to-transparent" />
              </>
            )}
            <div className="relative flex h-full flex-col justify-center p-5">
              <span className="mb-2 w-fit rounded-full border border-gold-400/30 bg-gold-400/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-gold-200">Portfolio</span>
              <p className="max-w-[80%] font-display text-lg font-semibold leading-tight text-white sm:text-2xl">Projects that keep businesses running.</p>
            </div>
          </div>
          {!bg.image && <p className="mt-2 text-xs text-slate-500">No photo yet: the page uses the default navy and gold background.</p>}
        </div>
      </div>
    </Card>
  );
}
