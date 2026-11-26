// Editable website content: business settings, CMS copy, services, portfolio,
// blog, testimonials and AI FAQs. All of it is SAMPLE copy for the prototype —
// the owner replaces it from Admin → Website Content / Services / Settings.

import type {
  AISettings,
  Availability,
  BlogPost,
  PortfolioItem,
  Service,
  Settings,
  SiteContent,
  Testimonial,
} from './types';

export const SERVICE_NAMES = [
  'Website Development',
  'Software Development',
  'CCTV and Security Systems',
  'MikroTik and Network Solutions',
  'IT Infrastructure and Technical Services',
] as const;

export const seedSettings: Settings = {
  businessName: 'Marpel Tech & Network Solutions',
  shortName: 'Marpel Tech',
  tagline: 'Websites · Software · CCTV · Networks',
  pageLoader: true,
  email: 'hello@marpeltech.example',
  supportEmail: 'support@marpeltech.example',
  phone: '(02) 8869-4353 / (02) 8869-4344',
  mobile: '0927 003 3383',
  address: 'Unit 0, Sample Business Center, Ortigas Avenue',
  city: 'Pasig City, Metro Manila, Philippines',
  mapQuery: 'Ortigas Center, Pasig City',
  hours: [
    { day: 'Monday', open: '08:00', close: '18:00', closed: false },
    { day: 'Tuesday', open: '08:00', close: '18:00', closed: false },
    { day: 'Wednesday', open: '08:00', close: '18:00', closed: false },
    { day: 'Thursday', open: '08:00', close: '18:00', closed: false },
    { day: 'Friday', open: '08:00', close: '18:00', closed: false },
    { day: 'Saturday', open: '09:00', close: '15:00', closed: false },
    { day: 'Sunday', open: '00:00', close: '00:00', closed: true },
  ],
  socials: {
    facebook: 'https://facebook.com/marpeltech',
    instagram: 'https://instagram.com/marpeltech',
    linkedin: 'https://linkedin.com/company/marpeltech',
    youtube: 'https://youtube.com/@marpeltech',
    tiktok: '',
  },
  currency: 'PHP',
  currencySymbol: '₱',
  taxLabel: 'VAT',
  defaultTaxRate: 12,
  quotationPrefix: 'MTN-Q',
  quotationValidityDays: 30,
  defaultPaymentTerms:
    '50% down payment upon approval, 40% upon installation / development completion, 10% upon turnover and acceptance.',
  defaultQuotationTerms: [
    'Prices are valid until the expiration date stated on this quotation.',
    'Work begins upon receipt of the signed quotation and down payment.',
    'Equipment carries the manufacturer warranty; workmanship is warranted for 6 months from turnover.',
    'Additional work outside the stated scope will be quoted separately.',
    'Site conditions not visible during inspection may affect final costs; any change will be agreed in writing first.',
  ].join('\n'),
  tin: '000-000-000-00000',
  adminNotificationEmail: 'owner@marpeltech.example',
  emailEvents: {
    new_inquiry: true,
    new_message: true,
    appointment_request: true,
    appointment_confirmation: true,
    quotation_status: true,
    project_update: true,
    new_customer: false,
  },
  emailProvider: 'Not connected',
};

