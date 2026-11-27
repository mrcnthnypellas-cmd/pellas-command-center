import { ExternalLink, Plus, Quote, Save, Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, ICON_CHOICES } from '../components/icons';
import { Badge, Button, Card, CardHeader, ConfirmButton, Field, IconButton, ImageInput, Input, ListEditor, Modal, PageHeader, Select, Stars, StatusBadge, Tabs, Textarea, Toggle } from '../components/ui';
import { actorOf, audit } from '../lib/actions';
import { useSession, useStore, useToast } from '../lib/store';
import type { Feature, SiteContent, Testimonial } from '../lib/types';
import { uid } from '../lib/utils';
import { SeoFields, StatusActions } from './cms';

type Tab = 'home' | 'about' | 'testimonials' | 'footer' | 'seo';

function FeatureEditor({ value, onChange }: { value: Feature[]; onChange: (v: Feature[]) => void }) {
  return (
    <div className="space-y-3">
      {value.map((f, i) => (
        <div key={f.id} className="grid gap-2 rounded-xl border border-white/[0.07] p-3 sm:grid-cols-[120px_1fr_auto]">
          <Select value={f.icon} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, icon: e.target.value } : x)))} aria-label="Icon">
            {ICON_CHOICES.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </Select>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Icon name={f.icon} className="h-4 w-4 shrink-0 text-gold-300" />
              <Input value={f.title} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder="Title" />
            </div>
            <Textarea rows={2} value={f.desc} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, desc: e.target.value } : x)))} placeholder="Description" />
          </div>
          <IconButton label="Remove" onClick={() => onChange(value.filter((_, j) => j !== i))} className="hover:text-rose-300">
            <Trash2 className="h-4 w-4" />
          </IconButton>
        </div>
      ))}
      <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => onChange([...value, { id: uid('f_'), icon: 'Sparkles', title: '', desc: '' }])}>
        Add item
      </Button>
    </div>
  );
}

const SEO_PAGES: [string, string, string][] = [
  ['home', 'Home', '/'],
  ['about', 'About Us', '/about'],
  ['services', 'Services', '/services'],
  ['portfolio', 'Portfolio', '/portfolio'],
  ['blog', 'Blog', '/blog'],
  ['contact', 'Contact', '/contact'],
  ['quote', 'Request a Quote', '/quote'],
  ['book', 'Book a Consultation', '/book'],
  ['track', 'Track Project', '/track'],
];

