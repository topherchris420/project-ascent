import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * The header and footer every public page shares: one wordmark, the same tools in the same order, and the
 * landing page's type and palette (see public.css). The signed-in workspace keeps its own navigation.
 */
export type SiteSection = 'find' | 'sales' | 'programs' | 'sample' | 'home' | 'accuracy';

const NAV: readonly { key: SiteSection; href: string; label: string }[] = [
  { key: 'find', href: '/#find-home', label: 'Find a home' },
  { key: 'sales', href: '/sales', label: 'Recorded sales' },
  { key: 'programs', href: '/programs', label: 'Buyer programs' },
  { key: 'sample', href: '/demo', label: 'Sample' },
  { key: 'home', href: '/home', label: 'My Home' },
  { key: 'accuracy', href: '/accuracy', label: 'Accuracy' },
];

export function SiteBrand() {
  return (
    <Link className="site-brand" href="/" aria-label="Ascent home">
      ascent
      <span className="site-brand-tag" aria-hidden="true">
        DC·MD
      </span>
    </Link>
  );
}

export function SiteHeader({ label, current, action }: { label?: string; current?: SiteSection; action?: ReactNode }) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <div className="site-header-id">
          <SiteBrand />
          {label && <span className="site-section">{label}</span>}
        </div>
        <nav className="site-nav" aria-label="Ascent tools">
          {NAV.map(item => (
            <Link key={item.key} href={item.href} aria-current={item.key === current ? 'page' : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
        {action && <div className="site-header-action">{action}</div>}
      </div>
    </header>
  );
}

const FOOTER: readonly { title: string; links: readonly [string, string][] }[] = [
  {
    title: 'Explore',
    links: [
      ['/dc', 'DC homes'],
      ['/maryland', 'Maryland homes'],
      ['/dc/condos', 'DC condos'],
      ['/sales', 'Recorded sales'],
    ],
  },
  {
    title: 'Decide',
    links: [
      ['/home', 'My Home'],
      ['/programs', 'Buyer programs'],
      ['/demo', 'Interactive sample'],
    ],
  },
  {
    title: 'Trust',
    links: [
      ['/accuracy', 'Accuracy'],
      ['/free', 'Free forever'],
    ],
  },
];

export function SiteFooter({ note }: { note?: ReactNode }) {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-top">
          <div className="site-footer-brand">
            <SiteBrand />
            <p>Free, open-source real estate intelligence for homeowners.</p>
            <p>Decision aid, not an appraisal. Sample data is fictional.</p>
          </div>
          <nav className="site-footer-links" aria-label="Ascent pages">
            {FOOTER.map(group => (
              <div key={group.title}>
                <h2>{group.title}</h2>
                <ul>
                  {group.links.map(([href, text]) => (
                    <li key={href}>
                      <Link href={href}>{text}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="site-footer-bottom">
          <p>{note ?? 'Built from public records, not live MLS listings.'}</p>
          <p className="site-status">
            <i aria-hidden="true" /> Public tools need no account
          </p>
        </div>
      </div>
    </footer>
  );
}
