/**
 * INDUSTRIES / CLIENT TYPES
 * Reflects the client types described on the existing site (individuals, partnerships,
 * corporations, non-profit associations, and foreign businesses entering the Philippines).
 * Edit freely once you have a confirmed list of industries actually served.
 */

export type Industry = {
  name: string;
  description: string;
  image: string;
};

export const industries: Industry[] = [
  {
    name: 'Small & Medium Businesses',
    description: 'Day-to-day accounting, tax, and payroll support that scales as you grow.',
    image: '/images/industry-business.jpg',
  },
  {
    name: 'Corporations',
    description: 'Audit, compliance, and advisory support for established corporate entities.',
    image: '/images/industry-corporate.jpg',
  },
  {
    name: 'Foreign-Owned Enterprises',
    description: 'Registration and ongoing compliance for foreign companies establishing Philippine operations.',
    image: '/images/industry-foreign.jpg',
  },
  {
    name: 'Entrepreneurs & Professionals',
    description: 'Practical, personal accounting and tax guidance for individuals and sole proprietors.',
    image: '/images/industry-entrepreneurs.jpg',
  },
  {
    name: 'Non-Profit Organizations',
    description: 'Financial reporting and compliance support tailored to non-profit associations.',
    image: '/images/industry-nonprofit.jpg',
  },
];
