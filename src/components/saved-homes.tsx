'use client';
import { useEffect, useRef, useState } from 'react';
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
import { HomeSearch } from './home-search';
import '@/app/pricing-studio.css';
import '@/app/homeowner.css';

export function SavedHomes() {
  const [profiles, setProfiles] = useState<HomeProfile[]>([]),
    [ready, setReady] = useState(false),
    [status, setStatus] = useState('');
  const [pendingRemoval, setPendingRemoval] = useState<HomeProfile | null>(null);
  const removalDialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (pendingRemoval) removalDialog.current?.showModal();
    else removalDialog.current?.close();
  }, [pendingRemoval]);
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
    let next: HomeProfile[];
    let draftKey: string | undefined;
    try {
      const raw = localStorage.getItem(HOME_STORAGE_KEY);
      const current = raw ? parseProfiles(raw) : [];
      next = current.filter(p => p.propertyId !== id);
      const removed = current.find(p => p.propertyId === id)?.snapshots.at(-1);
      draftKey = removed ? studioStorageKey(removed.evidence.subject) : undefined;
      localStorage.setItem(HOME_STORAGE_KEY, JSON.stringify({ version: 1, profiles: next }));
    } catch {
      setStatus('Could not update device storage. Your saved home has not been removed.');
      return;
    }
    setProfiles(next);
    setPendingRemoval(null);
    try {
      if (draftKey) localStorage.removeItem(draftKey);
      setStatus('Saved home and all homeowner snapshots removed from this device. Existing downloads are not revoked.');
    } catch {
      setStatus(
        'Saved home and history removed, but the studio draft could not be cleared. Open that studio to reset its saved inputs. Existing downloads are not revoked.',
      );
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
        <Link className="button small" href="/#find-home">
          Explore a property
        </Link>
      </header>
      <main id="homes-main" className="studio-main">
        <div className="studio-intro">
          <div>
            <span className="eyebrow">PRIVATE BY CHOICE</span>
            <h1 ref={heading} tabIndex={-1}>
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
                    <button
                      className="button small"
                      onClick={() => {
                        setStatus('');
                        setPendingRemoval(profile);
                      }}
                    >
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
              Look up its address, enter only the ownership information you choose, then select “Save home & decision
              snapshot.”
            </p>
            <HomeSearch />
            <nav className="home-nav" aria-label="Explore supported properties">
              <Link className="button" href="/dc">
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
        <dialog
          ref={removalDialog}
          className="home-remove-dialog"
          aria-labelledby="remove-home-title"
          aria-describedby="remove-home-description"
          onCancel={event => {
            event.preventDefault();
            setPendingRemoval(null);
          }}
          onClose={() => {
            if (document.activeElement === document.body) heading.current?.focus();
          }}
        >
          <h2 id="remove-home-title">Remove this saved home?</h2>
          <p id="remove-home-description">
            {pendingRemoval?.address} and all {pendingRemoval?.snapshots.length} saved decision version
            {pendingRemoval?.snapshots.length === 1 ? '' : 's'} will be removed from this browser, including saved
            financial inputs and notes. This cannot be undone. Export your private history first if you want a copy.
          </p>
          <div className="home-nav">
            <button type="button" className="button primary" autoFocus onClick={() => setPendingRemoval(null)}>
              Keep saved home
            </button>
            <button
              type="button"
              className="button"
              onClick={() => {
                if (pendingRemoval) remove(pendingRemoval.propertyId);
              }}
            >
              Remove home and history
            </button>
          </div>
          <p role="status">{pendingRemoval ? status : ''}</p>
        </dialog>
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
