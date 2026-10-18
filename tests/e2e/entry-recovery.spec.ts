import { test, expect } from '@playwright/test';

const home = {
  parcelId: '3313____0047',
  address: '313 Shepherd Street NW',
  zip: '20011',
  beds: 3,
  baths: 2,
  sqft: 1800,
};

test('clearing an address invalidates an in-flight result and stops the loading state', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => {
    release = resolve;
  });
  let requested = false;
  await page.route('**/api/dc/search?*', async route => {
    requested = true;
    await pending;
    await route.fulfill({ json: { results: [home] } }).catch(() => {});
  });
  await page.goto('/dc');
  const field = page.getByRole('searchbox', { name: 'Street address in Washington, DC' });
  await field.fill('313 Shepherd');
  await expect.poll(() => requested).toBe(true);
  await field.fill('');
  release();
  await expect(page.getByRole('status')).toHaveText('Type at least 3 characters to find a home.');
  await expect(page.getByRole('list', { name: 'Matching DC homes' })).toHaveCount(0);
  await expect(page.locator('.dc-search .spin')).toHaveCount(0);
});

test('a failed address search offers a retry instead of claiming there are no matching homes', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/dc/search?*', route => {
    requests += 1;
    return requests === 1
      ? route.fulfill({ status: 503, json: { error: 'Unavailable' } })
      : route.fulfill({ json: { results: [home] } });
  });
  await page.goto('/dc');
  await page.getByRole('button', { name: 'Try an example address' }).click();
  await expect(page.getByRole('status')).toContainText('Search is unavailable');
  await expect(page.getByRole('status')).not.toContainText('No matching home');
  await page.getByRole('button', { name: 'Retry search', exact: true }).click();
  await expect(page.getByRole('button', { name: /313 Shepherd Street NW/ })).toBeVisible();
  await page.getByRole('searchbox').press('ArrowDown');
  await expect(page.getByRole('button', { name: /313 Shepherd Street NW/ })).toBeFocused();
});

test('a property failure can be retried without changing the address', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/dc/property?*', route => {
    attempts += 1;
    return route.fulfill({ status: 503, json: { error: 'Recorded sales are temporarily unavailable.' } });
  });
  await page.goto('/dc?parcel=3313____0047');
  await expect(page.getByRole('alert').filter({ hasText: 'Recorded sales' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry this property' }).click();
  await expect.poll(() => attempts).toBe(2);
  await expect(page.getByRole('button', { name: 'Retry this property' })).toBeVisible();
});

test('undo reset restores the complete pricing draft and survives a reload', async ({ page }) => {
  await page.goto('/demo');
  await page.getByLabel('Subject condition rating', { exact: true }).selectOption('3');
  await page.getByLabel('Mortgage payoff ($)', { exact: true }).fill('300000');
  const changed = await page.getByTestId('studio-estimate').innerText();
  await page.getByRole('button', { name: 'Reset to original' }).click();
  await expect(page.getByTestId('studio-estimate')).toHaveText('$963,010');
  await expect(page.getByLabel('Mortgage payoff ($)', { exact: true })).toHaveValue('0');
  await page.getByRole('button', { name: 'Undo reset' }).click();
  await expect(page.getByTestId('studio-estimate')).toHaveText(changed);
  await expect(page.getByLabel('Mortgage payoff ($)', { exact: true })).toHaveValue('300000');
  await page.reload();
  await expect(page.getByLabel('Subject condition rating', { exact: true })).toHaveValue('3');
  await expect(page.getByLabel('Mortgage payoff ($)', { exact: true })).toHaveValue('300000');
});
