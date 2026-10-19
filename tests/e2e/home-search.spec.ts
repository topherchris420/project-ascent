import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const width of [1440, 390]) {
  test(`one address box finds DC and Maryland homes and opens the right studio at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    const field = page.getByRole('searchbox', { name: 'Your home’s street address' });
    await field.fill('313 Shepherd');
    const dc = page.getByRole('list', { name: 'Matching homes: Washington, DC · houses and rowhomes' });
    await expect(dc.getByRole('link', { name: /313 Shepherd Street NW/ })).toBeVisible();
    await expect(page.locator('#home-address-status')).toContainText(/matching home/);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await field.fill('7300 Maple');
    const md = page.getByRole('list', { name: 'Matching homes: Montgomery and Prince George’s counties, MD' });
    const takoma = md.getByRole('link', { name: /7300 Maple Ave.*Takoma Park/i });
    await expect(takoma).toHaveAttribute('href', '/maryland?parcel=161301059818');
    await field.press('ArrowDown');
    await expect(page.locator('.home-search-group a').first()).toBeFocused();
    await takoma.click();
    await expect(page).toHaveURL(/\/maryland\?parcel=161301059818/);
    // The chosen home leads the page: its address is the page heading and the estimate sits beside it.
    await expect(page.getByRole('heading', { level: 1, name: '7300 Maple Ave' })).toBeVisible();
    await expect(page.getByTestId('studio-estimate')).toHaveText(/^\$[\d,]+$/);
    await expect(page.getByTestId('studio-estimate')).toBeInViewport();
    expect(errors).toEqual([]);
  });
}

test('addresses outside coverage are explained, and a failed search can be retried', async ({ page }) => {
  await page.goto('/');
  const field = page.getByRole('searchbox', { name: 'Your home’s street address' });
  await field.fill('1000 Wilson Blvd Arlington VA 22209');
  await expect(page.locator('#home-address-status')).toHaveText('No covered home matches this address.');
  await expect(page.locator('.home-search-empty')).toContainText('Virginia is not covered yet');
  await expect(page.locator('.home-search-empty').getByRole('link', { name: /fictional sample/ })).toHaveAttribute(
    'href',
    '/demo',
  );

  let failing = true;
  await page.route(/\/api\/(dc|dc-condos|maryland)\/search\?/, route =>
    failing ? route.fulfill({ status: 503, json: { error: 'Unavailable' } }) : route.fallback(),
  );
  await field.fill('313 Shepherd');
  await expect(page.locator('#home-address-status')).toContainText('Search is unavailable');
  await expect(page.locator('.home-search-empty')).toHaveCount(0);
  failing = false;
  await page.getByRole('button', { name: 'Retry search', exact: true }).click();
  await expect(page.getByRole('link', { name: /313 Shepherd Street NW/ })).toBeVisible();
});

test('My Home starts from the same address box', async ({ page }) => {
  await page.goto('/home');
  await page.getByRole('searchbox', { name: 'Your home’s street address' }).fill('2123 California');
  await expect(
    page.getByRole('list', { name: 'Matching homes: Washington, DC · condominiums' }).getByRole('link').first(),
  ).toHaveAttribute('href', /^\/dc\/condos\?parcel=/);
});

test('search warm-up, icons, manifest, robots, sitemap and link preview are served', async ({ request }) => {
  for (const market of ['dc', 'dc-condos', 'maryland']) {
    const warm = await request.post(`/api/${market}/search`);
    expect(warm.status()).toBe(204);
  }
  const types: Record<string, RegExp> = {
    '/icon.svg': /image\/svg\+xml/,
    '/apple-icon': /image\/png/,
    '/opengraph-image': /image\/png/,
    '/manifest.webmanifest': /application\/manifest\+json/,
    '/robots.txt': /text\/plain/,
    '/sitemap.xml': /xml/,
  };
  for (const [path, type] of Object.entries(types)) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()['content-type'], path).toMatch(type);
  }
  expect(await (await request.get('/robots.txt')).text()).toContain('Disallow: /api/');
  expect(await (await request.get('/sitemap.xml')).text()).toContain('/maryland</loc>');
});