export const seedContent: SiteContent = {
  announcementBar: {
    enabled: true,
    text: 'Now booking free CCTV site inspections for December — limited slots.',
    link: '/book',
  },
  hero: {
    eyebrow: 'IT · Software · Security · Networks',
    title: 'Technology that keeps your business',
    highlight: 'connected, secure and growing.',
    subtitle:
      'Marpel Tech & Network Solutions designs websites, builds custom business software, installs CCTV systems and engineers reliable MikroTik networks — delivered by one accountable team.',
  },
  intro: {
    title: 'One partner for your entire technology stack',
    body:
      'From the first website visitor to the last network cable, we plan, build and support the systems your business runs on. We combine software craftsmanship with hands-on field engineering, so your web presence, operations software, security cameras and network all work together.',
  },
  stats: [
    { id: 's1', value: '150+', label: 'Projects delivered' },
    { id: 's2', value: '98%', label: 'Client satisfaction' },
    { id: 's3', value: '24h', label: 'Average response time' },
    { id: 's4', value: '5', label: 'Core service lines' },
  ],
  whyChoose: [
    { id: 'w1', icon: 'ShieldCheck', title: 'Accountable end-to-end', desc: 'One team handles assessment, build, installation and after-sales support — no finger-pointing between vendors.' },
    { id: 'w2', icon: 'Gauge', title: 'Engineered for reliability', desc: 'Proper cabling standards, tested failover, documented configurations and clean code you can maintain.' },
    { id: 'w3', icon: 'Receipt', title: 'Transparent quotations', desc: 'Itemised quotes that separate equipment, materials and labor — and no work outside scope without your approval.' },
    { id: 'w4', icon: 'Activity', title: 'Track your project online', desc: 'Every project gets a tracking reference so you can follow milestones, updates and progress photos anytime.' },
    { id: 'w5', icon: 'Headset', title: 'Responsive support', desc: 'Remote assistance and on-site visits when something needs attention, with clear service-level expectations.' },
    { id: 'w6', icon: 'Sparkles', title: 'Modern, scalable builds', desc: 'Cloud-ready software and expandable network designs that grow with your branches, staff and customers.' },
  ],
  expertise: [
    { id: 'e1', label: 'Web & cloud applications', level: 95 },
    { id: 'e2', label: 'MikroTik routing & failover', level: 92 },
    { id: 'e3', label: 'CCTV & IP surveillance', level: 94 },
    { id: 'e4', label: 'Structured cabling & Wi-Fi', level: 90 },
    { id: 'e5', label: 'Business systems (POS, inventory, HR)', level: 88 },
  ],
  ctaBand: {
    title: 'Have a project in mind?',
    body: 'Tell us what you need. We will review your requirements and get back to you with recommendations and next steps — usually within one business day.',
  },
  about: {
    headline: 'Built by engineers who answer the phone.',
    founded: '2019',
    profile:
      'Marpel Tech & Network Solutions is a Philippine IT services company providing website development, custom software, CCTV and security systems, MikroTik network engineering and IT infrastructure services to small businesses, schools, clinics, corporate offices and local government units.',
    background:
      'The company started as a small network and CCTV installation team serving neighborhood businesses. As clients asked for websites and systems to run their operations, Marpel grew into a full-service technology partner — pairing field engineers with software developers so that infrastructure and applications are designed together.',
    mission:
      'To give growing businesses dependable, secure and well-documented technology — delivered honestly, on schedule and supported long after turnover.',
    vision:
      'To be the most trusted technology partner for Filipino businesses, known for engineering quality, transparent dealings and lasting client relationships.',
    values: [
      { id: 'v1', icon: 'Handshake', title: 'Integrity', desc: 'Honest recommendations, itemised pricing and no hidden charges.' },
      { id: 'v2', icon: 'Award', title: 'Craftsmanship', desc: 'Neat cabling, clean code and documentation we are proud to hand over.' },
      { id: 'v3', icon: 'Users', title: 'Client partnership', desc: 'We learn your operations before we propose solutions.' },
      { id: 'v4', icon: 'Lock', title: 'Security first', desc: 'Secure defaults on every router, camera system and application we deliver.' },
    ],
    capabilities: [
      'Responsive websites, e-commerce and custom web applications',
      'POS, inventory, CRM, HR & payroll and management systems',
      'Analog HD and IP CCTV with NVR/DVR and remote viewing',
      'MikroTik load balancing, failover, VPN, VLAN and hotspot',
      'Structured cabling, Wi-Fi, servers, NAS and rack organization',
      'On-site and remote technical support',
    ],
    whyUs: [
      'Single point of accountability for software and hardware',
      'Itemised quotations and written scope before any work starts',
      'Online project tracking with milestone updates and photos',
      'Clean documentation and credentials turned over to you',
      'After-sales support and preventive maintenance options',
    ],
  },
  footer: {
    blurb: 'Websites, custom software, CCTV and network solutions for businesses that need technology done right.',
    copyright: '© {year} Marpel Tech & Network Solutions. All rights reserved.',
  },
  seo: {
    home: { title: 'Marpel Tech & Network Solutions | Websites, Software, CCTV & Networking', description: 'Website development, custom business software, CCTV installation and MikroTik network solutions for businesses in Metro Manila and nearby provinces.' },
    about: { title: 'About Us | Marpel Tech & Network Solutions', description: 'Learn about Marpel Tech & Network Solutions — our mission, values and the team behind your websites, software, CCTV and networks.' },
    services: { title: 'IT Services | Web, Software, CCTV, MikroTik & Infrastructure', description: 'Explore Marpel Tech services: website and software development, CCTV and security systems, MikroTik networking and IT infrastructure.' },
    portfolio: { title: 'Portfolio & Projects | Marpel Tech', description: 'Featured websites, business systems, CCTV installations and network projects delivered by Marpel Tech.' },
    blog: { title: 'IT Tips, Updates & Announcements | Marpel Tech Blog', description: 'Practical IT tips, tutorials, technology updates and company announcements from Marpel Tech.' },
    contact: { title: 'Contact Us | Marpel Tech & Network Solutions', description: 'Call, email or message Marpel Tech for websites, software, CCTV and network services.' },
    quote: { title: 'Request a Quotation | Marpel Tech', description: 'Send your project requirements and receive a detailed, itemised quotation from Marpel Tech.' },
    book: { title: 'Book a Consultation or Site Inspection | Marpel Tech', description: 'Schedule an IT consultation, CCTV site inspection or network site survey online.' },
    track: { title: 'Track Your Project | Marpel Tech Client Portal', description: 'Check the status, milestones and updates of your Marpel Tech project.' },
  },
};