export default function Content() {
  const { db, update } = useStore();
  const { user } = useSession();
  const { push } = useToast();
  const [tab, setTab] = useState<Tab>('home');
  const [c, setC] = useState<SiteContent>(() => structuredClone(db.content));
  const [seoPage, setSeoPage] = useState('home');
  const [t, setT] = useState<Testimonial | null>(null);
  const dirty = JSON.stringify(c) !== JSON.stringify(db.content);
  const setHero = (k: keyof SiteContent['hero'], v: string | undefined) => setC({ ...c, hero: { ...c.hero, [k]: v } });
  const setAbout = <K extends keyof SiteContent['about']>(k: K, v: SiteContent['about'][K]) => setC({ ...c, about: { ...c.about, [k]: v } });

  const save = () => {
    update((d) => {
      d.content = c;
      audit(d, actorOf(user), 'Updated website content', tab);
    });
    push({ tone: 'success', title: 'Website content published', body: 'Changes are live on the public site.' });
  };

  return (
    <>
      <PageHeader
        title="Website content"
        subtitle="Edit the public website without touching code. Business name, logo and contact details live in Business Settings."
        actions={
          <>
            <Link to="/" target="_blank">
              <Button icon={<ExternalLink className="h-4 w-4" />}>Preview site</Button>
            </Link>
            {tab !== 'testimonials' && (
              <>
                <Button variant="ghost" icon={<Undo2 className="h-4 w-4" />} disabled={!dirty} onClick={() => setC(structuredClone(db.content))}>
                  Discard
                </Button>
                <Button variant="gold" icon={<Save className="h-4 w-4" />} disabled={!dirty} onClick={save}>
                  Publish changes
                </Button>
              </>
            )}
          </>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-5"
        tabs={[
          { value: 'home', label: 'Homepage' },
          { value: 'about', label: 'About Us' },
          { value: 'testimonials', label: 'Testimonials', count: db.testimonials.length },
          { value: 'footer', label: 'Footer & banner' },
          { value: 'seo', label: 'SEO' },
        ]}
      />
      {dirty && tab !== 'testimonials' && <p className="mb-4 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-2 text-sm text-amber-100">You have unpublished changes.</p>}

      {tab === 'home' && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader title="Hero banner" />
            <div className="space-y-4 p-5">
              <Field label="Eyebrow">
                <Input value={c.hero.eyebrow} onChange={(e) => setHero('eyebrow', e.target.value)} />
              </Field>
              <Field label="Headline">
                <Input value={c.hero.title} onChange={(e) => setHero('title', e.target.value)} />
              </Field>
              <Field label="Highlighted text (gold)">
                <Input value={c.hero.highlight} onChange={(e) => setHero('highlight', e.target.value)} />
              </Field>
              <Field label="Subtitle">
                <Textarea rows={3} value={c.hero.subtitle} onChange={(e) => setHero('subtitle', e.target.value)} />
              </Field>
              <Field label="Background image (optional)" hint="Shown subtly behind the hero">
                <ImageInput value={c.hero.image} onChange={(v) => setHero('image', v)} />
              </Field>
            </div>
          </Card>
          <div className="space-y-6">
            <Card>
              <CardHeader title="Business introduction" />
              <div className="space-y-4 p-5">
                <Field label="Title">
                  <Input value={c.intro.title} onChange={(e) => setC({ ...c, intro: { ...c.intro, title: e.target.value } })} />
                </Field>
                <Field label="Body">
                  <Textarea rows={4} value={c.intro.body} onChange={(e) => setC({ ...c, intro: { ...c.intro, body: e.target.value } })} />
                </Field>
              </div>
            </Card>
            <Card>
              <CardHeader title="Headline statistics" subtitle="Leave empty to hide the statistics strip on the homepage" action={<Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setC({ ...c, stats: [...c.stats, { id: uid('st_'), value: '', label: '' }] })}>Add</Button>} />
              <div className="grid gap-3 p-5 sm:grid-cols-2">
                {c.stats.length === 0 && <p className="text-sm text-slate-500 sm:col-span-2">No statistics: the strip is hidden on the homepage.</p>}
                {c.stats.map((s, i) => (
                  <div key={s.id} className="flex gap-2">
                    <Input value={s.value} onChange={(e) => setC({ ...c, stats: c.stats.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} className="w-24" aria-label="Value" />
                    <Input value={s.label} onChange={(e) => setC({ ...c, stats: c.stats.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} aria-label="Label" />
                    <IconButton label="Remove" onClick={() => setC({ ...c, stats: c.stats.filter((_, j) => j !== i) })} className="hover:text-rose-300">
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <CardHeader title="Call-to-action band" />
              <div className="space-y-4 p-5">
                <Input value={c.ctaBand.title} onChange={(e) => setC({ ...c, ctaBand: { ...c.ctaBand, title: e.target.value } })} aria-label="CTA title" />
                <Textarea rows={2} value={c.ctaBand.body} onChange={(e) => setC({ ...c, ctaBand: { ...c.ctaBand, body: e.target.value } })} aria-label="CTA body" />
              </div>
            </Card>
          </div>
          <Card>
            <CardHeader title="Why choose Marpel" />
            <div className="p-5">
              <FeatureEditor value={c.whyChoose} onChange={(v) => setC({ ...c, whyChoose: v })} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Our expertise" />
            <div className="space-y-3 p-5">
              {c.expertise.map((e, i) => (
                <div key={e.id} className="flex items-center gap-3">
                  <Input value={e.label} onChange={(ev) => setC({ ...c, expertise: c.expertise.map((x, j) => (j === i ? { ...x, label: ev.target.value } : x)) })} aria-label="Expertise" />
                  <IconButton label="Remove" onClick={() => setC({ ...c, expertise: c.expertise.filter((_, j) => j !== i) })} className="hover:text-rose-300">
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              ))}
              <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setC({ ...c, expertise: [...c.expertise, { id: uid('e_'), label: 'New expertise', level: 80 }] })}>
                Add expertise
              </Button>
            </div>
          </Card>
        </div>
      )}

      {tab === 'about' && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader title="Company profile" />
            <div className="space-y-4 p-5">
              <Field label="Headline">
                <Input value={c.about.headline} onChange={(e) => setAbout('headline', e.target.value)} />
              </Field>
              <Field label="Year founded">
                <Input value={c.about.founded} onChange={(e) => setAbout('founded', e.target.value)} />
              </Field>
              <Field label="Company profile">
                <Textarea rows={4} value={c.about.profile} onChange={(e) => setAbout('profile', e.target.value)} />
              </Field>
              <Field label="Company background">
                <Textarea rows={5} value={c.about.background} onChange={(e) => setAbout('background', e.target.value)} />
              </Field>
              <Field label="Mission">
                <Textarea rows={3} value={c.about.mission} onChange={(e) => setAbout('mission', e.target.value)} />
              </Field>
              <Field label="Vision">
                <Textarea rows={3} value={c.about.vision} onChange={(e) => setAbout('vision', e.target.value)} />
              </Field>
            </div>
          </Card>
          <div className="space-y-6">
            <Card>
              <CardHeader title="Core values" />
              <div className="p-5">
                <FeatureEditor value={c.about.values} onChange={(v) => setAbout('values', v)} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Professional capabilities" />
              <div className="p-5">
                <ListEditor value={c.about.capabilities} onChange={(v) => setAbout('capabilities', v)} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Why customers should choose us" />
              <div className="p-5">
                <ListEditor value={c.about.whyUs} onChange={(v) => setAbout('whyUs', v)} />
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'testimonials' && (
        <>
          <div className="mb-4 flex justify-end">
            <Button variant="gold" icon={<Plus className="h-4 w-4" />} onClick={() => setT({ id: uid('t_'), name: '', role: '', company: '', quote: '', rating: 5, service: db.services[0]?.name ?? '', status: 'draft' })}>
              Add testimonial
            </Button>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {db.testimonials.map((x) => (
              <Card key={x.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <Quote className="h-6 w-6 text-gold-400/50" />
                  <StatusBadge status={x.status} />
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">“{x.quote}”</p>
                <div className="mt-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">{x.name}</p>
                    <p className="text-xs text-slate-500">
                      {x.role}, {x.company}
                    </p>
                  </div>
                  <Stars value={x.rating} />
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5 border-t border-white/[0.06] pt-4">
                  <Button size="sm" onClick={() => setT(structuredClone(x))}>
                    Edit
                  </Button>
                  <StatusActions status={x.status} onChange={(st) => update((d) => (d.testimonials.find((y) => y.id === x.id)!.status = st))} />
                  <Badge tone="slate" className="ml-auto self-center">
                    {x.service}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {tab === 'footer' && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader title="Footer" />
            <div className="space-y-4 p-5">
              <Field label="Footer description">
                <Textarea rows={3} value={c.footer.blurb} onChange={(e) => setC({ ...c, footer: { ...c.footer, blurb: e.target.value } })} />
              </Field>
              <Field label="Copyright line" hint="{year} is replaced automatically">
                <Input value={c.footer.copyright} onChange={(e) => setC({ ...c, footer: { ...c.footer, copyright: e.target.value } })} />
              </Field>
              <p className="text-xs text-slate-500">
                Contact details, hours and social links in the footer come from{' '}
                <Link to="/admin/settings" className="text-gold-200 underline">
                  Business Settings
                </Link>
                .
              </p>
            </div>
          </Card>
          <Card>
            <CardHeader title="Announcement bar" subtitle="Thin gold banner at the top of every page" />
            <div className="space-y-4 p-5">
              <Toggle checked={c.announcementBar.enabled} onChange={(v) => setC({ ...c, announcementBar: { ...c.announcementBar, enabled: v } })} label="Show announcement bar" />
              <Field label="Text">
                <Input value={c.announcementBar.text} onChange={(e) => setC({ ...c, announcementBar: { ...c.announcementBar, text: e.target.value } })} />
              </Field>
              <Field label="Link">
                <Select value={c.announcementBar.link} onChange={(e) => setC({ ...c, announcementBar: { ...c.announcementBar, link: e.target.value } })}>
                  {SEO_PAGES.map(([, label, url]) => (
                    <option key={url} value={url}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>
        </div>
      )}

      {tab === 'seo' && (
        <Card>
          <CardHeader title="Search engine optimisation" subtitle="Meta titles and descriptions per page. Service pages and blog posts have their own SEO fields." />
          <div className="grid gap-6 p-5 lg:grid-cols-[220px_1fr]">
            <ul className="space-y-1">
              {SEO_PAGES.map(([k, label]) => (
                <li key={k}>
                  <button type="button" onClick={() => setSeoPage(k)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${seoPage === k ? 'bg-gold-400/15 text-gold-100' : 'text-slate-400 hover:bg-white/5'}`}>
                    {label}
                  </button>
                </li>
              ))}
            </ul>
            <SeoFields
              title={c.seo[seoPage]?.title ?? ''}
              description={c.seo[seoPage]?.description ?? ''}
              url={SEO_PAGES.find((p) => p[0] === seoPage)?.[2] ?? '/'}
              onTitle={(v) => setC({ ...c, seo: { ...c.seo, [seoPage]: { ...(c.seo[seoPage] ?? { description: '' }), title: v } } })}
              onDescription={(v) => setC({ ...c, seo: { ...c.seo, [seoPage]: { ...(c.seo[seoPage] ?? { title: '' }), description: v } } })}
            />
          </div>
        </Card>
      )}

      {t && (
        <Modal
          open
          onClose={() => setT(null)}
          title={db.testimonials.some((x) => x.id === t.id) ? 'Edit testimonial' : 'New testimonial'}
          footer={
            <>
              {db.testimonials.some((x) => x.id === t.id) && (
                <ConfirmButton
                  label="Delete testimonial"
                  onConfirm={() => {
                    update((d) => (d.testimonials = d.testimonials.filter((x) => x.id !== t.id)));
                    setT(null);
                  }}
                />
              )}
              <span className="flex-1" />
              <Button
                variant="gold"
                disabled={!t.name.trim() || !t.quote.trim()}
                onClick={() => {
                  update((d) => {
                    const i = d.testimonials.findIndex((x) => x.id === t.id);
                    if (i >= 0) d.testimonials[i] = t;
                    else d.testimonials.push(t);
                    audit(d, actorOf(user), 'Saved testimonial', t.name);
                  });
                  setT(null);
                  push({ tone: 'success', title: 'Testimonial saved' });
                }}
              >
                Save
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required>
              <Input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} />
            </Field>
            <Field label="Role">
              <Input value={t.role} onChange={(e) => setT({ ...t, role: e.target.value })} />
            </Field>
            <Field label="Company">
              <Input value={t.company} onChange={(e) => setT({ ...t, company: e.target.value })} />
            </Field>
            <Field label="Service">
              <Select value={t.service} onChange={(e) => setT({ ...t, service: e.target.value })}>
                {db.services.map((s) => (
                  <option key={s.id}>{s.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Quote" required className="sm:col-span-2">
              <Textarea rows={4} value={t.quote} onChange={(e) => setT({ ...t, quote: e.target.value })} />
            </Field>
            <Field label="Rating">
              <Stars value={t.rating} onChange={(v) => setT({ ...t, rating: v })} />
            </Field>
            <Field label="Status">
              <Select value={t.status} onChange={(e) => setT({ ...t, status: e.target.value as Testimonial['status'] })}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
}
