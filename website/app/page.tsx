import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Hero } from '@/components/sections/Hero';
import { QuickServicesBar } from '@/components/sections/QuickServicesBar';
import { AboutSection } from '@/components/sections/AboutSection';
import { ServicesSection } from '@/components/sections/ServicesSection';
import { IndustriesSection } from '@/components/sections/IndustriesSection';
import { ProcessSection } from '@/components/sections/ProcessSection';
import { WhyChooseUsSection } from '@/components/sections/WhyChooseUsSection';
import { CTASection } from '@/components/sections/CTASection';
import { ContactSection } from '@/components/sections/ContactSection';
import { getSiteContent, getServicesList } from '@/lib/site-content';

// Content is dashboard-editable and stored in the database, so this page must
// be rendered fresh on every request rather than frozen at build time.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [{ company, contact }, services] = await Promise.all([getSiteContent(), getServicesList()]);
  const quickServiceItems = services.slice(0, 4).map((s) => s.name);

  return (
    <>
      <Navbar company={company} />
      <main>
        <Hero company={company} />
        <QuickServicesBar items={quickServiceItems} />
        <AboutSection company={company} />
        <ServicesSection services={services} />
        <IndustriesSection />
        <ProcessSection />
        <WhyChooseUsSection />
        <CTASection />
        <ContactSection company={company} contact={contact} services={services} />
      </main>
      <Footer company={company} contact={contact} services={services} />
    </>
  );
}
