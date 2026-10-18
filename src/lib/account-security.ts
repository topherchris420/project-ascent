import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { TOTP, Secret } from 'otpauth';
import { digest, hashPassword, HttpError, verifyPassword } from './auth';
import { consumeRateLimit, transaction, type DbTransaction } from './db';
import type { Actor } from './types';

type Security = {
  user_id: string;
  is_demo: number;
  secret: string | null;
  pending_secret: string | null;
  pending_until: string | null;
  enabled_at: string | null;
  last_counter: number | string;
  recovery_hashes: string;
};
const iso = () => new Date().toISOString();
function encryptionKey() {
  const key = Buffer.from(process.env.APP_ENCRYPTION_KEY || '', 'base64');
  if (key.length !== 32) throw new HttpError(503, 'Account security requires the configured encryption key.');
  return key;
}
export function sealSecurity(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, encrypted, cipher.getAuthTag()]).toString('base64');
}
export function openSecurity(value: string) {
  const data = Buffer.from(value, 'base64');
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(), data.subarray(0, 12));
  cipher.setAuthTag(data.subarray(-16));
  return Buffer.concat([cipher.update(data.subarray(12, -16)), cipher.final()]).toString('utf8');
}
const authenticator = (secret: string, email = '') =>
  new TOTP({
    issuer: 'Ascent',
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
const mandatory = (actor: Actor, security?: Security) =>
  process.env.NODE_ENV === 'production' && actor.role !== 'viewer' && security?.is_demo !== 1;
const normalizeRecovery = (value: string) => value.replace(/-/g, '').toLowerCase();

export async function securityStatus(actor: Actor) {
  const rows = await transaction(null, tx =>
    tx.query<Security>('SELECT * FROM account_security WHERE user_id=$1', [actor.id]),
  );
  return { enabled: !!rows[0]?.enabled_at, required: mandatory(actor, rows[0]) };
}
export async function assertSessionAssurance(actor: Actor, hash: string) {
  const rows = await transaction(null, tx =>
    tx.query<Security & { mfa_at: string | null }>(
      'SELECT account_security.*,session_assurance.mfa_at FROM account_security LEFT JOIN session_assurance ON session_assurance.hash=$2 WHERE user_id=$1',
      [actor.id, hash],
    ),
  );
  const row = rows[0];
  if ((row?.enabled_at || mandatory(actor, row)) && (!row?.enabled_at || !row.mfa_at))
    throw new HttpError(
      403,
      'Authenticator verification is required. Open Account security to enroll, or sign in again with a code.',
    );
}
async function verifyFactor(tx: DbTransaction, row: Security, code: string, now = Date.now()) {
  if (/^\d{6}$/.test(code) && row.secret) {
    const delta = authenticator(openSecurity(row.secret)).validate({ token: code, timestamp: now, window: 1 });
    const counter = Math.floor(now / 30000) + (delta ?? 0);
    if (delta !== null && counter > Number(row.last_counter)) {
      await tx.query('UPDATE account_security SET last_counter=$1 WHERE user_id=$2', [counter, row.user_id]);
      return;
    }
  } else if (/^[a-f0-9-]{32,39}$/i.test(code)) {
    const hashes = JSON.parse(row.recovery_hashes) as string[];
    const hash = digest(normalizeRecovery(code));
    if (hashes.includes(hash)) {
      await tx.query('UPDATE account_security SET recovery_hashes=$1 WHERE user_id=$2', [
        JSON.stringify(hashes.filter(value => value !== hash)),
        row.user_id,
      ]);
      return;
    }
  }
  throw new HttpError(401, 'Enter a fresh authenticator code or an unused recovery code.');
}
export async function verifyLoginFactor(userId: string, code = ''): Promise<boolean> {
  return transaction(null, async tx => {
    const rows = await tx.query<Security>('SELECT * FROM account_security WHERE user_id=$1 FOR UPDATE', [userId]);
    if (!rows[0]?.enabled_at) return false;
    await verifyFactor(tx, rows[0], code);
    return true;
  });
}
async function verifyCurrentPassword(tx: DbTransaction, actor: Actor, password: string) {
  const rows = await tx.query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id=$1 FOR UPDATE', [
    actor.id,
  ]);
  if (!rows[0] || !(await verifyPassword(password, rows[0].password_hash)))
    throw new HttpError(401, 'Current password is incorrect.');
}
export async function beginMfa(actor: Actor, password: string) {
  const secret = new Secret({ size: 20 }).base32;
  await transaction(null, async tx => {
    await verifyCurrentPassword(tx, actor, password);
    await tx.query('INSERT INTO account_security(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING', [actor.id]);
    const rows = await tx.query<Security>('SELECT * FROM account_security WHERE user_id=$1 FOR UPDATE', [actor.id]);
    if (rows[0].enabled_at)
      throw new HttpError(409, 'MFA is already enabled. Use a recovery code if your authenticator is unavailable.');
    await tx.query('UPDATE account_security SET pending_secret=$1,pending_until=$2 WHERE user_id=$3', [
      sealSecurity(secret),
      new Date(Date.now() + 15 * 60000).toISOString(),
      actor.id,
    ]);
  });
  return { secret, uri: authenticator(secret, actor.email).toString() };
}
export async function enableMfa(actor: Actor, code: string) {
  const recoveryCodes = Array.from({ length: 8 }, () => randomBytes(16).toString('hex').match(/.{4}/g)!.join('-'));
  await transaction(null, async tx => {
    const rows = await tx.query<Security>('SELECT * FROM account_security WHERE user_id=$1 FOR UPDATE', [actor.id]);
    const row = rows[0];
    if (!row?.pending_secret || !row.pending_until || Date.parse(row.pending_until) <= Date.now() || row.enabled_at)
      throw new HttpError(400, 'Setup expired. Start authenticator setup again.');
    const delta = authenticator(openSecurity(row.pending_secret)).validate({ token: code, window: 1 });
    if (delta === null) throw new HttpError(401, 'Authenticator code is incorrect.');
    await tx.query(
      'UPDATE account_security SET secret=$1,pending_secret=NULL,pending_until=NULL,enabled_at=$2,last_counter=$3,recovery_hashes=$4 WHERE user_id=$5',
      [
        row.pending_secret,
        iso(),
        Math.floor(Date.now() / 30000) + delta,
        JSON.stringify(recoveryCodes.map(value => digest(normalizeRecovery(value)))),
        actor.id,
      ],
    );
    await tx.query('DELETE FROM session_assurance WHERE hash IN (SELECT hash FROM sessions WHERE user_id=$1)', [
      actor.id,
    ]);
    await tx.query('DELETE FROM sessions WHERE user_id=$1', [actor.id]);
  });
  return { recoveryCodes };
}

