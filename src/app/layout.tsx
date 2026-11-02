import type { Metadata, Viewport } from 'next';
import { siteOrigin } from '@/lib/site-origin';
import './globals.css';
import './decision.css';
import './public.css';
const title = 'Ascent · Real estate intelligence for homeowners';
const description =
  'Free, open-source real estate intelligence for homeowners. Explore covered DC and Maryland homes, inspect comparable sales, challenge assumptions and review published limitations. No account required for public studios.';
export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title,
  description,
  applicationName: 'Ascent',
  openGraph: { type: 'website', siteName: 'Ascent', title, description },
  twitter: { card: 'summary_large_image', title, description },
};
export const viewport: Viewport = { themeColor: '#faf9f6' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
