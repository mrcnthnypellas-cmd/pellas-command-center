import { ArrowDown, ArrowUp, ExternalLink, Layers, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Artwork } from '../components/brand';
import { Icon, ICON_CHOICES } from '../components/icons';
import { Badge, Button, Card, ConfirmButton, EmptyState, Field, IconButton, ImageInput, Input, ListEditor, Modal, PageHeader, Select, StatusBadge, Tabs, Textarea, Toggle } from '../components/ui';
import { actorOf, audit } from '../lib/actions';
import { useSession, useStore, useToast } from '../lib/store';
import type { Service, ServicePackage } from '../lib/types';
import { cx, money, slugify, uid } from '../lib/utils';
import { SeoFields, StatusActions } from './cms';

const blank = (order: number): Service => ({
  id: uid('svc_'),
  slug: '',
  name: '',
  icon: 'Sparkles',
  short: '',
  description: '',
  gallery: [],
  offerings: [],
  features: [],
  benefits: [],
  packages: [],
  startingPrice: null,
  showPrice: false,
  status: 'draft',
  order,
  seoTitle: '',
  seoDescription: '',
});

export default function ServicesAdmin() {
  const { db, update } = useStore();
  const { user } = useSession();
  const { push } = useToast();
  const [editing, setEditing] = useState<Service | null>(null);
  const services = [...db.services].sort((a, b) => a.order - b.order);
  const actor = actorOf(user);
  const move = (id: string, dir: -1 | 1) =>
    update((d) => {
      const list = [...d.services].sort((a, b) => a.order - b.order);
      const i = list.findIndex((s) => s.id === id);
      const j = i + dir;
      if (j < 0 || j >= list.length) return;
      [list[i]!.order, list[j]!.order] = [list[j]!.order, list[i]!.order];
    });

  return (
    <>
      <PageHeader
        title="Services management"
        subtitle="Service categories, descriptions, packages and pricing shown on the website and used by the AI assistant."
        actions={
          <Button variant="gold" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing(blank(services.length + 1))}>
            Add service
          </Button>
        }
      />
      {services.length === 0 ? (
        <Card>
          <EmptyState icon={<Layers className="h-6 w-6" />} title="No services yet" />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {services.map((s, i) => (
            <Card key={s.id} className="flex overflow-hidden">
              <div className="hidden w-40 shrink-0 sm:block">
                <Artwork topic={s.name} image={s.image} label={s.name} iconSize="h-7 w-7" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-display font-semibold text-white">
                      <Icon name={s.icon} className="h-4 w-4 text-gold-300" /> {s.name}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-400">{s.short}</p>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                  <Badge tone="slate">{s.offerings.length} offerings</Badge>
                  <Badge tone="slate">{s.packages.length} packages</Badge>
                  <Badge tone={s.showPrice ? 'gold' : 'slate'}>{s.showPrice && s.startingPrice ? `From ${money(s.startingPrice, db.settings.currencySymbol, 0)}` : 'Price hidden'}</Badge>
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4">
                  <Button size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(structuredClone(s))}>
                    Edit
                  </Button>
                  <a href={`#/services/${s.slug}`} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="ghost" icon={<ExternalLink className="h-3.5 w-3.5" />} disabled={s.status !== 'published'}>
                      Preview
                    </Button>
                  </a>
                  <StatusActions
                    status={s.status}
                    onChange={(st) => {
                      update((d) => {
                        d.services.find((x) => x.id === s.id)!.status = st;
                        audit(d, actor, `Service ${st}`, s.name);
                      });
                      push({ tone: 'success', title: `${s.name}: ${st}` });
                    }}
                  />
                  <span className="ml-auto flex">
                    <IconButton label="Move up" onClick={() => move(s.id, -1)} disabled={i === 0}>
                      <ArrowUp className="h-4 w-4" />
                    </IconButton>
                    <IconButton label="Move down" onClick={() => move(s.id, 1)} disabled={i === services.length - 1}>
                      <ArrowDown className="h-4 w-4" />
                    </IconButton>
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing && <ServiceEditor initial={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function ServiceEditor({ initial, onClose }: { initial: Service; onClose: () => void }) {
  const { db, update } = useStore();
  const { user } = useSession();
  const { push } = useToast();
  const [s, setS] = useState(initial);
  const [tab, setTab] = useState<'general' | 'content' | 'packages' | 'seo'>('general');
  const [err, setErr] = useState('');
  const isNew = !db.services.some((x) => x.id === s.id);
  const set = <K extends keyof Service>(k: K, v: Service[K]) => setS({ ...s, [k]: v });
  const setPkg = (id: string, patch: Partial<ServicePackage>) => set('packages', s.packages.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const save = () => {
    if (s.name.trim().length < 3) return setErr('Service name is required.');
    const slug = s.slug || slugify(s.name);
    if (db.services.some((x) => x.slug === slug && x.id !== s.id)) return setErr('Another service already uses this URL slug.');
    update((d) => {
      const rec = { ...s, slug, seoTitle: s.seoTitle || `${s.name} | ${d.settings.shortName}`, seoDescription: s.seoDescription || s.short };
      const i = d.services.findIndex((x) => x.id === s.id);
      if (i >= 0) d.services[i] = rec;
      else d.services.push(rec);
      if (!d.stageTemplates[rec.name]) d.stageTemplates[rec.name] = ['Assessment', 'Planning', 'Execution', 'Testing', 'Handover'];
      audit(d, actorOf(user), isNew ? 'Created service' : 'Edited service', rec.name);
    });
    push({ tone: 'success', title: isNew ? 'Service created' : 'Service saved' });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'New service' : `Edit: ${initial.name}`}
      size="xl"
      footer={
        <>
          {!isNew && (
            <ConfirmButton
              label="Delete service"
              message="The service and its packages will be removed from the website. Inquiries that referenced it keep their text."
              onConfirm={() => {
                update((d) => {
                  d.services = d.services.filter((x) => x.id !== s.id);
                  audit(d, actorOf(user), 'Deleted service', s.name);
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
          <Button variant="gold" onClick={save}>
            Save service
          </Button>
        </>
      }
    >
      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-5"
        tabs={[
          { value: 'general', label: 'General' },
          { value: 'content', label: 'Offerings & benefits' },
          { value: 'packages', label: 'Packages & pricing', count: s.packages.length },
          { value: 'seo', label: 'SEO' },
        ]}
      />
      {tab === 'general' && (
        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Service name" required>
                <Input value={s.name} onChange={(e) => setS({ ...s, name: e.target.value, slug: isNew ? slugify(e.target.value) : s.slug })} />
              </Field>
              <Field label="URL slug" hint={`/services/${s.slug || slugify(s.name)}`}>
                <Input value={s.slug} onChange={(e) => set('slug', slugify(e.target.value))} />
              </Field>
            </div>
            <Field label="Short description" hint="Shown on service cards">
              <Input value={s.short} onChange={(e) => set('short', e.target.value)} />
            </Field>
            <Field label="Full description">
              <Textarea rows={5} value={s.description} onChange={(e) => set('description', e.target.value)} />
            </Field>
            <Field label="Icon">
              <div className="flex flex-wrap gap-1.5">
                {ICON_CHOICES.map((n) => (
                  <button key={n} type="button" onClick={() => set('icon', n)} className={cx('flex h-9 w-9 items-center justify-center rounded-lg border', s.icon === n ? 'border-gold-400 bg-gold-400/15 text-gold-200' : 'border-white/10 text-slate-500 hover:text-white')} title={n} aria-label={n}>
                    <Icon name={n} className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </Field>
          </div>
          <div className="space-y-4">
            <Field label="Main image" hint="Shown on cards and the service page. Generated artwork is used if empty.">
              <ImageInput value={s.image} onChange={(v) => set('image', v)} />
            </Field>
            <Field label="Gallery">
              <div className="grid grid-cols-3 gap-2">
                {s.gallery.map((g, i) => (
                  <div key={i} className="group relative">
                    <img src={g} alt="" className="aspect-square w-full rounded-lg object-cover" />
                    <button type="button" onClick={() => set('gallery', s.gallery.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded bg-black/70 p-1 text-white opacity-0 group-hover:opacity-100" aria-label="Remove image">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {s.gallery.length < 6 && <ImageInput value={undefined} onChange={(v) => v && set('gallery', [...s.gallery, v])} aspect="aspect-square" label="Add" />}
              </div>
            </Field>
          </div>
        </div>
      )}
      {tab === 'content' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Field label="Services offered">
            <ListEditor value={s.offerings} onChange={(v) => set('offerings', v)} />
          </Field>
          <Field label="Features">
            <ListEditor value={s.features} onChange={(v) => set('features', v)} />
          </Field>
          <Field label="Benefits">
            <ListEditor value={s.benefits} onChange={(v) => set('benefits', v)} />
          </Field>
        </div>
      )}
      {tab === 'packages' && (
        <div className="space-y-5">
          <div className="grid gap-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label={`Starting price (${db.settings.currency})`} hint="Leave empty if priced after assessment">
              <Input type="number" min={0} value={s.startingPrice ?? ''} onChange={(e) => set('startingPrice', e.target.value === '' ? null : Number(e.target.value))} />
            </Field>
            <div className="pb-2">
              <Toggle checked={s.showPrice} onChange={(v) => set('showPrice', v)} label="Show prices publicly" description="Also controls what the AI assistant may quote" />
            </div>
          </div>
          {s.packages.map((p) => (
            <div key={p.id} className="rounded-2xl border border-white/[0.07] p-4">
              <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
                <Field label="Package name">
                  <Input value={p.name} onChange={(e) => setPkg(p.id, { name: e.target.value })} />
                </Field>
                <Field label="Price" hint="Empty = custom pricing">
                  <Input type="number" min={0} value={p.price ?? ''} onChange={(e) => setPkg(p.id, { price: e.target.value === '' ? null : Number(e.target.value) })} />
                </Field>
                <Field label="Price note">
                  <Input value={p.priceNote} onChange={(e) => setPkg(p.id, { priceNote: e.target.value })} placeholder="one-time, per month…" />
                </Field>
                <div className="flex items-end gap-1 pb-1">
                  <IconButton label={p.popular ? 'Unmark featured' : 'Mark as most requested'} onClick={() => setPkg(p.id, { popular: !p.popular })} className={p.popular ? 'text-gold-300' : ''}>
                    <Star className={cx('h-4 w-4', p.popular && 'fill-gold-300')} />
                  </IconButton>
                  <IconButton label="Remove package" onClick={() => set('packages', s.packages.filter((x) => x.id !== p.id))} className="hover:text-rose-300">
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>
              <div className="mt-3">
                <ListEditor value={p.features} onChange={(v) => setPkg(p.id, { features: v })} placeholder="Add an inclusion…" />
              </div>
            </div>
          ))}
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => set('packages', [...s.packages, { id: uid('pk_'), name: 'New package', price: null, priceNote: 'starting', features: [], popular: false }])}>
            Add package
          </Button>
        </div>
      )}
      {tab === 'seo' && <SeoFields title={s.seoTitle} description={s.seoDescription} url={`/services/${s.slug}`} onTitle={(v) => set('seoTitle', v)} onDescription={(v) => set('seoDescription', v)} />}
      <div className="mt-5 flex items-center gap-3 border-t border-white/[0.06] pt-4 text-sm">
        <span className="text-slate-400">Status:</span>
        <Select value={s.status} onChange={(e) => set('status', e.target.value as Service['status'])} className="w-40">
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </Select>
      </div>
    </Modal>
  );
}
