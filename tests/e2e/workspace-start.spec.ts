import { test, expect } from '@playwright/test';

test('a new account starts empty, offers honest starting points, and loads the practice fixture only on request', async ({
  page,
}) => {
  const email = `start-${Date.now()}@example.invalid`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).first().click();
  await page.getByLabel('Full name').fill('Jordan Starter');
  await page.getByLabel('Organization', { exact: true }).fill('Empty Start Brokerage');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Correct-battery-42!');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Jordan/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nothing here is invented. Bring the evidence.' })).toBeVisible();
  await expect(page.getByText('LICENSED WORKSPACE')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Market region' })).toHaveCount(0);
  const before = (await (await page.request.get('/api/workspace')).json()) as {
    workspace: { mode: string; properties: unknown[]; clients: unknown[] };
  };
  expect(before.workspace.mode).toBe('licensed');
  expect(before.workspace.properties).toHaveLength(0);
  expect(before.workspace.clients).toHaveLength(0);

  await page.getByRole('button', { name: 'Practice on the labeled fixture' }).click();
  await expect(page.getByText('SYNTHETIC DEMO', { exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Market region' })).toHaveValue('dmv');
  await expect(page.getByRole('heading', { name: 'Nothing here is invented. Bring the evidence.' })).toHaveCount(0);
  const after = (await (await page.request.get('/api/workspace')).json()) as {
    workspace: {
      mode: string;
      properties: { state: string }[];
      clients: { name: string }[];
      audit: { action: string }[];
    };
  };
  expect(after.workspace.mode).toBe('demo');
  expect(after.workspace.properties.filter(property => property.state === 'VA')).toHaveLength(9);
  expect(after.workspace.clients.some(client => client.name === 'Riley — demo seller')).toBe(true);
  expect(after.workspace.audit.some(event => event.action === 'syncFabricDemo')).toBe(true);
});

test('a preserved pricing snapshot replays from its archived evidence in the browser', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the working demo' }).click();
  await expect(page.getByRole('combobox', { name: 'Market region' })).toHaveValue('dmv');
  await page.getByRole('combobox', { name: 'Market region' }).selectOption('austin');
  await expect(page.locator('#main')).toHaveAttribute('aria-busy', 'false');
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Pricing studio', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Preserved decision history' })).toBeVisible();
  await page.getByRole('button', { name: 'Replay' }).first().click();
  const verdict = page.getByRole('status').filter({ hasText: /(?:Reproduced|Numerically reproduced) · [\d.]+ ms/ });
  await expect(verdict.first()).toBeVisible();
  await expect(page.getByText('Does not reproduce')).toHaveCount(0);
});