const P = (id: string, name: string, price: number | null, priceNote: string, features: string[], popular = false) => ({
  id,
  name,
  price,
  priceNote,
  features,
  popular,
});

export const seedServices: Service[] = [
  {
    id: 'svc_web',
    slug: 'website-development',
    name: 'Website Development',
    icon: 'Globe',
    short: 'Fast, secure, mobile-first websites that turn visitors into inquiries.',
    description:
      'We design and develop professional websites that represent your brand, load fast on any device and make it easy for customers to contact you. Every site is built with SEO foundations, analytics and a content editor so your team can keep it up to date.',
    gallery: [],
    offerings: [
      'Business Website Development',
      'Corporate Websites',
      'E-commerce Websites',
      'Custom Web Applications',
      'Website Redesign',
      'Website Maintenance',
      'Domain and Hosting Assistance',
    ],
    features: ['Responsive, mobile-first design', 'On-page SEO and fast load times', 'Contact & inquiry forms', 'Content management for your team', 'SSL, backups and security hardening', 'Analytics and Google Business integration'],
    benefits: ['Look established and trustworthy online', 'Generate inquiries 24/7', 'Update content without a developer', 'Rank for local searches'],
    packages: [
      P('pk_w1', 'Starter Business Site', 25000, 'one-time', ['Up to 5 pages', 'Mobile responsive', 'Inquiry form', 'Basic SEO setup', '1 month support']),
      P('pk_w2', 'Corporate Website', 55000, 'one-time', ['Up to 12 pages', 'Custom design system', 'Blog / news module', 'CMS editor training', 'Analytics dashboard', '3 months support'], true),
      P('pk_w3', 'E-commerce Store', 95000, 'starting', ['Product catalog & cart', 'Payment gateway integration', 'Order management', 'Inventory sync options', '3 months support']),
    ],
    startingPrice: 25000,
    showPrice: true,
    status: 'published',
    order: 1,
    seoTitle: 'Website Development Services | Marpel Tech',
    seoDescription: 'Business, corporate and e-commerce website development with SEO, CMS and hosting assistance.',
  },
  {
    id: 'svc_soft',
    slug: 'software-development',
    name: 'Software Development',
    icon: 'Code2',
    short: 'Custom systems that automate your operations — POS, inventory, CRM, HR and more.',
    description:
      'Off-the-shelf software rarely fits how your business actually works. We build custom business systems around your process — from point-of-sale and inventory to CRM, HR and payroll — with role-based access, reports and cloud deployment.',
    gallery: [],
    offerings: [
      'Custom Business Software',
      'POS Systems',
      'Inventory Management Systems',
      'CRM Systems',
      'HR and Payroll Systems',
      'Management Systems',
      'Custom Web Applications',
      'Business Automation Solutions',
    ],
    features: ['Process discovery & workflow mapping', 'Role-based user access', 'Dashboards and exportable reports', 'Cloud or on-premise deployment', 'Data migration from spreadsheets', 'Training and documentation'],
    benefits: ['Eliminate manual spreadsheets and errors', 'Real-time visibility across branches', 'Software that matches your process', 'Own your system and your data'],
    packages: [
      P('pk_s1', 'POS & Inventory Lite', 80000, 'starting', ['Single branch POS', 'Stock in/out & alerts', 'Sales reports', 'Receipt printing']),
      P('pk_s2', 'Business Management Suite', 180000, 'starting', ['Multi-module system', 'Multi-branch support', 'Role-based access', 'Custom reports', 'Cloud deployment'], true),
      P('pk_s3', 'Custom Enterprise Build', null, 'by assessment', ['Requirements workshop', 'Integrations & APIs', 'Dedicated project manager', 'SLA-backed support']),
    ],
    startingPrice: 80000,
    showPrice: true,
    status: 'published',
    order: 2,
    seoTitle: 'Custom Software Development | POS, Inventory, CRM, HR | Marpel Tech',
    seoDescription: 'Custom POS, inventory, CRM, HR & payroll and business automation systems built around your process.',
  },
  {
    id: 'svc_cctv',
    slug: 'cctv-security-systems',
    name: 'CCTV and Security Systems',
    icon: 'Cctv',
    short: 'Professional CCTV and IP camera systems with remote viewing on your phone.',
    description:
      'Protect your people and property with properly planned surveillance. We inspect your site, recommend camera placement and coverage, install neatly, configure DVR/NVR recording and set up secure remote viewing on your phone.',
    gallery: [],
    offerings: [
      'CCTV Installation',
      'IP Camera Installation',
      'DVR/NVR Configuration',
      'Remote Viewing Setup',
      'CCTV Troubleshooting',
      'CCTV Maintenance',
      'Camera System Expansion',
    ],
    features: ['Free site inspection within service area', 'Coverage and blind-spot planning', 'Neat conduit and cable management', 'Secure remote viewing on mobile', 'Recording retention configuration', 'User training at handover'],
    benefits: ['Deter theft and incidents', 'Monitor branches remotely', 'Reliable evidence when needed', 'Expandable as you grow'],
    packages: [
      P('pk_c1', '4-Camera HD Package', 18500, 'installed', ['4 HD cameras', '4-ch DVR', '1TB storage', 'Remote viewing setup', 'Standard installation']),
      P('pk_c2', '8-Camera IP Package', 42000, 'installed', ['8 IP cameras (PoE)', '8-ch NVR', '2TB storage', 'Night vision', 'Remote viewing'], true),
      P('pk_c3', 'Enterprise Surveillance', null, 'by site inspection', ['16+ cameras', 'Multi-site viewing', 'Network integration', 'Maintenance plan']),
    ],
    startingPrice: 18500,
    showPrice: true,
    status: 'published',
    order: 3,
    seoTitle: 'CCTV Installation & IP Camera Systems | Marpel Tech',
    seoDescription: 'CCTV and IP camera installation, DVR/NVR setup, remote viewing, troubleshooting and maintenance.',
  },
  {
    id: 'svc_mtk',
    slug: 'mikrotik-network-solutions',
    name: 'MikroTik and Network Solutions',
    icon: 'Router',
    short: 'Stable, secure networks with load balancing, failover, VPN and bandwidth control.',
    description:
      'We engineer MikroTik-based networks for businesses that cannot afford downtime. Combine multiple ISPs, fail over automatically, segment traffic with VLANs, connect branches with VPN and control bandwidth fairly across users.',
    gallery: [],
    offerings: [
      'MikroTik Router Configuration',
      'Load Balancing',
      'Failover Configuration',
      'Firewall Configuration',
      'Bandwidth Management',
      'Hotspot Configuration',
      'VLAN Configuration',
      'VPN Configuration',
      'Network Optimization',
    ],
    features: ['Multi-WAN load balancing (PCC/ECMP)', 'Automatic ISP failover', 'Hardened firewall rules', 'Queue-based bandwidth management', 'Hotspot with vouchers', 'Site-to-site and remote VPN'],
    benefits: ['Stay online when an ISP fails', 'Fair bandwidth for every user', 'Secure remote access to your office', 'Documented, maintainable configs'],
    packages: [
      P('pk_m1', 'Router Configuration', 6500, 'starting', ['Basic setup & firewall', 'DHCP / DNS', 'Bandwidth queues', 'Config backup']),
      P('pk_m2', 'Dual-ISP Load Balance + Failover', 12000, 'starting', ['PCC load balancing', 'Auto failover', 'Monitoring script', 'Firewall hardening'], true),
      P('pk_m3', 'Multi-Branch VPN Network', null, 'by assessment', ['Site-to-site VPN', 'VLAN segmentation', 'Central management', 'Documentation']),
    ],
    startingPrice: 6500,
    showPrice: true,
    status: 'published',
    order: 4,
    seoTitle: 'MikroTik Configuration, Load Balancing & Failover | Marpel Tech',
    seoDescription: 'MikroTik router configuration, load balancing, failover, VPN, VLAN, hotspot and bandwidth management.',
  },
  {
    id: 'svc_infra',
    slug: 'it-infrastructure-technical-services',
    name: 'IT Infrastructure and Technical Services',
    icon: 'Server',
    short: 'Structured cabling, Wi-Fi, servers and on-call technical support.',
    description:
      'The physical foundation of your IT matters. We install structured cabling and Wi-Fi, set up servers and NAS storage, organise network racks and provide dependable technical support for computers and networks.',
    gallery: [],
    offerings: [
      'LAN Installation',
      'Structured Cabling',
      'Wi-Fi Installation',
      'Router and Switch Configuration',
      'Server Setup',
      'NAS Configuration',
      'Computer Troubleshooting',
      'Network Troubleshooting',
      'IT Technical Support',
      'Network Rack Organization',
    ],
    features: ['Cat6 cabling with labelling', 'Wi-Fi coverage planning', 'Server & NAS backup setup', 'Rack dressing and patching', 'Remote and on-site support', 'Preventive maintenance plans'],
    benefits: ['Fewer outages and faster fixes', 'Clean, labelled, traceable cabling', 'Reliable Wi-Fi in every area', 'Protected business data'],
    packages: [
      P('pk_i1', 'Technical Service Call', 2500, 'per visit', ['On-site diagnosis', 'Up to 2 hours labor', 'Service report']),
      P('pk_i2', 'Office LAN & Wi-Fi Setup', 35000, 'starting', ['Up to 20 cable runs', 'Managed switch', '2 access points', 'Rack organization'], true),
      P('pk_i3', 'Managed IT Support', 15000, 'per month', ['Monthly preventive visit', 'Remote helpdesk', 'Priority response', 'Asset inventory']),
    ],
    startingPrice: 2500,
    showPrice: true,
    status: 'published',
    order: 5,
    seoTitle: 'Structured Cabling, Wi-Fi, Servers & IT Support | Marpel Tech',
    seoDescription: 'LAN installation, structured cabling, Wi-Fi, server and NAS setup, rack organization and IT technical support.',
  },
];

