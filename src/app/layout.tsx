import type { Metadata } from 'next';
import './globals.css';
import './decision.css';
export const metadata: Metadata = {
  title: 'Ascent · Real estate intelligence for homeowners',
  description:
    'Free, open-source real estate intelligence for homeowners. Explore covered DC and Maryland homes, inspect comparable sales, challenge assumptions and review published limitations. No account required for public studios.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
