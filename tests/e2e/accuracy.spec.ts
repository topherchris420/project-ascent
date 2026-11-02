import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const width of [1440, 390]) {
  test(`published accuracy keeps every failed experiment visible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/accuracy');
    await expect(page.getByRole('heading', { level: 1, name: 'Published accuracy experiments' })).toBeVisible();
    // No outside replication exists yet, and the page says so before any result.
    const replication = page.getByRole('region', { name: 'Independent replication' });
    await expect(replication.getByTestId('replication-none')).toContainText(
      'No outside researcher has reproduced these results or assessed the methodology yet.',
    );
    await expect(replication.getByRole('link', { name: 'How to replicate these studies' })).toBeVisible();
    for (const name of [
      'Washington, DC · houses and rowhomes',
      'Maryland · revised model',
      'Maryland · original failed experiment, unchanged',
      'Maryland method · four other counties, registered before download',
      'DC condominiums · separate population test',
    ])
      await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
    // The summary lists every study, failures included, and links to each one's full scorecard.
    const summary = page.getByRole('table', { name: /pre-registered studies at a glance/ });
    await expect(summary.getByRole('row')).toHaveCount(6);
    await expect(summary.getByText('Did not meet acceptance')).toHaveCount(4);
    await expect(summary.getByRole('link', { name: 'DC houses and rowhomes' })).toHaveAttribute('href', '#dc-houses');
    const external = page.locator('#maryland-external .lp-accuracy');
    await expect(external).toContainText('19,039 unseen');
    await expect(external).toContainText('5 of 9 met');
    await expect(external).toContainText('It did not meet acceptance');
    await expect(external).toContainText('Met exactly at the bar: absolute median signed error (3.00%).');
    // Exact-bar notes belong only to the experiment that has one.
    await expect(page.getByText(/Met exactly at the bar/)).toHaveCount(1);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
