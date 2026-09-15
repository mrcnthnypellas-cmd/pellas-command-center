/**
 * CORE COMPANY INFORMATION
 * Edit this file to update the company name, tagline, and about text everywhere on the site.
 *
 * SOURCING NOTE: Fields marked "VERIFY" below were pulled from public search-engine listings
 * of the firm's existing site (alpellas.com) and could not be re-checked against the live
 * pages directly from this environment. Please confirm/correct them before this goes live.
 * Fields marked "PLACEHOLDER" were not found anywhere and are safe, generic defaults only —
 * replace with the real copy.
 */

export const company = {
  name: 'Pellas & Associates Co.',
  legalName: 'Pellas, Associates & Co.', // VERIFY — also seen as "A.L. Pellas & Associates"
  shortName: 'Pellas & Associates',
  designation: 'Certified Public Accountants',
  tagline: 'Trusted Accounting. Smarter Business Decisions.',
  taglineEyebrow: 'ACCOUNTING • AUDIT • TAX • ADVISORY',

  heroDescription:
    'A Philippine accounting and consultancy firm serving individuals, partnerships, corporations, and non-profit organizations — including foreign businesses establishing operations in the Philippines — with accounting, tax, audit, and advisory support you can rely on.',

  // PLACEHOLDER — replace with the firm's actual story / founding narrative.
  aboutHeadline: 'More Than Numbers.\nWe Build Stronger Businesses.',
  aboutStory: [
    'Pellas & Associates Co. is a Philippine accounting and consultancy firm based in Metro Manila, providing accounting, tax, audit, business registration, and advisory services to a wide range of clients — from individuals and small businesses to corporations and non-profit organizations.',
    'The firm also assists foreign investors and companies looking to establish and maintain operations in the Philippines, offering local expertise combined with a clear, client-first approach to every engagement.',
    'This paragraph is a PLACEHOLDER — replace it with your firm\'s actual history, founding story, and mission in its own words.',
  ],

  logo: {
    initials: 'PA',
    // Set to a path under /public/images (e.g. "/images/logo.png") once the real logo is available.
    imageSrc: null as string | null,
  },
} as const;
