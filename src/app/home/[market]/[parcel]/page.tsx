import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HomeownerOS } from '@/components/homeowner-os';
import { isHomeRoute } from '@/lib/home-routes';

export const metadata: Metadata = {
  title: 'Homeowner OS · Ascent',
  description:
    'One home’s public-record timeline, market watch, offer comparison, decisions, transaction room and agent sharing. Free, no account required for public research, no AI model in any figure.',
  robots: { index: false },
};

/** The proxy already answers an unknown address with a 404; this check keeps the page safe without it. */
export default async function HomeownerOsPage({ params }: { params: Promise<{ market: string; parcel: string }> }) {
  const { market, parcel } = await params;
  let decoded = parcel;
  try {
    decoded = decodeURIComponent(parcel);
  } catch {
    notFound();
  }
  if (!isHomeRoute(market, decoded)) notFound();
  return <HomeownerOS market={market} parcel={decoded} />;
}
