import { ExternalLink, Newspaper, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, ConfirmButton, EmptyState, Field, ImageInput, Input, ListEditor, Modal, PageHeader, SearchInput, Select, StatusBadge, Table, Tabs, Td, Textarea, Th } from '../components/ui';
import { actorOf, audit } from '../lib/actions';
import { useSession, useStore, useToast } from '../lib/store';
import { BLOG_CATEGORIES, type BlogPost } from '../lib/types';
import { fmtDate, slugify, uid } from '../lib/utils';
import { Markdown } from '../public/pages/Blog';
import { SeoFields, StatusActions } from './cms';

export default function BlogAdmin() {
  const { db, update } = useStore();
  const { user } = useSession();
  const { push } = useToast();
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const posts = db.posts
    .filter((p) => filter === 'all' || p.status === filter)
    .filter((p) => !q || `${p.title} ${p.category} ${p.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <>
      <PageHeader
        title="Blog & announcements"
        subtitle="IT tips, technology updates, announcements, promotions and tutorials."
        actions={
          <Button
            variant="gold"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setEditing({ id: uid('b_'), title: '', slug: '', category: 'IT Tips', excerpt: '', body: '', author: user?.name ?? 'Marpel Tech Team', tags: [], status: 'draft', updatedAt: new Date().toISOString() })}
          >
            New post
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs
          value={filter}
          onChange={setFilter}
          tabs={[
            { value: 'all', label: 'All', count: db.posts.length },
            { value: 'published', label: 'Published', count: db.posts.filter((p) => p.status === 'published').length },
            { value: 'draft', label: 'Drafts', count: db.posts.filter((p) => p.status === 'draft').length },
            { value: 'archived', label: 'Archived', count: db.posts.filter((p) => p.status === 'archived').length },
          ]}
        />
        <SearchInput value={q} onChange={setQ} placeholder="Search posts…" className="md:w-72" />
      </div>
      <Card>
        {posts.length === 0 ? (
          <EmptyState icon={<Newspaper className="h-6 w-6" />} title="No posts" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Title</Th>
                <Th>Category</Th>
                <Th>Published</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id} className="hover:bg-white/[0.03]">
                  <Td>
                    <p className="text-slate-100">{p.title}</p>
                    <p className="text-xs text-slate-500">/blog/{p.slug}</p>
                  </Td>
                  <Td>
                    <Badge tone="gold">{p.category}</Badge>
                  </Td>
                  <Td className="text-xs">{p.publishedAt ? fmtDate(p.publishedAt) : '—'}</Td>
                  <Td>
                    <StatusBadge status={p.status} />
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(structuredClone(p))}>
                        Edit
                      </Button>
                      <StatusActions
                        status={p.status}
                        onChange={(st) => {
                          update((d) => {
                            const x = d.posts.find((y) => y.id === p.id)!;
                            x.status = st;
                            if (st === 'published' && !x.publishedAt) x.publishedAt = new Date().toISOString();
                            x.updatedAt = new Date().toISOString();
                            audit(d, actorOf(user), `Post ${st}`, p.title);
                          });
                          push({ tone: 'success', title: `Post ${st}` });
                        }}
                      />
                      {p.status === 'published' && (
                        <a href={`#/blog/${p.slug}`} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="ghost" icon={<ExternalLink className="h-3.5 w-3.5" />}>
                            View
                          </Button>
                        </a>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {editing && <PostEditor initial={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function PostEditor({ initial, onClose }: { initial: BlogPost; onClose: () => void }) {
  const { db, update } = useStore();
  const { user } = useSession();
  const { push } = useToast();
  const [p, setP] = useState(initial);
  const [tab, setTab] = useState<'write' | 'preview' | 'seo'>('write');
  const [err, setErr] = useState('');
  const isNew = !db.posts.some((x) => x.id === p.id);
  const set = <K extends keyof BlogPost>(k: K, v: BlogPost[K]) => setP({ ...p, [k]: v });
  const save = (status?: BlogPost['status']) => {
    if (p.title.trim().length < 3) return setErr('Title is required.');
    const slug = p.slug || slugify(p.title);
    if (db.posts.some((x) => x.slug === slug && x.id !== p.id)) return setErr('Slug already used by another post.');
    const st = status ?? p.status;
    update((d) => {
      const rec = { ...p, slug, status: st, updatedAt: new Date().toISOString(), publishedAt: st === 'published' ? p.publishedAt ?? new Date().toISOString() : p.publishedAt };
      const i = d.posts.findIndex((x) => x.id === p.id);
      if (i >= 0) d.posts[i] = rec;
      else d.posts.push(rec);
      audit(d, actorOf(user), st === 'published' ? 'Published post' : 'Saved post', rec.title);
    });
    push({ tone: 'success', title: st === 'published' ? 'Post published' : 'Draft saved' });
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'New post' : 'Edit post'}
      size="xl"
      footer={
        <>
          {!isNew && (
            <ConfirmButton
              label="Delete post"
              onConfirm={() => {
                update((d) => {
                  d.posts = d.posts.filter((x) => x.id !== p.id);
                  audit(d, actorOf(user), 'Deleted post', p.title);
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
          <Button onClick={() => save(p.status === 'published' ? 'published' : 'draft')}>{p.status === 'published' ? 'Save changes' : 'Save draft'}</Button>
          {p.status !== 'published' && (
            <Button variant="gold" onClick={() => save('published')}>
              Publish
            </Button>
          )}
        </>
      }
    >
      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-5"
        tabs={[
          { value: 'write', label: 'Write' },
          { value: 'preview', label: 'Preview' },
          { value: 'seo', label: 'SEO' },
        ]}
      />
      {tab === 'write' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="space-y-4">
            <Field label="Title" required>
              <Input value={p.title} onChange={(e) => setP({ ...p, title: e.target.value, slug: isNew ? slugify(e.target.value) : p.slug })} />
            </Field>
            <Field label="Excerpt">
              <Input value={p.excerpt} onChange={(e) => set('excerpt', e.target.value)} />
            </Field>
            <Field label="Body" hint="Formatting: ## Heading, - bullet list, **bold**. Blank line between paragraphs.">
              <Textarea rows={14} value={p.body} onChange={(e) => set('body', e.target.value)} className="font-mono text-[13px]" />
            </Field>
          </div>
          <div className="space-y-4">
            <Field label="Cover image">
              <ImageInput value={p.cover} onChange={(v) => set('cover', v)} />
            </Field>
            <Field label="Category">
              <Select value={p.category} onChange={(e) => set('category', e.target.value as BlogPost['category'])}>
                {BLOG_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Publish date">
              <Input type="date" value={(p.publishedAt ?? '').slice(0, 10)} onChange={(e) => set('publishedAt', e.target.value ? new Date(e.target.value + 'T09:00').toISOString() : undefined)} />
            </Field>
            <Field label="Author">
              <Input value={p.author} onChange={(e) => set('author', e.target.value)} />
            </Field>
            <Field label="URL slug">
              <Input value={p.slug} onChange={(e) => set('slug', slugify(e.target.value))} />
            </Field>
            <Field label="Tags">
              <ListEditor value={p.tags} onChange={(v) => set('tags', v)} placeholder="Add tag" />
            </Field>
          </div>
        </div>
      )}
      {tab === 'preview' && (
        <article className="mx-auto max-w-2xl">
          <Badge tone="gold">{p.category}</Badge>
          <h1 className="mt-3 font-display text-3xl font-semibold text-white">{p.title || 'Untitled'}</h1>
          <p className="mt-2 text-slate-400">{p.excerpt}</p>
          {p.cover && <img src={p.cover} alt="" className="mt-6 aspect-video w-full rounded-xl object-cover" />}
          <Markdown text={p.body} />
        </article>
      )}
      {tab === 'seo' && <SeoFields title={p.title} description={p.excerpt} url={`/blog/${p.slug}`} onTitle={(v) => set('title', v)} onDescription={(v) => set('excerpt', v)} />}
    </Modal>
  );
}