export const seedTestimonials: Testimonial[] = [
  { id: 't1', name: 'Grace T.', role: 'Owner', company: 'Golden Harvest Bakeshop', quote: 'Our three branches now run on one POS and inventory system. I can see sales and stock from my phone every night. The team trained our cashiers patiently and still answers our calls.', rating: 5, service: 'Software Development', status: 'published' },
  { id: 't2', name: 'Michelle R.', role: 'Operations Manager', company: 'Northpoint Logistics Inc.', quote: 'Since the dual-ISP failover went live we have not lost connection during dispatch hours. The configuration was documented clearly and turned over to our IT staff.', rating: 5, service: 'MikroTik and Network Solutions', status: 'published' },
  { id: 't3', name: 'Dr. Ramon A.', role: 'Clinic Director', company: 'Aquino Family Dental Clinic', quote: 'Professional from site inspection to turnover. The CCTV cabling is so neat you can barely see it, and remote viewing works perfectly.', rating: 5, service: 'CCTV and Security Systems', status: 'published' },
  { id: 't4', name: 'Engr. Paolo C.', role: 'IT Coordinator', company: 'St. Benedict Academy', quote: 'They rebuilt our campus Wi-Fi and labelled every cable in the rack. Our teachers finally have stable internet in every classroom.', rating: 5, service: 'IT Infrastructure and Technical Services', status: 'published' },
  { id: 't5', name: 'Anna D.', role: 'General Manager', company: 'Dizon Boutique Resort', quote: 'The new website looks premium and our direct booking inquiries increased within the first month.', rating: 5, service: 'Website Development', status: 'published' },
  { id: 't6', name: 'Mark L.', role: 'Owner', company: 'Lopez Auto Parts', quote: 'Quick response when our network went down. Fixed the same day.', rating: 4, service: 'IT Infrastructure and Technical Services', status: 'draft' },
];

