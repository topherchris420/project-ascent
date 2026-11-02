'use client';
import Link from 'next/link';
import { SiteBrand } from '@/components/site-chrome';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="studio-page">
      <main className="public-main public-status">
        <SiteBrand />
        <h1 className="public-title">This view couldn’t finish loading.</h1>
        <p className="public-lede">
          Try again to reopen the view. You can also return to Ascent and restart the sample.
        </p>
        <div className="public-actions">
          <button type="button" className="button primary" onClick={reset}>
            Try again
          </button>
          <Link className="button" href="/">
            Return to Ascent
          </Link>
        </div>
      </main>
    </div>
  );
}
