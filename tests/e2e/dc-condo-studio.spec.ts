import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const width of [1440, 390]) {
  test(`DC condo unit search and unvalidated report at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/dc/condos');
    await expect(page.getByRole('heading', { name: /Price a DC condo/ })).toBeVisible();
    await page.getByRole('button', { name: /Try an example address/ }).click();
    const result = page.locator('.dc-results button').first();
    const label = await result.locator('strong').innerText();
    await result.click();
    await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible();
    await expect(page.getByTestId('studio-estimate')).toHaveText(/^\$[\d,]+$/);
    await expect(page.getByTestId('condo-unvalidated')).toContainText(
      'Condo accuracy was tested separately and failed',
    );
    await expect(page.getByTestId('calibrated-interval')).toHaveCount(0);
    await expect(page.getByLabel('Subject condition rating', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Condition point ($)', { exact: true })).toHaveCount(0);
    const popup = page.waitForEvent('popup');
    await page.getByRole('link', { name: 'Open professional report', exact: true }).click();
    const report = await popup;
    await expect(report.getByRole('heading', { name: label, exact: true })).toBeVisible();
    await expect(report.getByText(/Condo accuracy was tested separately and failed/).first()).toBeVisible();
    await expect(report.locator('.facts')).not.toContainText('condition 3');
    await expect(report.getByText(/Calibrated 80% range/)).toHaveCount(0);
    await report.close();
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/dc-condos-${width}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}
