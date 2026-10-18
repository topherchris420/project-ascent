import type { Metadata } from 'next';
import './globals.css';
import './decision.css';
export const metadata: Metadata = {
  title: 'Ascent · Real estate, reasoned.',
  description:
    'Know the price. Show the why. Analyze a DC home, inspect comparable sales, test assumptions and build a source-linked report. No account needed.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
