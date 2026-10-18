import Link from 'next/link';
export const metadata = { title: 'The free-service promise · Ascent' };
export default function Page() {
  return (
    <main className="auth-form">
      <div className="auth-form-inner">
        <Link href="/" className="brand">
          ascent.
        </Link>
        <h1>Ascent stays free.</h1>
        <p>
          Public-record research, basic comparable-sale analysis, reports, clients, offers and deadline workflows will
          remain free permanently. You do not need a subscription or payment card to use them. Creating a workspace is
          free.
        </p>
        <p>
          Hosted AI and outside property providers cost money to operate. They have usage limits and may require your
          own authorized provider access. When a limit is reached, Ascent stops those requests; it never bills you
          automatically. Deterministic analysis remains available. A third party’s data license or service fee is
          separate from Ascent.
        </p>
        <p>
          Professional verification and source permissions control licensed-data access. Paying cannot grant those
          rights. No paid Ascent plans are currently offered, and new Stripe checkout is disabled even if old price
          settings remain configured.
        </p>
        <p>
          Historical subscription records and an existing-customer management portal are retained for cleanup. The older
          Professional, Team and Enterprise definitions are legacy compatibility code, not current offers. They do not
          narrow the permanent free features listed here.
        </p>
        <p>
          Free access does not imply complete market coverage, professional certification or guaranteed hosting
          availability. Each market publishes its own accuracy results and limitations.
        </p>
        <Link href="/">Return to Ascent</Link>
      </div>
    </main>
  );
}
