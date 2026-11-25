import { ArrowLeft, ArrowRight, Calendar, Tag } from 'lucide-react';
import { Fragment, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Artwork, useMeta } from '../../components/brand';
import { Badge, SearchInput, Tabs } from '../../components/ui';
import { useDB } from '../../lib/store';
import { BLOG_CATEGORIES, type BlogPost } from '../../lib/types';
import { fmtDate } from '../../lib/utils';
import { CTABand, PageHero, Section } from '../sections';
import NotFound from './NotFound';

const TOPIC: Record<string, string> = {
  CCTV: 'CCTV and Security Systems',
  MikroTik: 'MikroTik and Network Solutions',
  Networking: 'MikroTik and Network Solutions',
  'Wi-Fi': 'IT Infrastructure and Technical Services',
  Project: 'IT Projects',
};
export const postTopic = (p: BlogPost) => TOPIC[p.tags[0] ?? ''] ?? 'Website Development';

/** Tiny, safe markdown renderer (headings, bullets, bold) — no raw HTML is ever injected. */
export function Markdown({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  const inline = (s: string): ReactNode[] =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>));
  return (
    <div className="prose-marpel">
      {blocks.map((b, i) => {
        if (b.startsWith('## ')) return <h2 key={i}>{inline(b.slice(3))}</h2>;
        const lines = b.split('\n');
        if (lines.every((l) => l.trim().startsWith('- ')))
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.trim().slice(2))}</li>
              ))}
            </ul>
          );
        return <p key={i}>{inline(b)}</p>;
      })}
    </div>
  );
}

export function BlogIndex() {
  const db = useDB();
  useMeta('blog');
  const [cat, setCat] = useState('All');
  const [q, setQ] = useState('');
  const posts = db.posts.filter((p) => p.status === 'published').sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
  const shown = posts.filter((p) => (cat === 'All' || p.category === cat) && (!q || `${p.title} ${p.excerpt} ${p.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase())));
  const [lead, ...rest] = shown;
  return (
    <>
      <PageHero eyebrow="Blog & announcements" title="IT tips, updates and news." body="Practical guides from our engineers, technology updates, promotions and company announcements." />
      <Section>
        <div className="mb-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <Tabs value={cat} onChange={setCat} tabs={[{ value: 'All', label: 'All' }, ...BLOG_CATEGORIES.map((c) => ({ value: c, label: c }))]} />
          <SearchInput value={q} onChange={setQ} placeholder="Search articles…" className="lg:w-72" />
        </div>
        {!lead ? (
          <p className="py-16 text-center text-slate-500">No articles found.</p>
        ) : (
          <>
            <Link to={`/blog/${lead.slug}`} className="group mb-10 grid overflow-hidden rounded-3xl border border-white/[0.07] bg-navy-900/60 transition hover:border-gold-400/40 lg:grid-cols-2">
              <div className="aspect-video lg:aspect-auto">
                <Artwork topic={postTopic(lead)} image={lead.cover} label={lead.title} iconSize="h-14 w-14" />
              </div>
              <div className="flex flex-col justify-center p-8 lg:p-12">
                <Badge tone="gold" className="self-start">
                  {lead.category}
                </Badge>
                <h2 className="mt-4 font-display text-3xl font-semibold text-white group-hover:text-gold-100">{lead.title}</h2>
                <p className="mt-3 text-slate-400">{lead.excerpt}</p>
                <p className="mt-6 flex items-center gap-2 text-sm text-slate-500">
                  <Calendar className="h-4 w-4" /> {fmtDate(lead.publishedAt)} · {lead.author}
                </p>
              </div>
            </Link>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {rest.map((p) => (
                <Link key={p.id} to={`/blog/${p.slug}`} className="group overflow-hidden rounded-2xl border border-white/[0.07] bg-navy-900/60 transition hover:border-gold-400/40">
                  <div className="aspect-video overflow-hidden">
                    <Artwork topic={postTopic(p)} image={p.cover} label={p.title} className="transition duration-500 group-hover:scale-105" />
                  </div>
                  <div className="p-6">
                    <p className="text-xs text-gold-300">{p.category}</p>
                    <h3 className="mt-2 font-display text-lg font-semibold text-white group-hover:text-gold-100">{p.title}</h3>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-400">{p.excerpt}</p>
                    <p className="mt-4 text-xs text-slate-500">{fmtDate(p.publishedAt)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </Section>
    </>
  );
}

export function BlogPostPage() {
  const { slug } = useParams();
  const db = useDB();
  const post = db.posts.find((p) => p.slug === slug && p.status === 'published');
  useMeta('blog', post ? { title: `${post.title} | Marpel Tech Blog`, description: post.excerpt } : undefined);
  if (!post) return <NotFound />;
  const more = db.posts.filter((p) => p.status === 'published' && p.id !== post.id).slice(0, 3);
  return (
    <>
      <article className="mx-auto max-w-3xl px-5 pb-10 pt-12 lg:pt-16">
        <Link to="/blog" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-gold-200">
          <ArrowLeft className="h-4 w-4" /> All articles
        </Link>
        <Badge tone="gold" className="mt-8">
          {post.category}
        </Badge>
        <h1 className="mt-4 font-display text-4xl font-semibold leading-tight text-white sm:text-5xl">{post.title}</h1>
        <p className="mt-4 text-lg text-slate-400">{post.excerpt}</p>
        <div className="mt-6 flex flex-wrap items-center gap-4 border-b border-white/[0.06] pb-6 text-sm text-slate-500">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4" /> {fmtDate(post.publishedAt)}
          </span>
          <span>{post.author}</span>
          <span className="flex items-center gap-1.5">
            <Tag className="h-4 w-4" /> {post.tags.join(', ')}
          </span>
        </div>
        <div className="my-8 aspect-video overflow-hidden rounded-2xl border border-white/10">
          <Artwork topic={postTopic(post)} image={post.cover} label={post.title} iconSize="h-14 w-14" />
        </div>
        <Markdown text={post.body} />
      </article>
      {more.length > 0 && (
        <Section className="pt-6">
          <h2 className="mb-6 font-display text-xl font-semibold text-white">More articles</h2>
          <div className="grid gap-5 md:grid-cols-3">
            {more.map((p) => (
              <Link key={p.id} to={`/blog/${p.slug}`} className="group rounded-2xl border border-white/[0.07] bg-navy-900/60 p-5 hover:border-gold-400/40">
                <p className="text-xs text-gold-300">{p.category}</p>
                <h3 className="mt-2 font-display font-semibold text-white group-hover:text-gold-100">{p.title}</h3>
                <span className="mt-3 inline-flex items-center gap-1 text-xs text-gold-200">
                  Read <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
            ))}
          </div>
        </Section>
      )}
      <CTABand />
    </>
  );
}
