import type { Metadata } from 'next';
import { DcPricingStudio } from '@/components/dc-pricing-studio';
export const metadata: Metadata = {
  title: 'Price a DC home · Ascent',
  description:
    'Search a single-family home in Washington, DC and inspect a deterministic pricing decision built from District public records (CC BY 4.0), with validated accuracy and every recorded sale shown.',
};
export default function DcPage() {
  return <DcPricingStudio />;
}
