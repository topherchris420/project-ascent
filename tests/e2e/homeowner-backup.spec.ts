import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

for (const width of [1440, 390]) {
  test(`private backup, preview, restore and duplicate recovery at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/demo');
    await page.getByRole('button', { name: 'Save home & decision snapshot' }).click();
    const original = await page.evaluate(() => localStorage.getItem('ascent.homeowner-profiles.v1'));
    expect(original).not.toBeNull();
    await page.goto('/home');
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download private backup' }).click();
    const backup = await readFile((await (await downloadEvent).path())!);
    await page.evaluate(() => localStorage.removeItem('ascent.homeowner-profiles.v1'));
    await page.reload();
    const upload = () =>
      page
        .getByLabel('Choose a private backup to restore')
        .setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: backup });
    await upload();
    await expect(page.getByRole('heading', { name: 'Review your backup' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('ascent.homeowner-profiles.v1'))).toBeNull();
    await page.getByRole('button', { name: 'Cancel restore' }).click();
    expect(await page.evaluate(() => localStorage.getItem('ascent.homeowner-profiles.v1'))).toBeNull();
    await upload();
    await page.evaluate(() => {
      const originalSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'ascent.homeowner-profiles.v1') throw new DOMException('Storage full', 'QuotaExceededError');
        return originalSet.call(this, key, value);
      };
    });
    await page.getByRole('button', { name: 'Restore saved decisions' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Restore could not be saved' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('ascent.homeowner-profiles.v1'))).toBeNull();
    await page.reload();
    await upload();
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations.map(v => v.id)).toEqual([]);
    await page.screenshot({ path: `test-results/home-backup-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Restore saved decisions' }).click();
    await expect(page.getByRole('status').filter({ hasText: '1 decision versions restored' })).toBeVisible();
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem('ascent.homeowner-profiles.v1')))!)).toEqual(
      JSON.parse(original!),
    );
    await upload();
    await page.getByRole('button', { name: 'Restore saved decisions' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: '0 decision versions restored; 1 duplicates skipped' }),
    ).toBeVisible();
    await page
      .getByLabel('Choose a private backup to restore')
      .setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{') });
    await expect(page.getByRole('status').filter({ hasText: 'not valid JSON' })).toBeVisible();
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem('ascent.homeowner-profiles.v1')))!)).toEqual(
      JSON.parse(original!),
    );
    await page.getByRole('link', { name: 'Open home & decisions' }).click();
    await expect(page.getByText('Saved homeowner inputs restored.', { exact: false })).toBeVisible();
  });
}
