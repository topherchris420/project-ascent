import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const width of [1440, 390]) {
  test(`published accuracy keeps every failed experiment visible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/accuracy');
    await expect(page.getByRole('heading', { level: 1, name: 'Published accuracy experiments' })).toBeVisible();
    for (const name of [
      'Maryland · revised model',
      'Maryland · original failed experiment, unchanged',
      'Maryland method · four other counties, registered before download',
      'DC condominiums · separate population test',
    ])
      await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
    const external = page.locator('.lp-accuracy').nth(2);
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
