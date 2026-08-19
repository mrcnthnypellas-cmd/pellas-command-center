import { ExternalLink } from 'lucide-react';

// Static outbound links only, per spec §5.11 — no login forms or credential storage
// for any government service ever happen in this app.
const LINKS = [
  { name: 'SSS', url: 'https://www.sss.gov.ph', description: 'Social Security System' },
  { name: 'PhilHealth', url: 'https://www.philhealth.gov.ph', description: 'Philippine Health Insurance Corporation' },
  { name: 'Pag-IBIG Fund', url: 'https://www.pagibigfund.gov.ph', description: 'Home Development Mutual Fund' },
  { name: 'BIR', url: 'https://www.bir.gov.ph', description: 'Bureau of Internal Revenue' },
  { name: 'DTI', url: 'https://www.dti.gov.ph', description: 'Department of Trade and Industry' },
  { name: 'SEC', url: 'https://www.sec.gov.ph', description: 'Securities and Exchange Commission' },
  { name: 'DOLE', url: 'https://www.dole.gov.ph', description: 'Department of Labor and Employment' },
  { name: 'PRC', url: 'https://www.prc.gov.ph', description: 'Professional Regulation Commission' },
];

export default function GovServicesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Government Services</h1>
        <p className="text-sm text-slate-500">
          Quick links to official government portals. This app never collects or stores your credentials
          for these services — you sign in directly on each site.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LINKS.map((link) => (
          <a
            key={link.name}
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="card flex items-start justify-between p-4 transition-shadow hover:shadow-md"
          >
            <div>
              <div className="font-medium text-slate-900">{link.name}</div>
              <div className="mt-0.5 text-xs text-slate-500">{link.description}</div>
            </div>
            <ExternalLink className="h-4 w-4 shrink-0 text-slate-400" />
          </a>
        ))}
      </div>
    </div>
  );
}
