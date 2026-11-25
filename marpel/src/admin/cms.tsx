// Shared bits for content-management screens.
import { Archive, Eye, EyeOff, FilePen } from 'lucide-react';
import { Button, Field, Input, Textarea } from '../components/ui';
import type { ContentStatus } from '../lib/types';
import { cx } from '../lib/utils';

export function StatusActions({ status, onChange }: { status: ContentStatus; onChange: (s: ContentStatus) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {status !== 'published' && (
        <Button size="sm" variant="gold" icon={<Eye className="h-3.5 w-3.5" />} onClick={() => onChange('published')}>
          Publish
        </Button>
      )}
      {status === 'published' && (
        <Button size="sm" icon={<EyeOff className="h-3.5 w-3.5" />} onClick={() => onChange('draft')}>
          Unpublish
        </Button>
      )}
      {status === 'archived' ? (
        <Button size="sm" icon={<FilePen className="h-3.5 w-3.5" />} onClick={() => onChange('draft')}>
          Restore to draft
        </Button>
      ) : (
        <Button size="sm" variant="ghost" icon={<Archive className="h-3.5 w-3.5" />} onClick={() => onChange('archived')}>
          Archive
        </Button>
      )}
    </div>
  );
}

export function SeoFields({ title, description, url, onTitle, onDescription }: { title: string; description: string; url: string; onTitle: (v: string) => void; onDescription: (v: string) => void }) {
  return (
    <div className="space-y-4">
      <Field label="Meta title" hint={`${title.length}/60 characters`}>
        <Input value={title} onChange={(e) => onTitle(e.target.value)} className={cx(title.length > 60 && 'border-amber-400/60')} />
      </Field>
      <Field label="Meta description" hint={`${description.length}/160 characters`}>
        <Textarea rows={2} value={description} onChange={(e) => onDescription(e.target.value)} className={cx(description.length > 160 && 'border-amber-400/60')} />
      </Field>
      <div className="rounded-xl border border-white/10 bg-white p-4">
        <p className="text-[11px] text-slate-500">Google search preview</p>
        <p className="mt-1 truncate text-xs text-emerald-700">www.marpeltech.example{url}</p>
        <p className="truncate text-lg leading-snug text-[#1a0dab]">{title || 'Page title'}</p>
        <p className="line-clamp-2 text-sm text-slate-600">{description || 'Page description…'}</p>
      </div>
    </div>
  );
}
