import { test, expect } from '@playwright/test';
import { MAX_DOCUMENT_BYTES } from '../../src/lib/upload-limits';

test('oversized documents are caught before upload and a smaller retry still succeeds', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the working demo' }).click();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Transactions', exact: true })
    .click();
  await expect(page.getByText('PDF or text · Maximum 4 MB', { exact: true })).toBeVisible();
  let uploads = 0;
  await page.route('**/api/documents', async route => {
    uploads++;
    await route.continue();
  });
  await page
    .locator('input[name="file"]')
    .setInputFiles({ name: 'too-large.txt', mimeType: 'text/plain', buffer: Buffer.alloc(MAX_DOCUMENT_BYTES + 1, 65) });
  await page.getByRole('button', { name: 'Upload privately' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'at most 4 MB' })).toBeVisible();
  expect(uploads).toBe(0);
  await page.locator('input[name="file"]').setInputFiles({
    name: 'synthetic-small-contract.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Inspection: October 27, 2026.'),
  });
  await page.getByRole('button', { name: 'Upload privately' }).click();
  await expect(page.getByRole('region', { name: 'Document synthetic-small-contract.txt', exact: true })).toBeVisible();
  await expect(page.locator('.error-box[role="alert"]')).toHaveCount(0);
  expect(uploads).toBe(1);
});