export const RESET_NOTICE =
  'If that account exists, a password-reset email will arrive. The link expires in 30 minutes.';
export async function requestPasswordReset(email: string) {
  if (!(await consumeRateLimit(`reset-account:${digest(email.toLowerCase().trim())}`, 3, 3600000)))
    return { message: RESET_NOTICE };
  const origin = process.env.APP_ORIGIN || '';
  if (
    !/^https:\/\//.test(origin) &&
    !(process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))
  )
    throw new HttpError(503, 'Password recovery needs a configured application origin.');
  if (new URL(origin).origin !== origin || !process.env.RESEND_API_KEY || !process.env.AUTH_MAIL_FROM)
    throw new HttpError(503, 'Password recovery email delivery is not configured. Contact the operator.');
  encryptionKey();
  const token = randomBytes(32).toString('base64url');
  await transaction(null, async tx => {
    const now = iso();
    await tx.query('DELETE FROM password_resets WHERE expires_at<$1', [now]);
    await tx.query('DELETE FROM auth_mail_outbox WHERE expires_at<$1', [now]);
    const rows = await tx.query<{ id: string; email: string }>('SELECT id,email FROM users WHERE email=$1', [
      email.toLowerCase().trim(),
    ]);
    if (rows[0] && !rows[0].email.endsWith('@demo.invalid')) {
      const expires = new Date(Date.now() + 30 * 60000).toISOString();
      // Multiple outstanding links are allowed; consuming one atomically invalidates all of them.
      await tx.query('INSERT INTO password_resets(hash,user_id,expires_at) VALUES($1,$2,$3)', [
        digest(token),
        rows[0].id,
        expires,
      ]);
      await tx.query('INSERT INTO auth_mail_outbox(id,payload,created_at,expires_at) VALUES($1,$2,$3,$4)', [
        randomUUID(),
        sealSecurity(JSON.stringify({ to: rows[0].email, url: `${origin}/account/recovery#token=${token}` })),
        now,
        expires,
      ]);
    }
  });
  return { message: RESET_NOTICE };
}
export async function resetPassword(token: string, password: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || password.length < 12 || password.length > 1024)
    throw new HttpError(400, 'Use a valid reset link and a password of at least 12 characters.');
  const hash = await hashPassword(password);
  await transaction(null, async tx => {
    const rows = await tx.query<{ user_id: string }>(
      'DELETE FROM password_resets WHERE hash=$1 AND expires_at>$2 RETURNING user_id',
      [digest(token), iso()],
    );
    if (!rows[0]) throw new HttpError(400, 'This reset link is invalid or expired. Request a new one.');
    const id = rows[0].user_id;
    await tx.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, id]);
    await tx.query('DELETE FROM password_resets WHERE user_id=$1', [id]);
    await tx.query('DELETE FROM session_assurance WHERE hash IN (SELECT hash FROM sessions WHERE user_id=$1)', [id]);
    await tx.query('DELETE FROM sessions WHERE user_id=$1', [id]);
    await tx.query('UPDATE account_security SET pending_secret=NULL,pending_until=NULL WHERE user_id=$1', [id]);
  });
  return {
    message: 'Password changed. Sign in again. Your existing authenticator or recovery code is still required.',
  };
}

