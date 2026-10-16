import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('contract dates show unresolved evidence, require review and preserve a corrected deadline across reload', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the working demo' }).click();
  const transactions = () =>
    page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'Transactions', exact: true });
  await transactions().click();
  await expect(page.locator('.milestone-row').getByRole('link', { name: 'Open source document' })).toHaveCount(0);
  await page.locator('input[name="file"]').setInputFiles({
    name: 'synthetic-conflicting-anchors.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'SYNTHETIC CONTRACT TEST\nRatification: October 3, 2026.\nRatification: October 5, 2026.\nInspection: 10 days after ratification.',
    ),
  });
  await page.getByRole('button', { name: 'Upload privately' }).click();
  const conflicting = page.getByRole('region', { name: 'Document synthetic-conflicting-anchors.txt', exact: true });
  await expect(conflicting.getByRole('group', { name: 'Unresolved contract terms' })).toContainText(
    'Multiple stated ratification dates conflict',
  );
  await expect(conflicting.getByText('Computed proposal', { exact: true })).toHaveCount(0);
  await page.locator('input[name="file"]').setInputFiles({
    name: 'synthetic-reviewable-contract.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'SYNTHETIC CONTRACT TEST\nRatification: October 3, 2026.\nInspection: 10 calendar days after ratification.\nClosing: November 9, 2026.\nWalk-through: 2 business days before closing.',
    ),
  });
  await page.getByRole('button', { name: 'Upload privately' }).click();
  const uploaded = () => page.getByRole('region', { name: 'Document synthetic-reviewable-contract.txt', exact: true });
  const inspection = () =>
    uploaded().getByRole('group', { name: 'Inspection contingency ends 2026-10-13', exact: true });
  const walkThrough = uploaded().getByRole('group', { name: 'Final walk-through 2026-11-05', exact: true });
  await expect(walkThrough).toContainText('Weekdays-only estimate');
  await expect(inspection().getByRole('button', { name: 'Review & add deadline' })).toBeDisabled();
  await expect(inspection()).toContainText('Anchor: ratification');
  await expect(inspection()).toContainText('10 calendar days after ratification');
  await inspection().getByText('Edit title or correct proposed date', { exact: true }).click();
  await inspection().getByLabel('Deadline title', { exact: true }).fill('Reviewed synthetic inspection');
  await inspection().getByLabel('Reviewed date', { exact: true }).fill('2026-10-14');
  await inspection().getByRole('checkbox').check();
  await expect(inspection().getByRole('button', { name: 'Review & add deadline' })).toBeDisabled();
  await inspection()
    .getByLabel('Reason for correction (required)', { exact: true })
    .fill('Synthetic signed extension checked for this test.');
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(
    axe.violations.map(violation => ({ id: violation.id, nodes: violation.nodes.map(node => node.target) })),
  ).toEqual([]);
  await inspection().getByRole('button', { name: 'Review & add deadline' }).click();
  await expect(inspection().getByText('Added to timeline', { exact: true })).toBeVisible();
  await expect(inspection()).toContainText('Reviewed date: 2026-10-14');
  await expect(inspection()).toContainText('Original proposal: 2026-10-13');
  await expect(page.locator('.milestone-row').filter({ hasText: 'Reviewed synthetic inspection' })).toContainText(
    'corrected from 2026-10-13',
  );
  await page.reload();
  await transactions().click();
  await expect(inspection()).toContainText('Reviewed date: 2026-10-14');
  const download = await uploaded().getByRole('link', { name: 'Download', exact: true }).getAttribute('href');
  await expect(
    page
      .locator('.milestone-row')
      .filter({ hasText: 'Reviewed synthetic inspection' })
      .getByRole('link', { name: 'Open source document' }),
  ).toHaveAttribute('href', download!);
  const original = await page.request.get(download!);
  expect(original.status()).toBe(200);
  expect(await original.text()).toContain('Inspection: 10 calendar days after ratification.');
  await page.screenshot({ path: 'evidence/ascent-deadline-review-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(inspection()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const mobileAxe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(mobileAxe.violations.map(violation => violation.id)).toEqual([]);
  await page.screenshot({ path: 'evidence/ascent-deadline-review-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});