export const seedPortfolio: PortfolioItem[] = [
  { id: 'pf1', title: 'Multi-Branch POS & Inventory System', category: 'Software Development', client: 'Golden Harvest Bakeshop', location: 'Quezon City', summary: 'Cloud POS and inventory for three bakeshop branches with central reporting.', description: 'Replaced handwritten stock cards and three separate cash registers with a cloud-based POS and inventory platform. Includes branch transfers, ingredient-level stock tracking, low-stock alerts, daily sales reports and owner dashboards accessible on mobile.', completedAt: '2026-08-14', technologies: ['React', 'Node.js', 'PostgreSQL', 'Thermal printers'], featured: true, status: 'published' },
  { id: 'pf2', title: 'Dual-ISP Failover for Logistics Hub', category: 'MikroTik Configuration', client: 'Northpoint Logistics Inc.', location: 'Valenzuela City', summary: 'PCC load balancing with automatic failover and VLAN-segmented warehouse network.', description: 'Designed and deployed a MikroTik CCR-based network combining fiber and LTE links with PCC load balancing and sub-10-second failover. Segmented office, warehouse scanners, CCTV and guest Wi-Fi into VLANs with firewall policies and bandwidth queues.', completedAt: '2026-06-30', technologies: ['MikroTik CCR2004', 'PCC', 'VLAN', 'Netwatch'], featured: true, status: 'published' },
  { id: 'pf3', title: '16-Camera IP Surveillance Upgrade', category: 'CCTV Installation', client: 'Aquino Family Dental Clinic', location: 'Pasig City', summary: 'Replaced aging analog cameras with PoE IP cameras and secure remote viewing.', description: 'Site inspection, coverage planning and full replacement of an analog DVR system with 16 PoE IP cameras, a 16-channel NVR with 30-day retention and secured mobile remote viewing for the clinic owners.', completedAt: '2026-04-22', technologies: ['IP cameras', 'PoE switch', 'NVR', 'Remote viewing'], featured: true, status: 'published' },
  { id: 'pf4', title: 'Campus Structured Cabling & Wi-Fi', category: 'Network Infrastructure', client: 'St. Benedict Academy', location: 'Antipolo City', summary: '48 Cat6 runs, 12 access points and a fully organised network rack.', description: 'Re-cabled two academic buildings with labelled Cat6, installed ceiling-mounted access points with controller-based roaming and rebuilt the main rack with patch panels and cable management.', completedAt: '2026-03-10', technologies: ['Cat6', 'Managed switches', 'Wi-Fi 6 APs', 'Patch panels'], featured: false, status: 'published' },
  { id: 'pf5', title: 'Boutique Resort Website & Booking Inquiries', category: 'Website Development', client: 'Dizon Boutique Resort', location: 'Batangas', summary: 'Premium responsive website with room galleries and booking inquiry workflow.', description: 'Designed a photography-led website with room showcases, packages, a booking inquiry form routed to the front desk, Google Business integration and on-page SEO for local tourism searches.', completedAt: '2026-07-18', technologies: ['Next.js', 'Headless CMS', 'SEO', 'Analytics'], featured: true, status: 'published' },
  { id: 'pf6', title: 'Barangay Hall CCTV & Public Wi-Fi Hotspot', category: 'IT Projects', client: 'Barangay San Isidro', location: 'Rizal', summary: 'CCTV coverage for the hall and plaza plus a voucher-based public hotspot.', description: 'Installed eight outdoor cameras covering the barangay hall and plaza, and deployed a MikroTik hotspot with time-limited vouchers and bandwidth limits per user.', completedAt: '2026-02-05', technologies: ['MikroTik Hotspot', 'Outdoor IP cameras', 'Point-to-point wireless'], featured: false, status: 'published' },
  { id: 'pf7', title: 'HR & Payroll System for Trading Company', category: 'Software Development', client: 'Uy Trading Corp.', location: 'Manila', summary: 'Attendance, leave and payroll computation with government contribution tables.', description: 'Built a web-based HR and payroll system with biometric attendance import, leave workflows, payroll computation including SSS, PhilHealth and Pag-IBIG tables, and payslip generation.', completedAt: '2025-12-12', technologies: ['React', 'PostgreSQL', 'PDF generation'], featured: false, status: 'published' },
  { id: 'pf8', title: 'Server Room Rack Re-organization', category: 'Network Infrastructure', client: 'Santos Law Office', location: 'Makati City', summary: 'Before-and-after rack cleanup with labelling and NAS backup.', description: 'Untangled and re-patched the office rack, replaced damaged patch cords, labelled all ports and configured a NAS with scheduled backups for case files.', completedAt: '2026-09-03', technologies: ['Patch panels', 'NAS', 'Cable management'], featured: false, status: 'published' },
];