/** Claimed/deleted atomically: never send the same reset twice. A failed delivery requires a new request. */
export async function deliverAuthMail(fetcher: typeof fetch = fetch) {
  if (!process.env.RESEND_API_KEY || !process.env.AUTH_MAIL_FROM)
    throw new HttpError(503, 'Account email delivery is not configured.');
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < 4; i++) {
    const item = await transaction(null, async tx => {
      await tx.query('DELETE FROM auth_mail_outbox WHERE expires_at<$1', [iso()]);
      const rows = await tx.query<{ id: string; payload: string }>(
        'SELECT id,payload FROM auth_mail_outbox ORDER BY created_at LIMIT 1 FOR UPDATE',
      );
      if (!rows[0]) return null;
      const claimed = await tx.query('DELETE FROM auth_mail_outbox WHERE id=$1 RETURNING id', [rows[0].id]);
      return claimed.length ? rows[0] : null;
    });
    if (!item) break;
    try {
      const { to, url } = JSON.parse(openSecurity(item.payload));
      const response = await fetcher('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'content-type': 'application/json',
          'Idempotency-Key': item.id,
        },
        body: JSON.stringify({
          from: process.env.AUTH_MAIL_FROM,
          to: [to],
          subject: 'Reset your Ascent password',
          text: `You requested a password reset. Open this link within 30 minutes:\n${url}\n\nIf you did not request this, ignore this email. Your password and MFA have not changed.`,
        }),
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      });
      if (!response.ok) throw new Error('Mail rejected');
      sent++;
    } catch {
      failed++;
    }
  }
  return { sent, failed };
}

export async function purgeExpiredAccountSecurity() {
  await transaction(null, async tx => {
    const now = iso();
    await tx.query('DELETE FROM password_resets WHERE expires_at<$1', [now]);
    await tx.query('DELETE FROM auth_mail_outbox WHERE expires_at<$1', [now]);
    await tx.query('UPDATE account_security SET pending_secret=NULL,pending_until=NULL WHERE pending_until<$1', [now]);
  });
}
