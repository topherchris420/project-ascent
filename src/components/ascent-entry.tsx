'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Landing } from './landing';

// The public front door does not download provider, billing, document or workspace UIs.
const WorkspaceApp = dynamic(() => import('./workspace'), {
  loading: () => (
    <main className="opening" aria-busy="true">
      <span className="brand">ascent.</span>
      <p>Opening your workspace…</p>
    </main>
  ),
});
export function AscentEntry({
  resumeWorkspace,
  workspaceAvailable,
}: {
  resumeWorkspace: boolean;
  workspaceAvailable: boolean;
}) {
  const [entry, setEntry] = useState<'public' | 'workspace' | 'login' | 'register'>(
    resumeWorkspace ? 'workspace' : 'public',
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  if (entry !== 'public')
    return (
      <WorkspaceApp
        workspaceAvailable={workspaceAvailable}
        initialAuth={entry === 'login' || entry === 'register' ? entry : undefined}
      />
    );
  return (
    <Landing
      workspaceAvailable={workspaceAvailable}
      busy={busy}
      error={error}
      onSignIn={() => {
        setEntry('login');
        window.scrollTo(0, 0);
      }}
      onRegister={() => {
        setEntry('register');
        window.scrollTo(0, 0);
      }}
      onDemo={() => {
        void (async () => {
          setBusy(true);
          setError('');
          try {
            const res = await fetch('/api/auth/demo', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: '{}',
            });
            // Always read the body: an unread response keeps the request open in the browser.
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
              throw new Error(
                typeof body.error === 'string'
                  ? body.error
                  : body.error?.message ||
                      'The workspace could not open. The account-free Pricing Studio is available.',
              );
            }
            setEntry('workspace');
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Unable to open the workspace.');
          } finally {
            setBusy(false);
          }
        })();
      }}
    />
  );
}
