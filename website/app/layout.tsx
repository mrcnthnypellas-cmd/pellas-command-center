import type { Metadata, Viewport } from 'next';
import { Inter, Fraunces } from 'next/font/google';
import '../styles/globals.css';
import { company } from '@/data/company';
import { contact } from '@/data/contact';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  axes: ['opsz'],
});

const siteUrl = 'http://localhost:3000';
const title = `${company.name} | ${company.designation}`;
const description = company.heroDescription;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    template: `%s | ${company.name}`,
  },
  description,
  keywords: [
    'accounting firm Philippines',
    'CPA Philippines',
    'tax services',
    'audit and assurance',
    'business registration Philippines',
    'bookkeeping',
    company.name,
  ],
  openGraph: {
    type: 'website',
    title,
    description,
    url: siteUrl,
    siteName: company.name,
    locale: 'en_PH',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a1220',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'AccountingService',
    name: company.name,
    description: company.heroDescription,
    email: contact.email,
    telephone: contact.phones[0],
    address: {
      '@type': 'PostalAddress',
      streetAddress: contact.address.line1,
      addressLocality: contact.address.line2,
      addressCountry: contact.address.country,
    },
    sameAs: [contact.social.facebook],
  };

  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="font-sans">
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
