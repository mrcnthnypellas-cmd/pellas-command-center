/**
 * SERVICES
 * Add, remove, or edit service cards here. `icon` refers to a lucide-react icon name
 * (see https://lucide.dev/icons) rendered by <ServiceCard />.
 *
 * Service names/categories below are drawn from the existing site's published service
 * pages (accounting-bookkeeping, business-registration, business-process-outsourcing-bpo,
 * information-systems-services, etc.) found via search. Edit descriptions freely.
 */

export type Service = {
  slug: string;
  name: string;
  description: string;
  icon:
    | 'Calculator'
    | 'ShieldCheck'
    | 'Receipt'
    | 'LineChart'
    | 'Building2'
    | 'Cloud'
    | 'Users';
};

export const services: Service[] = [
  {
    slug: 'accounting-bookkeeping',
    name: 'Accounting & Bookkeeping',
    description:
      'Accurate ledgers, recorded transactions, and monthly financial statements that give you a clear, current picture of your business.',
    icon: 'Calculator',
  },
  {
    slug: 'audit-assurance',
    name: 'Audit & Assurance',
    description:
      'Independent, thorough review of your financial records to support compliance, lender requirements, and sound decision-making.',
    icon: 'ShieldCheck',
  },
  {
    slug: 'tax-services',
    name: 'Tax Services',
    description:
      'Tax compliance and advisory support to help your business meet its obligations accurately and on time.',
    icon: 'Receipt',
  },
  {
    slug: 'business-advisory',
    name: 'Business Advisory',
    description:
      'Management, business, and legal advisory support for companies navigating growth, compliance, and operational change.',
    icon: 'LineChart',
  },
  {
    slug: 'business-registration',
    name: 'Business Registration',
    description:
      'End-to-end assistance for local and foreign entities registering a branch, subsidiary, representative office, or headquarters in the Philippines.',
    icon: 'Building2',
  },
  {
    slug: 'payroll-cloud-accounting',
    name: 'Payroll & Cloud Accounting',
    description:
      'Cloud-based accounting and payroll services that give you real-time access and control over your numbers, wherever you are.',
    icon: 'Cloud',
  },
  {
    slug: 'business-process-outsourcing',
    name: 'Business Process Outsourcing',
    description:
      'Outsourced accounting and back-office support so your team can focus on running the business, not the paperwork.',
    icon: 'Users',
  },
];

// Short labels used in the quick services bar just below the hero.
export const quickServices = [
  'Accounting Services',
  'Audit & Assurance',
  'Tax Services',
  'Business Advisory',
];
