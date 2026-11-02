import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';

export const metadata: Metadata = {
  title: 'The free-service promise · Ascent',
  description:
    'Ascent’s public research, comparable-sale analysis, reports and core workflows stay free, with no account, subscription or payment card. What costs money, what happens at a limit, and what free does not promise.',
};

const FREE: readonly [string, string][] = [
  [
    'Public tools, without an account',
    'Public pricing studios do not require an account. Recorded-sales search, the buyer-program screener and the Home Decision Brief work the same way.',
  ],
  [
    'The core work stays free, permanently',
    'Public-record research, basic comparable-sale analysis, reports, clients, offers and deadline workflows will remain free permanently. Creating a workspace is free.',
  ],
  [
    'No subscription, no payment card',
    'You do not need a subscription or payment card to use them. No paid Ascent plans are currently offered, and new Stripe checkout is disabled even if old price settings remain configured.',
  ],
];

const LIMITS: readonly string[] = [
  'Hosted AI and outside property providers cost money to operate. They have usage limits and may require your own authorized provider access.',
  'When a limit is reached, Ascent stops those requests; it never bills you automatically. Deterministic analysis remains available.',
  'A third party’s data license or service fee is separate from Ascent.',
  'Professional verification and source permissions control licensed-data access. Paying cannot grant those rights.',
  'Historical subscription records and an existing-customer management portal are retained for cleanup. The older Professional, Team and Enterprise definitions are legacy compatibility code, not current offers. They do not narrow the permanent free features listed here.',
];

export default function FreePromisePage() {
  return (
    <div className="studio-page">
      <a className="skip-link" href="#free-main">
        Skip to the promise
      </a>
      <SiteHeader label="Free forever" />
      <main id="free-main" className="public-main">
        <span className="public-eyebrow">The free-service promise</span>
        <h1 className="public-title">
          Homeowners deserve the evidence. <span>Ascent stays free.</span>
        </h1>
        <p className="public-lede">
          Ascent is for homeowners and anyone who wants to understand a property decision, not just licensed agents.
          Free is a product commitment, not a limited-time beta.
        </p>
        <div className="public-actions">
          <Link className="button primary" href="/#find-home">
            Find your home <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link className="button" href="/sales">
            Search recorded sales
          </Link>
        </div>

        <section className="public-section" aria-labelledby="free-what">
          <h2 id="free-what">
            What stays free. <span>For everyone, for good.</span>
          </h2>
          <ol className="public-grid">
            {FREE.map(([title, body], index) => (
              <li key={title}>
                <span className="public-grid-num" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="public-section" aria-labelledby="free-limits">
          <h2 id="free-limits">
            What costs money. <span>And what happens at a limit.</span>
          </h2>
          <ul className="public-list">
            {LIMITS.map((line, index) => (
              <li key={line}>
                <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="public-section" aria-labelledby="free-not">
          <h2 id="free-not">What free does not promise.</h2>
          <p>
            Free access does not imply complete market coverage, professional certification or guaranteed hosting
            availability. Each market publishes its own accuracy results and limitations.
          </p>
          <div className="public-actions">
            <Link className="button" href="/accuracy">
              Read the published accuracy results <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
