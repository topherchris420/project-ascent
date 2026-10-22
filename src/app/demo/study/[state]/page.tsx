import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DemoPricingStudio } from '@/components/demo-pricing-studio';
import { isStudyState, STUDY_STATES } from '@/lib/study-states';

/** Prepared states for facilitated comprehension sessions; see docs/usability/facilitator-guide.md. */
export const dynamicParams = false;
export const generateStaticParams = () => STUDY_STATES.map(state => ({ state }));
export const metadata: Metadata = {
  title: 'Prepared practice session · Ascent',
  description: 'A fictional practice home in a prepared state for a facilitated comprehension session.',
  robots: { index: false, follow: false },
};
export default async function StudySessionPage({ params }: { params: Promise<{ state: string }> }) {
  const { state } = await params;
  if (!isStudyState(state)) notFound();
  return <DemoPricingStudio session={state} />;
}
