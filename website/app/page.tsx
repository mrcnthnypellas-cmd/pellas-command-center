import type { Metadata } from 'next';
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
import { company } from '@/data/company';

export const metadata: Metadata = {
  title: `${company.name} | ${company.designation}`,
  description: company.heroDescription,
};

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <QuickServicesBar />
        <AboutSection />
        <ServicesSection />
        <IndustriesSection />
        <ProcessSection />
        <WhyChooseUsSection />
        <CTASection />
        <ContactSection />
      </main>
      <Footer />
    </>
  );
}
