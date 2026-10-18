'use client';
import { useEffect, useState } from 'react';

async function accountRequest(path: string, body?: Record<string, unknown>) {
  const res = await fetch(
    path,
    body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : { cache: 'no-store' },
  );
  const value = await res.json();
  if (!res.ok) throw new Error(value.error || 'Please retry.');
  return value;
}
export function AccountSecurity() {
  const [status, setStatus] = useState<{ enabled: boolean; required: boolean } | null>(null);
  const [secret, setSecret] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    accountRequest('/api/account/security')
      .then(value => {
        if (active) setStatus(value);
      })
      .catch(e => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <main className="auth-page">
      <section className="auth-form">
        <div className="auth-form-inner">
          <a href="/" className="brand">
            ascent.
          </a>
          <h1>Account security</h1>
          <p>
            Use an authenticator app and keep your recovery codes somewhere safe. Owners and agents must enroll before
            using a production workspace.
          </p>
          {error && (
            <p role="alert" className="error-box">
              {error}
            </p>
          )}
          {codes.length ? (
            <>
              <h2>Save your recovery codes</h2>
              <p>
                Each code works once. These codes are shown only now. Enrollment signed out all sessions; sign in with a
                fresh authenticator code or one of these recovery codes.
              </p>
              <ul>
                {codes.map(code => (
                  <li key={code}>
                    <code>{code}</code>
                  </li>
                ))}
              </ul>
              <a className="button primary" href="/">
                I saved my codes · return to sign in
              </a>
            </>
          ) : status?.enabled ? (
            <p role="status">
              Authenticator MFA is enabled. Sign in with a fresh code. If you lose your authenticator, use one of your
              saved recovery codes. A password reset keeps MFA enabled.
            </p>
          ) : (
            status && (
              <>
                {!secret ? (
                  <form
                    onSubmit={async e => {
                      e.preventDefault();
                      const data = new FormData(e.currentTarget);
                      setBusy(true);
                      setError('');
                      try {
                        const value = await accountRequest('/api/account/security', {
                          action: 'setup',
                          password: data.get('password'),
                        });
                        setSecret(value.secret);
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <label>
                      Current password
                      <input name="password" type="password" required autoComplete="current-password" />
                    </label>
                    <button disabled={busy} className="button primary">
                      Set up authenticator
                    </button>
                  </form>
                ) : (
                  <>
                    <h2>Add Ascent to your authenticator</h2>
                    <p>
                      Choose “Enter a setup key” in your authenticator app. Use your account email as the account name
                      and select time-based codes.
                    </p>
                    <label>
                      Setup key
                      <input value={secret} readOnly aria-label="Authenticator setup key" spellCheck={false} />
                    </label>
                    <p>Setup expires after 15 minutes. Enter the six-digit code to confirm.</p>
                    <form
                      onSubmit={async e => {
                        e.preventDefault();
                        const data = new FormData(e.currentTarget);
                        setBusy(true);
                        setError('');
                        try {
                          const value = await accountRequest('/api/account/security', {
                            action: 'enable',
                            code: data.get('code'),
                          });
                          setCodes(value.recoveryCodes);
                          setSecret('');
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <label>
                        Authenticator code
                        <input
                          name="code"
                          inputMode="numeric"
                          pattern="[0-9]{6}"
                          maxLength={6}
                          autoComplete="one-time-code"
                          required
                        />
                      </label>
                      <button disabled={busy} className="button primary">
                        Enable MFA and show recovery codes
                      </button>
                    </form>
                  </>
                )}
              </>
            )
          )}
          <p>
            <a href="/">Return to Ascent</a> · <a href="/account/recovery">Password recovery</a>
          </p>
        </div>
      </section>
    </main>
  );
}
export function AccountRecovery() {
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token');
    if (value) {
      setToken(value);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);
  return (
    <main className="auth-page">
      <section className="auth-form">
        <div className="auth-form-inner">
          <a href="/" className="brand">
            ascent.
          </a>
          <h1>{token ? 'Choose a new password' : 'Recover your password'}</h1>
          <p>
            {token
              ? 'Changing your password signs out every session. Your authenticator remains enabled.'
              : 'We will email a one-use reset link if the account exists. Keep this browser open after following the link.'}
          </p>
          {error && (
            <p role="alert" className="error-box">
              {error}
            </p>
          )}
          {message && <p role="status">{message}</p>}
          {!message && (
            <form
              onSubmit={async e => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                setBusy(true);
                setError('');
                try {
                  const value = await accountRequest(
                    `/api/auth/${token ? 'reset-password' : 'forgot-password'}`,
                    token ? { token, password: data.get('password') } : { email: data.get('email') },
                  );
                  setMessage(value.message);
                  setToken('');
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {token ? (
                <label>
                  New password
                  <input
                    type="password"
                    name="password"
                    minLength={12}
                    maxLength={1024}
                    autoComplete="new-password"
                    required
                  />
                </label>
              ) : (
                <label>
                  Email address
                  <input type="email" name="email" autoComplete="email" required />
                </label>
              )}
              <button disabled={busy} className="button primary">
                {token ? 'Change password' : 'Email reset link'}
              </button>
            </form>
          )}
          <p>
            <a href="/">Return to sign in</a>
          </p>
        </div>
      </section>
    </main>
  );
}