const BODY_1 = `Most CCTV problems we are called for are not camera failures — they are planning problems. Before you buy cameras, walk through these five questions.

## 1. What exactly do you need to see?
"Coverage" is not enough. Decide whether each camera must identify faces, read plate numbers or simply observe movement. Identification needs more pixels on the subject, which affects lens choice and mounting height.

## 2. Where will the recorder live?
Your DVR/NVR should be in a secured, ventilated location — ideally inside a locked cabinet. If thieves can take the recorder, they take the evidence.

## 3. How many days of recording do you need?
Retention drives storage size. Thirty days is a common requirement for businesses; confirm with your insurer or management.

## 4. How will you view remotely?
Remote viewing should use secured accounts with strong passwords and updated firmware. Never leave default credentials.

## 5. Who maintains it?
Lenses get dusty, drives fail and power supplies age. A simple quarterly maintenance check prevents surprises.

Need help planning? Book a free site inspection and we will map coverage with you.`;

const BODY_2 = `When your business depends on internet, a single ISP is a single point of failure. MikroTik routers can combine two or more connections so you get more total bandwidth and automatic failover.

## Load balancing vs failover
Load balancing spreads connections across ISPs. Failover moves traffic to a backup link when the primary stops responding. Most businesses want both.

## What we configure
- Per-connection classifier (PCC) rules so sessions stay on one ISP
- Recursive routes or Netwatch checks that detect real internet loss, not just a link light
- Firewall rules and NAT for each WAN
- Queues so one heavy user does not slow down everyone else

## Before you start
Get your ISP details ready: connection type, static or dynamic IP and modem access. Then talk to us about a configuration plan.`;

