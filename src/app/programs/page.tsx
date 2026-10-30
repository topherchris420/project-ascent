import type { Metadata } from 'next';
import { HomebuyerPrograms } from '@/components/homebuyer-programs';

export const metadata: Metadata = {
  title: 'Homebuyer programs to ask about · Ascent',
  description:
    'Compare your situation with the posted rules of DC, Maryland, Montgomery County and Prince George’s County homebuyer assistance programs. Every rule is dated and linked to its official source. Free, nothing saved.',
};

export default function ProgramsPage() {
  return <HomebuyerPrograms />;
}
