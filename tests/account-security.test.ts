import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { TOTP, Secret } from 'otpauth';
import { authenticate, digest, login, register, sessionCookie } from '../src/lib/auth';
import { closeDatabase, transaction } from '../src/lib/db';
import {
  beginMfa,
  enableMfa,
  deliverAuthMail,
  openSecurity,
  requestPasswordReset,
  resetPassword,
  securityStatus,
} from '../src/lib/account-security';
process.env.SQLITE_PATH = resolve('.data', `account-security-${randomUUID()}.sqlite`);
delete process.env.DATABASE_URL;
process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString('base64');
process.env.APP_ORIGIN = 'http://localhost:3040';
process.env.RESEND_API_KEY = 'test-transport-never-real';
process.env.AUTH_MAIL_FROM = 'Ascent <test@example.invalid>';
after(closeDatabase);
const password = 'initial long test password';
const account = () => register({ name: 'Security test', email: `${randomUUID()}@example.test`, password });
const req = (token: string) =>
  new Request('http://localhost:3040/api/workspace', { headers: { cookie: sessionCookie(token) } });

test('MFA enrollment proves password and possession, encrypts secret, revokes sessions and rejects token/recovery replay', async () => {
  const user = await account();
  await assert.rejects(beginMfa(user.user, 'wrong'), /password/);
  const setup = await beginMfa(user.user, password);
  const stored = await transaction(null, tx =>
    tx.query<{ pending_secret: string }>('SELECT pending_secret FROM account_security WHERE user_id=$1', [
      user.user.id,
    ]),
  );
  assert.ok(!stored[0].pending_secret.includes(setup.secret));
  assert.equal(openSecurity(stored[0].pending_secret), setup.secret);
  const totp = new TOTP({ secret: Secret.fromBase32(setup.secret) });
  await assert.rejects(enableMfa(user.user, 'nope'), /code/);
  const token = totp.generate();
  const enabled = await enableMfa(user.user, token);
  assert.equal(enabled.recoveryCodes.length, 8);
  assert.equal((await securityStatus(user.user)).enabled, true);
  await assert.rejects(authenticate(req(user.token)), /expired/);
  await assert.rejects(login(user.user.email, password), /code/);
  await assert.rejects(login(user.user.email, password, token), /fresh/);
  const attempts = await Promise.allSettled([
    login(user.user.email, password, enabled.recoveryCodes[0]),
    login(user.user.email, password, enabled.recoveryCodes[0]),
  ]);
  assert.equal(attempts.filter(value => value.status === 'fulfilled').length, 1);
  const session = (
    attempts.find(value => value.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof login>>>
  ).value;
  assert.equal((await authenticate(req(session.token))).id, user.user.id);
  await assert.rejects(beginMfa(user.user, password), /already enabled/);
  const row = (
    await transaction(null, tx =>
      tx.query<{ recovery_hashes: string }>('SELECT recovery_hashes FROM account_security WHERE user_id=$1', [
        user.user.id,
      ]),
    )
  )[0];
  assert.ok(!row.recovery_hashes.includes(enabled.recoveryCodes[1]));
});

test('reset requests are generic; encrypted outbox, one-use links, expiry and session revocation do not bypass MFA', async () => {
  const user = await account();
  const setup = await beginMfa(user.user, password);
  const { recoveryCodes } = await enableMfa(
    user.user,
    new TOTP({ secret: Secret.fromBase32(setup.secret) }).generate(),
  );
  const session = await login(user.user.email, password, recoveryCodes[0]);
  const unknown = await requestPasswordReset('unknown@example.test');
  assert.deepEqual(await requestPasswordReset(user.user.email), unknown);
  let resetToken = '';
  const delivery = await deliverAuthMail(async (url, options) => {
    assert.equal(String(url), 'https://api.resend.com/emails');
    const mail = JSON.parse(String(options?.body));
    resetToken = /#token=([A-Za-z0-9_-]{43})/.exec(mail.text)![1];
    assert.deepEqual(mail.to, [user.user.email]);
    return Response.json({ id: 'mock' });
  });
  assert.equal(delivery.sent, 1);
  assert.deepEqual(
    await deliverAuthMail(() => {
      throw new Error('Must not resend');
    }),
    { sent: 0, failed: 0 },
  );
  const rows = await transaction(null, tx =>
    tx.query<{ hash: string }>('SELECT hash FROM password_resets WHERE user_id=$1', [user.user.id]),
  );
  assert.equal(rows[0].hash, digest(resetToken));
  await resetPassword(resetToken, 'replacement password long enough');
  await assert.rejects(resetPassword(resetToken, password), /invalid or expired/);
  await assert.rejects(authenticate(req(session.token)), /expired/);
  await assert.rejects(login(user.user.email, 'replacement password long enough'), /code/);
  await login(user.user.email, 'replacement password long enough', recoveryCodes[1]);
  await requestPasswordReset(user.user.email);
  await deliverAuthMail(async (_url, options) => {
    resetToken = /#token=([A-Za-z0-9_-]{43})/.exec(JSON.parse(String(options?.body)).text)![1];
    return Response.json({});
  });
  await transaction(null, tx =>
    tx.query('UPDATE password_resets SET expires_at=$1 WHERE user_id=$2', ['2000-01-01', user.user.id]),
  );
  await assert.rejects(resetPassword(resetToken, password), /expired/);
});

test('missing email configuration fails closed without minting a reset; ciphertext rejects tampering', async () => {
  const user = await account();
  delete process.env.RESEND_API_KEY;
  await assert.rejects(requestPasswordReset(user.user.email), /not configured/);
  const resets = await transaction(null, tx =>
    tx.query('SELECT hash FROM password_resets WHERE user_id=$1', [user.user.id]),
  );
  assert.equal(resets.length, 0);
  assert.throws(() => openSecurity(randomBytes(50).toString('base64')));
  process.env.RESEND_API_KEY = 'test-transport-never-real';
});
