'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  HOME_STORAGE_KEY,
  parseProfiles,
  evidencePassport,
  studioStorageKey,
  type HomeProfile,
} from '@/lib/homeowner-passport';
import { downloadJson } from '@/lib/browser-export';
import { date } from './format';
import '@/app/pricing-studio.css';
import '@/app/homeowner.css';

export function SavedHomes() {
  const [profiles, setProfiles] = useState<HomeProfile[]>([]),
    [ready, setReady] = useState(false),
    [status, setStatus] = useState('');
  useEffect(() => {
    try {
      const raw = localStorage.getItem(HOME_STORAGE_KEY);
      setProfiles(raw ? parseProfiles(raw) : []);
    } catch {
      setStatus('Saved profiles could not be read. Existing storage has been kept.');
    }
    setReady(true);
  }, []);
  const remove = (id: string) => {
    try {
      const raw = localStorage.getItem(HOME_STORAGE_KEY);
      const next = (raw ? parseProfiles(raw) : []).filter(p => p.propertyId !== id);
      localStorage.setItem(HOME_STORAGE_KEY, JSON.stringify({ version: 1, profiles: next }));
      const removed = profiles.find(p => p.propertyId === id)?.snapshots.at(-1);
      if (removed) localStorage.removeItem(studioStorageKey(removed.evidence.subject));
      setProfiles(next);
      setStatus('Saved home and all homeowner snapshots removed from this device. Existing downloads are not revoked.');
    } catch {
      setStatus('Could not update device storage. Nothing was reported as removed.');
    }
  };
  return (
    <div className="studio-page">
      <a className="skip-link" href="#homes-main">
        Skip to saved homes
      </a>
      <header className="studio-header">
        <Link className="brand" href="/" aria-label="Ascent home">
          <span className="brand-mark">A</span>ascent<span className="brand-dot">.</span>
        </Link>
        <span className="studio-header-label">MY HOME</span>
        <Link className="button small" href="/dc">
          Explore a property
        </Link>
      </header>
      <main id="homes-main" className="studio-main">
        <div className="studio-intro">
          <div>
            <span className="eyebrow">PRIVATE BY CHOICE</span>
            <h1>
              Your home.
              <br />
              <span>Your working decisions.</span>
            </h1>
            <p>Keep the evidence and assumptions behind your next move together.</p>
          </div>
        </div>
        <p>
          Saved profiles stay in this browser on this device. They are not synchronized to an account. Other people
          using this browser may see them; clearing site storage removes them. Download a private passport to keep an
          independent copy.
        </p>
        {!ready ? (
          <p role="status">Reading saved homes…</p>
        ) : profiles.length ? (
          <div className="saved-homes">
            {profiles.map(profile => {
              const last = profile.snapshots.at(-1)!;
              return (
                <article className="panel" key={profile.propertyId}>
                  <span className="eyebrow">
                    {last.evidence.sources.some(s => s.kind === 'synthetic')
                      ? 'FICTIONAL PRACTICE'
                      : 'PUBLIC-RECORD EVIDENCE'}
                  </span>
                  <h2>{profile.address}</h2>
                  <p>
                    {profile.snapshots.length} saved version{profile.snapshots.length === 1 ? '' : 's'} · last saved{' '}
                    {date(last.savedAt)}
                  </p>
                  <div className="home-nav">
                    <Link className="button primary" href={`${profile.href}#homeowner-workbench`}>
                      Open home & decisions
                    </Link>
                    <button
                      className="button small"
                      onClick={() =>
                        downloadJson(
                          {
                            format: 'ascent-homeowner-history-1',
                            snapshots: profile.snapshots.map(s => evidencePassport(s, true)),
                          },
                          'ascent-private-history.json',
                        )
                      }
                    >
                      Export private history (JSON)
                    </button>
                    <button className="button small" onClick={() => remove(profile.propertyId)}>
                      Remove saved home
                    </button>
                  </div>
                  <p className="fine">
                    Private history export includes financial assumptions and homeowner notes. Review before sharing.
                  </p>
                </article>
              );
            })}
          </div>
        ) : (
          <section className="panel">
            <h2>Start with one home.</h2>
            <p>
              Explore supported public records, enter only the ownership information you choose, then select “Save home
              & decision snapshot.”
            </p>
            <nav className="home-nav" aria-label="Explore supported properties">
              <Link className="button primary" href="/dc">
                Explore DC homes
              </Link>
              <Link className="button" href="/maryland">
                Explore Maryland homes
              </Link>
              <Link className="button" href="/dc/condos">
                Explore DC condos
              </Link>
              <Link className="button" href="/demo#homeowner-workbench">
                Try the fictional demonstration
              </Link>
            </nav>
          </section>
        )}
        <p role="status">{status}</p>
        <section className="panel">
          <h2>Evidence, with visible limits.</h2>
          <p>
            Public sales are periodic snapshots, not live listings. Mortgage balances, costs, rent and renovations are
            homeowner assumptions. Financial comparisons use deterministic arithmetic. Hypothetical property changes are
            not predicted returns.
          </p>
          <Link href="/accuracy">Review the published valuation studies</Link>
        </section>
      </main>
    </div>
  );
}
