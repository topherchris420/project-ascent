import type { Metadata } from 'next';
import { SavedHomes } from '@/components/saved-homes';
export const metadata: Metadata = {
  title: 'My Home · Ascent',
  description:
    'Your browser-local homeowner profiles, evidence passports and financial decision history. No account required.',
};
export default function HomePage() {
  return <SavedHomes />;
}
