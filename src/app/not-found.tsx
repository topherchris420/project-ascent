import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';

const PLACES: readonly [string, string, string][] = [
  ['/#find-home', 'Find your home', 'Covered DC and Maryland addresses'],
  ['/sales', 'Search recorded sales', 'What homes like yours sold for'],
  ['/programs', 'Check buyer programs', 'Published DC and Maryland rules'],
  ['/demo', 'Try the sample', 'A fictional home, the real engine'],
];

export default function NotFound() {
  return (
    <div className="studio-page">
      <SiteHeader />
      <main className="public-main">
        <span className="public-eyebrow">404 · Not found</span>
        <h1 className="public-title">This page isn’t here.</h1>
        <p className="public-lede">
          The address may be mistyped, or the home may be outside the covered DC and Maryland records. Everything public
          is still one step away.
        </p>
        <nav className="public-links" aria-label="Where to go next">
          {PLACES.map(([href, title, detail]) => (
            <Link key={href} href={href}>
              <strong>
                {title} <ArrowRight size={16} aria-hidden="true" />
              </strong>
              <span>{detail}</span>
            </Link>
          ))}
        </nav>
      </main>
      <SiteFooter />
    </div>
  );
}
