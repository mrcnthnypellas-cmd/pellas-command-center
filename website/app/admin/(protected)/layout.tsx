import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { LogoutButton } from '@/components/admin/LogoutButton';

export const dynamic = 'force-dynamic';

const navItems = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/inquiries', label: 'Inquiries' },
  { href: '/admin/content', label: 'Site Content' },
  { href: '/admin/services', label: 'Services' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-navy-50/40">
      <header className="border-b border-navy-900/10 bg-navy-950">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-8">
            <span className="font-serif text-lg text-ivory">Dashboard</span>
            <nav className="flex gap-6" aria-label="Admin">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href} className="text-sm text-navy-300 hover:text-ivory">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/" target="_blank" className="inline-flex items-center gap-1.5 text-sm text-navy-300 hover:text-ivory">
              View site <ExternalLink size={14} />
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
