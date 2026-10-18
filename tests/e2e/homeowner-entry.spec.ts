import { test, expect } from '@playwright/test';

for (const viewport of [
  { width: 1440, height: 960 },
  { width: 390, height: 844 },
]) {
  test(`homeowners can find the public studios at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(
      page.getByRole('heading', { level: 1, name: /Real estate intelligence belongs to homeowners/i }),
    ).toBeVisible();
    const paths = page.locator('#homeowners');
    await expect(paths.getByRole('link', { name: /What is my DC home worth/i })).toHaveAttribute('href', '/dc');
    await expect(paths.getByRole('link', { name: /What about my Maryland home/i })).toHaveAttribute(
      'href',
      '/maryland',
    );
    await expect(paths.getByRole('link', { name: /How does my DC condo compare/i })).toHaveAttribute(
      'href',
      '/dc/condos',
    );
    await expect(paths.getByRole('link', { name: /What if I change the asking price/i })).toHaveAttribute(
      'href',
      '/demo',
    );
    await expect(paths.getByText(/not an appraisal or live listing service/i)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
