import type { Metadata } from 'next';
import { DcPricingStudio } from '@/components/dc-pricing-studio';
export const metadata: Metadata = {
  title: 'Price a DC condo · Ascent',
  description:
    'Search District condominium records by unit address, inspect recorded condo sales and build a draft. Condo accuracy is unmeasured; ranges are uncalibrated.',
};
export default function DcCondosPage() {
  return <DcPricingStudio condos />;
}
