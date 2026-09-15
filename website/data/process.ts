/** HOW WE WORK — five-step engagement process shown in <ProcessSection />. */

export type ProcessStep = {
  number: string;
  title: string;
  description: string;
};

export const processSteps: ProcessStep[] = [
  {
    number: '01',
    title: 'Understand',
    description: 'We start by learning your business, your goals, and where your numbers stand today.',
  },
  {
    number: '02',
    title: 'Assess',
    description: 'We review your records, systems, and compliance position to identify what needs attention.',
  },
  {
    number: '03',
    title: 'Plan',
    description: 'We map out a clear, practical plan tailored to your business and regulatory requirements.',
  },
  {
    number: '04',
    title: 'Deliver',
    description: 'We execute the work — accounting, tax, audit, or advisory — with accuracy and clear communication.',
  },
  {
    number: '05',
    title: 'Support',
    description: 'We remain available as an ongoing partner as your business and its needs evolve.',
  },
];
