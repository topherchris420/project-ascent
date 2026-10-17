import type { Metadata } from 'next';
import { DemoPricingStudio } from '@/components/demo-pricing-studio';
export const metadata: Metadata = {
  title: 'Pricing Studio · Try Ascent without an account',
  description:
    'Inspect comparable evidence, challenge a pricing decision and open a reproducible practice report. Clearly fictional data; real deterministic calculations.',
};
export default function DemoPage() {
  return <DemoPricingStudio />;
}