const BODY_3 = `We are excited to share that Marpel Tech now offers online project tracking for every client.

Each project receives a unique tracking reference. Using the reference and your access PIN, you can see milestones, progress percentage, the target completion date and progress photos uploaded by our team.

Visit the **Track Project** page to try it.`;

export const seedPosts: BlogPost[] = [
  { id: 'b1', title: '5 Questions to Answer Before Installing CCTV', slug: '5-questions-before-installing-cctv', category: 'IT Tips', excerpt: 'Most CCTV problems are planning problems. Answer these five questions before buying cameras.', body: BODY_1, author: 'Marpel Tech Team', tags: ['CCTV', 'Security'], status: 'published', publishedAt: '2026-11-12T09:00:00.000Z', updatedAt: '2026-11-12T09:00:00.000Z' },
  { id: 'b2', title: 'MikroTik Load Balancing & Failover, Explained', slug: 'mikrotik-load-balancing-failover-explained', category: 'Tutorials', excerpt: 'How combining two ISPs keeps your business online — and what a proper configuration includes.', body: BODY_2, author: 'Marpel Tech Team', tags: ['MikroTik', 'Networking'], status: 'published', publishedAt: '2026-10-28T09:00:00.000Z', updatedAt: '2026-10-28T09:00:00.000Z' },
  { id: 'b3', title: 'Introducing Online Project Tracking for Clients', slug: 'introducing-online-project-tracking', category: 'Company Announcements', excerpt: 'Every Marpel Tech project now comes with a tracking reference and live milestone updates.', body: BODY_3, author: 'Marpel Tech Team', tags: ['Announcement'], status: 'published', publishedAt: '2026-10-05T09:00:00.000Z', updatedAt: '2026-10-05T09:00:00.000Z' },
  { id: 'b4', title: 'December Promo: Free Site Inspection for CCTV Packages', slug: 'december-promo-free-cctv-site-inspection', category: 'Service Promotions', excerpt: 'Book a CCTV site inspection this December at no charge within our service area.', body: 'Book your CCTV site inspection this December and we will waive the inspection fee within our standard service area. Slots are limited — reserve yours through the Book a Consultation page.\n\nTerms: valid for bookings made until December 20. Service area restrictions apply.', author: 'Marpel Tech Team', tags: ['Promo', 'CCTV'], status: 'published', publishedAt: '2026-11-20T09:00:00.000Z', updatedAt: '2026-11-20T09:00:00.000Z' },
  { id: 'b5', title: 'Wi-Fi 7 for Small Offices: Worth It Yet?', slug: 'wifi-7-small-offices', category: 'Technology Updates', excerpt: 'A practical look at whether small offices should upgrade access points this year.', body: 'Draft — outline: what changed in Wi-Fi 7, client device support, cost comparison, when Wi-Fi 6 is still the right choice.', author: 'Marpel Tech Team', tags: ['Wi-Fi'], status: 'draft', updatedAt: '2026-11-22T09:00:00.000Z' },
  { id: 'b6', title: 'Project Update: Campus Network for St. Benedict Academy', slug: 'project-update-st-benedict-campus-network', category: 'Project Updates', excerpt: '48 cable runs, 12 access points and one very tidy rack.', body: 'We completed the campus structured cabling and Wi-Fi project for St. Benedict Academy. Highlights include labelled Cat6 runs across two buildings, controller-managed access points and a rebuilt main rack.', author: 'Marpel Tech Team', tags: ['Project', 'Wi-Fi'], status: 'published', publishedAt: '2026-03-15T09:00:00.000Z', updatedAt: '2026-03-15T09:00:00.000Z' },
];

