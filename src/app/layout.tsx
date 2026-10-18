import type { Metadata } from 'next';
import './globals.css';
import './decision.css';
export const metadata: Metadata = {
  title: 'Ascent · Real estate, reasoned.',
  description:
    'Analyze covered DC and Maryland homes or explore unvalidated DC condo pricing. Inspect comparable sales, published accuracy and limitations, test assumptions and build a source-linked report. No account needed.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
