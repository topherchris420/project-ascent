import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { TOTP, Secret } from 'otpauth';

test('authenticator enrollment, one-use recovery and signed-out old sessions work through the browser', async ({
  page,
}) => {
  const email = `security-${Date.now()}@example.test`;
  const password = 'browser security password 1234';
  const response = await page.request.post('/api/auth/register', {
    headers: { origin: 'http://localhost:3040' },
    data: { name: 'Security Browser', email, password, organization: 'Synthetic security acceptance' },
  });
  expect(response.status()).toBe(200);
  await page.goto('/account/security');
  await page.getByLabel('Current password').fill(password);
  await page.getByRole('button', { name: 'Set up authenticator' }).click();
  const secret = await page.getByLabel('Authenticator setup key').inputValue();
  await page
    .getByLabel('Authenticator code', { exact: true })
    .fill(new TOTP({ secret: Secret.fromBase32(secret) }).generate());
  await page.getByRole('button', { name: 'Enable MFA and show recovery codes' }).click();
  await expect(page.getByRole('heading', { name: 'Save your recovery codes' })).toBeVisible();
  const codes = await page.locator('li code').allTextContents();
  expect(codes).toHaveLength(8);
  expect((await page.request.get('/api/workspace')).status()).toBe(401);
  const login = await page.request.post('/api/auth/login', {
    headers: { origin: 'http://localhost:3040' },
    data: { email, password, code: codes[0] },
  });
  expect(login.status()).toBe(200);
  const replay = await page.request.post('/api/auth/login', {
    headers: { origin: 'http://localhost:3040' },
    data: { email, password, code: codes[0] },
  });
  expect(replay.status()).toBe(401);
  await page.goto('/account/security');
  await expect(page.getByRole('status')).toContainText('Authenticator MFA is enabled');
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
});

test('password reset link uses a fragment, clears it, and submits once without leaking to navigation', async ({
  page,
}) => {
  const token = 'a'.repeat(43);
  let submissions = 0;
  await page.route('**/api/auth/reset-password', async route => {
    submissions++;
    expect(route.request().postDataJSON()).toEqual({ token, password: 'replacement browser password' });
    await route.fulfill({ json: { message: 'Password changed. Sign in again.' } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/account/recovery#token=${token}`);
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  await expect(page).toHaveURL(/\/account\/recovery$/);
  await page.getByLabel('New password').fill('replacement browser password');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByRole('status')).toContainText('Password changed');
  expect(submissions).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
});
