/**
 * CONTACT & SOCIAL INFORMATION
 * Edit this file to update the address, phone, email, hours, and social links
 * used in the Navbar, Contact section, and Footer.
 *
 * SOURCING NOTE: address/phone/email below were found via public search-engine
 * listings referencing the firm's existing site and could not be re-verified
 * directly (this environment's network access to alpellas.com is blocked).
 * Double-check every field against the real site or the firm before publishing.
 */

export const contact = {
  address: {
    line1: 'Six/NEO, 26th Street', // VERIFY
    line2: 'Taguig City, Metro Manila',
    country: 'Philippines',
  },
  phones: ['(632) 869-4353', '(632) 869-4344'], // VERIFY
  email: 'info@alpellas.com', // VERIFY
  // PLACEHOLDER — not published anywhere found; confirm actual hours.
  hours: [
    { days: 'Monday – Friday', time: '8:00 AM – 5:00 PM' },
    { days: 'Saturday – Sunday', time: 'Closed' },
  ],
  social: {
    facebook: 'https://www.facebook.com/p/Pellas-Associates-Co-100086086014187/',
  },
  mapEmbedQuery: 'Six/NEO 26th Street Taguig City Metro Manila Philippines',
} as const;