export const seedStageTemplates: Record<string, string[]> = {
  'Website Development': ['Planning', 'Design', 'Development', 'Testing', 'Client Review', 'Deployment Preparation', 'Completed'],
  'Software Development': ['Requirements', 'System Design', 'Development', 'QA Testing', 'User Acceptance', 'Deployment', 'Completed'],
  'CCTV and Security Systems': ['Initial Assessment', 'Site Inspection', 'Quotation Approval', 'Installation', 'Configuration', 'Testing', 'Handover'],
  'MikroTik and Network Solutions': ['Site Assessment', 'Network Planning', 'Configuration', 'Testing', 'Monitoring', 'Handover'],
  'IT Infrastructure and Technical Services': ['Site Assessment', 'Network Planning', 'Cabling', 'Equipment Installation', 'Configuration', 'Testing', 'Handover'],
};

export const seedAvailability: Availability = {
  workingDays: [1, 2, 3, 4, 5, 6],
  start: '09:00',
  end: '17:00',
  slotMinutes: 60,
  durations: {
    'IT Consultation': 60,
    'Website Consultation': 60,
    'Software Consultation': 90,
    'CCTV Site Inspection': 120,
    'Network Site Survey': 120,
    'Technical Support': 60,
    'Other Services': 60,
  },
  blackoutDates: [
    { id: 'bo1', date: '2026-12-24', reason: 'Christmas Eve' },
    { id: 'bo2', date: '2026-12-25', reason: 'Christmas Day' },
    { id: 'bo3', date: '2026-12-30', reason: 'Rizal Day' },
    { id: 'bo4', date: '2026-12-31', reason: "New Year's Eve" },
  ],
  maxPerSlot: 1,
  leadTimeHours: 24,
};

export const seedAI: AISettings = {
  enabled: true,
  name: 'Marpel Assist',
  greeting:
    "Hi! I'm Marpel Assist, the virtual assistant of Marpel Tech & Network Solutions. I can explain our services, help you describe your project, and prepare a quotation request for our team. What can I help you with today?",
  tone: 'Friendly',
  handoffMode: 'offer',
  missesBeforeHandoff: 2,
  collectLeads: true,
  showStartingPrices: true,
  fallbackMessage:
    "I'm not certain about that, and I don't want to give you wrong information. I can forward your question to our team so a person can answer it.",
  businessContext:
    'Service area: Metro Manila, Rizal, Laguna, Cavite and Bulacan. Projects outside the area are evaluated case by case. Site inspections for CCTV and networks are free within Metro Manila. Final prices are always confirmed through a written quotation after assessment.',
  faqs: [
    { id: 'faq1', question: 'Do you offer free site inspection?', answer: 'Yes — CCTV and network site inspections are free within Metro Manila. Outside Metro Manila a minimal transportation fee may apply, which our team will confirm before scheduling.', keywords: ['inspection', 'site visit', 'free', 'ocular', 'survey'], enabled: true },
    { id: 'faq2', question: 'What areas do you serve?', answer: 'We serve Metro Manila, Rizal, Laguna, Cavite and Bulacan. Projects outside these areas are evaluated case by case.', keywords: ['area', 'location', 'serve', 'province', 'where'], enabled: true },
    { id: 'faq3', question: 'How long does a website take?', answer: 'A typical business website takes 2–4 weeks from approved design to launch. Larger corporate or e-commerce sites take longer; the exact timeline is set in your quotation.', keywords: ['how long', 'timeline', 'weeks', 'duration'], enabled: true },
    { id: 'faq4', question: 'What payment terms do you offer?', answer: 'Our standard terms are 50% down payment upon approval, 40% upon completion of installation or development, and 10% upon turnover. Terms are confirmed in each quotation.', keywords: ['payment', 'terms', 'down payment', 'installment', 'pay'], enabled: true },
    { id: 'faq5', question: 'Do you provide warranty?', answer: 'Equipment carries the manufacturer warranty and our workmanship is covered for 6 months from turnover. Specific coverage is listed in your quotation.', keywords: ['warranty', 'guarantee'], enabled: true },
    { id: 'faq6', question: 'Can I track my project online?', answer: 'Yes. Every project gets a tracking reference and access PIN. Visit the Track Project page to see milestones, progress and updates.', keywords: ['track', 'status', 'progress', 'portal'], enabled: true },
    { id: 'faq7', question: 'Do you sell MikroTik routers?', answer: 'We can supply MikroTik routers and switches as part of a configuration project, or configure equipment you already own.', keywords: ['buy', 'sell', 'router', 'supply', 'equipment'], enabled: true },
  ],
  conversations: [],
};
