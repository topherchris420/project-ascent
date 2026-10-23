'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Actor } from '@/lib/types';
import { requestJson, TextField } from './shared';

export type AccountState = { user: Actor | null; loading: boolean; message: string; refresh: () => void };

/** The signed-in account, if any. A 401 means signed out; a 403 carries the security step that is required. */
export function useAccount(): AccountState {
  const [user, setUser] = useState<Actor | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const refresh = useCallback(() => {
    setLoading(true);
    requestJson<{ user: Actor }>('/api/auth/me')
      .then(body => {
        setUser(body.user);
        setMessage('');
      })
      .catch((error: Error & { status?: number }) => {
        setUser(null);
        setMessage(error.status === 401 ? '' : error.message);
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(refresh, [refresh]);
  return { user, loading, message, refresh };
}

export function AccountGate({ account, purpose }: { account: AccountState; purpose: string }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await requestJson(`/api/auth/${mode}`, {
        method: 'POST',
        json: mode === 'login' ? { email, password, ...(code ? { code } : {}) } : { name, email, password },
      });
      setPassword('');
      account.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };
  if (account.loading) return <p role="status">Checking whether you are signed in…</p>;
  return (
    <div className="os-account" data-testid="account-gate">
      <p>{purpose}</p>
      <p className="fine">
        An account is free. Everything else in Ascent works without one; your saved homes, offers and watches stay in
        this browser either way.
      </p>
      {account.message && (
        <p className="error-box" role="alert">
          {account.message} <Link href="/account/security">Open account security</Link>
        </p>
      )}
      <div className="os-segmented" role="group" aria-label="Account">
        <button type="button" className="button small" aria-pressed={mode === 'login'} onClick={() => setMode('login')}>
          Sign in
        </button>
        <button
          type="button"
          className="button small"
          aria-pressed={mode === 'register'}
          onClick={() => setMode('register')}
        >
          Create a free account
        </button>
      </div>
      <form
        className="os-form"
        onSubmit={event => {
          event.preventDefault();
          void submit();
        }}
      >
        {mode === 'register' && (
          <TextField label="Your name" value={name} onChange={setName} maxLength={150} required />
        )}
        <TextField label="Email" type="email" value={email} onChange={setEmail} maxLength={254} required />
        <TextField
          label={mode === 'register' ? 'Password (12 characters or more)' : 'Password'}
          type="password"
          value={password}
          onChange={setPassword}
          maxLength={1024}
          required
        />
        {mode === 'login' && (
          <TextField label="Authenticator code, if you set one up" value={code} onChange={setCode} maxLength={50} />
        )}
        <button type="submit" className="button primary" disabled={busy}>
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
      </form>
      {mode === 'login' && (
        <p className="fine">
          <Link href="/account/recovery">Forgot your password?</Link>
        </p>
      )}
    </div>
  );
}
