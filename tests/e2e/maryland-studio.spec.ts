import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const width of [1440, 390]) {
  test(`Maryland search, missing rooms, grade, report and draft at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/maryland');
    await expect(page.getByRole('heading', { name: /Price a real Maryland home/ })).toBeVisible();
    const search = page.getByLabel('Street address in Montgomery or Prince George’s County, MD');
    await search.fill('7300 Maple');
    await page.getByRole('button', { name: /7300 Maple Ave.*Takoma Park/i }).click();
    await expect(page).toHaveURL(/parcel=161301059818/);
    const estimate = page.getByTestId('studio-estimate');
    await expect(estimate).toHaveText(/^\$[\d,]+$/);
    await expect(page.getByTestId('maryland-verdict')).toContainText('of 9 accuracy criteria met');
    await expect(page.locator('.studio-subject')).toContainText('Bedrooms and bathrooms unavailable');
    await expect(page.getByLabel('Bedroom adjustment ($)', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Bathroom adjustment ($)', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('calibrated-interval')).toHaveCount(0);
    await page.getByLabel('Subject quality grade', { exact: true }).selectOption('4');
    const popup = page.waitForEvent('popup');
    await page.getByRole('link', { name: 'Open professional report', exact: true }).click();
    const report = await popup;
    await expect(report.getByRole('heading', { name: '7300 Maple Ave', exact: true })).toBeVisible();
    await expect(report.getByText(/of 9 accuracy criteria met/).first()).toBeVisible();
    await expect(report.locator('.facts')).toContainText('quality grade 4/9');
    await expect(report.locator('body')).not.toContainText('0 beds');
    await report.close();
    await page.reload();
    await expect(page.getByLabel('Subject quality grade', { exact: true })).toHaveValue('4');
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/maryland-${width}.png`, fullPage: true });
    await page.getByLabel('Street address in Montgomery or Prince George’s County, MD').fill('6100 Perry');
    await page.getByRole('button', { name: /6100 Perry St.*Prince George/i }).click();
    await expect(page).toHaveURL(/parcel=17020094110/);
    await expect(page.getByTestId('studio-estimate')).toHaveText(/^\$[\d,]+$/);
    expect(errors).toEqual([]);
  });
}
