import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const viewport of [
  { width: 1440, height: 960 },
  { width: 390, height: 844 },
]) {
  test(`price a real DC home from public records at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/dc');
    await expect(page.getByRole('heading', { name: /Price a real DC home/ })).toBeVisible();
    await page.getByLabel('Street address in Washington, DC').fill('1400 shepherd st nw');
    await expect(page.getByRole('status').filter({ hasText: 'Condominiums and multi-unit buildings' })).toBeVisible();
    await page.getByLabel('Street address in Washington, DC').fill('313 shepherd');
    await page.getByRole('button', { name: /313 Shepherd Street NW/ }).click();
    await expect(page).toHaveURL(/parcel=3313____0047/);
    await expect(page.getByRole('heading', { name: '313 Shepherd Street NW', exact: true })).toBeVisible();
    const estimate = page.getByTestId('studio-estimate');
    await expect(estimate).toHaveText(/^\$\d{3},\d{3}$/);
    // The unmodified DC-validated analysis earns the published calibrated interval.
    await expect(page.getByTestId('calibrated-interval')).toContainText('Calibrated 80% range');
    await expect(page.getByRole('group', { name: /^Price axis\./ })).toBeVisible();
    await expect(page.locator('.drivers-list li').first()).toContainText('Subject condition rating');
    const original = await estimate.innerText();
    await page.getByLabel('Subject condition rating', { exact: true }).selectOption('3');
    await expect(estimate).not.toHaveText(original);
    await expect(page.getByTestId('calibrated-interval')).toHaveCount(0);
    await expect(page.getByText(/applies only to the unmodified validated analysis/)).toBeVisible();
    const popup = page.waitForEvent('popup');
    await page.getByRole('link', { name: 'Open professional report', exact: true }).click();
    const report = await popup;
    await expect(report.getByRole('heading', { name: '313 Shepherd Street NW', exact: true })).toBeVisible();
    await expect(
      report.getByText(/Contains District of Columbia open data licensed under CC BY 4\.0/).first(),
    ).toBeVisible();
    await expect(report.getByText(/FICTIONAL DEMONSTRATION DATA/)).toHaveCount(0);
    await expect(report.getByText(/condition 3\/6/)).toBeVisible();
    await report.close();
    await page.reload();
    await expect(page.getByLabel('Subject condition rating', { exact: true })).toHaveValue('3');
    await page.getByRole('button', { name: /Reset to original/ }).click();
    await expect(estimate).toHaveText(original);
    await expect(page.getByTestId('calibrated-interval')).toBeVisible();
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.goBack();
    await expect(page.getByRole('heading', { name: /Price a real DC home/ })).toBeVisible();
    await expect(page.getByLabel('Street address in Washington, DC')).toBeVisible();
    expect(errors).toEqual([]);
  });
}
