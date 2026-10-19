import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const home = { parcelId: '3313____0047', address: '313 Shepherd Street NW', zip: '20011', sqft: 1800 };
const searches = /\/api\/(dc|dc-condos|maryland)\/search\?/;

for (const width of [320, 390]) {
  test(`mobile menu reaches saved homes and restores keyboard focus at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    const toggle = page.getByRole('button', { name: 'Open menu', exact: true });
    await toggle.click();
    const menu = page.getByRole('navigation', { name: 'Mobile navigation' });
    await expect(menu).toBeVisible();
    await menu.getByRole('link', { name: 'My Home' }).focus();
    await page.keyboard.press('Escape');
    await expect(menu).not.toBeVisible();
    await expect(toggle).toBeFocused();
    await toggle.click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/home-menu-${width}.png` });
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations.map(v => v.id)).toEqual([]);
    await menu.getByRole('link', { name: 'My Home' }).click();
    await expect(page).toHaveURL('/home');
    await expect(page.getByRole('heading', { name: 'Start with one home.' })).toBeVisible();
  });
}

test('example addresses, keyboard results and clear work without an account', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const search = page.getByRole('region', { name: 'Look up a home' });
  const field = search.getByRole('searchbox');
  await search.getByRole('button', { name: 'DC house', exact: true }).click();
  await expect(field).toHaveValue('313 Shepherd');
  const dc = search.getByRole('link', { name: /313 Shepherd Street NW/ });
  await expect(dc).toBeVisible();
  await field.press('ArrowDown');
  await expect(dc).toBeFocused();
  await dc.press('Escape');
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('');
  await expect(search.getByRole('list')).toHaveCount(0);
  await search.getByRole('button', { name: 'Maryland home', exact: true }).click();
  await expect(search.getByRole('link', { name: /7300 Maple Ave.*Takoma Park/ })).toBeVisible();
  await search.getByRole('button', { name: 'Clear address' }).click();
  await expect(field).toBeFocused();
  await search.getByRole('button', { name: 'DC condo', exact: true }).click();
  const condo = search
    .getByRole('list', { name: /Matching homes: Washington, DC · condominiums/ })
    .getByRole('link')
    .first();
  await expect(condo).toBeVisible();
  const address = await condo.locator('strong').innerText();
  await search.screenshot({ path: 'test-results/home-search-mobile.png' });
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations.map(v => v.id)).toEqual([]);
  await condo.click();
  await expect(page.getByRole('heading', { level: 1, name: address, exact: true })).toBeVisible();
  await expect(page.getByTestId('studio-estimate')).toHaveText(/^\$[\d,]+$/);
  expect(errors).toEqual([]);
});

test('late replies cannot restore results after the address is cleared', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => {
    release = resolve;
  });
  let calls = 0;
  await page.route(searches, async route => {
    calls += 1;
    await pending;
    await route.fulfill({ json: { results: [home] } }).catch(() => {});
  });
  await page.goto('/');
  const search = page.getByRole('region', { name: 'Look up a home' });
  await search.getByRole('searchbox').fill('313 Shepherd');
  await expect.poll(() => calls).toBe(3);
  await search.getByRole('button', { name: 'Clear address' }).click();
  release();
  await expect(search.getByRole('status')).toContainText('Type at least 3 characters');
  await expect(search.getByRole('list')).toHaveCount(0);
  await expect(search.locator('.spin')).toHaveCount(0);
});

test('partial failures keep valid results and malformed responses offer retry', async ({ page }) => {
  let recover = false;
  await page.route(searches, route =>
    route.fulfill({
      json: {
        results: recover || new URL(route.request().url()).pathname === '/api/dc/search' ? [home] : [{}],
      },
    }),
  );
  await page.goto('/');
  const search = page.getByRole('region', { name: 'Look up a home' });
  await search.getByRole('searchbox').fill('313 Shepherd');
  await expect(search.getByRole('link', { name: /313 Shepherd/ })).toBeVisible();
  await expect(search.locator('.home-search-note')).toContainText('search unavailable');
  await expect(search.locator('.home-search-empty')).toHaveCount(0);
  recover = true;
  await search.getByRole('button', { name: 'Retry search' }).click();
  await expect(search.getByRole('list')).toHaveCount(3);
  await expect(search.getByRole('button', { name: 'Retry search' })).toHaveCount(0);
});

test('a stalled market stops loading and keeps other markets usable', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route(searches, async route => {
    if (new URL(route.request().url()).pathname === '/api/maryland/search') await pending;
    await route.fulfill({ json: { results: [home] } }).catch(() => {});
  });
  await page.goto('/');
  await page.clock.install();
  const search = page.getByRole('region', { name: 'Look up a home' });
  await search.getByRole('searchbox').fill('313 Shepherd');
  await page.clock.runFor(300);
  await expect(search.getByRole('list')).toHaveCount(2);
  await page.clock.fastForward(30000);
  await expect(search.locator('.home-search-note')).toContainText('Montgomery and Prince George’s');
  await expect(search.locator('.spin')).toHaveCount(0);
  await expect(search.getByRole('list')).toHaveCount(2);
  release();
});
