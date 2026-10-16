import { test, expect } from '@playwright/test';
test('client search criteria, inventory explanations, alerts and follow-up continuity work without provider calls', async ({
  page,
}) => {
  let providerPosts = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().endsWith('/api/providers/property')) providerPosts++;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the working demo' }).click();
  await page.getByRole('combobox', { name: 'Market region' }).selectOption('austin');
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Clients', exact: true })
    .click();
  await page.getByRole('button', { name: /Morgan.*demo buyer/ }).click();
  await page.getByLabel('Follow-up task', { exact: true }).fill('Confirm the saved home priorities');
  await page.getByLabel('Follow-up date', { exact: true }).fill('2026-10-25');
  await page.getByRole('button', { name: 'Save follow-up', exact: true }).click();
  const task = page.locator('.snapshot-row').filter({ hasText: 'Confirm the saved home priorities' });
  await expect(task).toBeVisible();
  await task.getByRole('button', { name: 'Complete', exact: true }).click();
  await expect(task).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Pending only', exact: true }).uncheck();
  await expect(task).toContainText('complete');
  await task.getByRole('button', { name: 'Reopen', exact: true }).click();
  await expect(task).toContainText('pending');
  await page.getByRole('button', { name: 'Save search', exact: true }).click();
  await page.getByLabel('Search name', { exact: true }).fill('Objective Austin home search');
  await page.getByLabel('Location query', { exact: true }).fill('Austin');
  await page.getByLabel('Maximum price ($)', { exact: true }).fill('800000');
  await page.getByLabel('Minimum bedrooms', { exact: true }).fill('3');
  await page.getByLabel('Minimum bathrooms', { exact: true }).fill('2');
  await page.getByLabel('Minimum living area (sqft)', { exact: true }).fill('2200');
  await page.getByRole('dialog').getByRole('button', { name: 'Save to workspace', exact: true }).click();
  const search = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'Objective Austin home search', exact: true }) });
  await expect(search).toContainText('satisfies minimum');
  const reviewMatches = async () => {
    const [response] = await Promise.all([
      page.waitForResponse(
        response =>
          response.url().endsWith('/api/actions') &&
          response.request().method() === 'POST' &&
          response.request().postDataJSON().type === 'reviewSavedSearch',
      ),
      search.getByRole('button', { name: 'Review matches & create alerts', exact: true }).click(),
    ]);
    expect(response.status()).toBe(200);
  };
  await reviewMatches();
  const before = await (await page.request.get('/api/workspace')).json();
  const saved = before.workspace.savedSearches.at(-1);
  const alerts = before.workspace.alerts.filter((alert: { searchId?: string }) => alert.searchId === saved.id);
  expect(alerts.length).toBeGreaterThan(0);
  await reviewMatches();
  const after = await (await page.request.get('/api/workspace')).json();
  expect(after.workspace.alerts.filter((alert: { searchId?: string }) => alert.searchId === saved.id)).toHaveLength(
    alerts.length,
  );
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Clients', exact: true })
    .click();
  await page.getByRole('button', { name: /Morgan.*demo buyer/ }).click();
  await expect(page.locator('.snapshot-row').filter({ hasText: 'Confirm the saved home priorities' })).toContainText(
    'pending',
  );
  expect(providerPosts).toBe(0);
});
