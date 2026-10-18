import type { Metadata } from 'next';
import { MarylandPricingStudio } from '@/components/maryland-pricing-studio';
export const metadata: Metadata = {
  title: 'Price a Maryland home · Ascent',
  description:
    'Montgomery and Prince George’s public-record pricing using size, quality grade, location and sale timing. Published accuracy, including missed criteria. No bedroom or bathroom data.',
};
export default function MarylandPage() {
  return <MarylandPricingStudio />;
}
