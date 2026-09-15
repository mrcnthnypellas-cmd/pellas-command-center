import { quickServices } from '@/data/services';
import { Container } from '@/components/ui/Container';

export function QuickServicesBar() {
  return (
    <div className="border-b border-navy-900/10 bg-white">
      <Container>
        <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 py-6 sm:justify-between">
          {quickServices.map((service, i) => (
            <li key={service} className="flex items-center gap-3 text-sm font-medium text-navy-700">
              <span className="text-gold-500">0{i + 1}</span>
              {service}
            </li>
          ))}
        </ul>
      </Container>
    </div>
  );
}
