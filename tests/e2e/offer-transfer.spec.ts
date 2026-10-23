import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { blankOffer, compareOfferLab, emptyOfferLab, offerLabRecord } from '../../src/lib/offer-lab';

const propertyKey = 'dc:3313____0047';
const path = '/home/dc/3313____0047?tab=offers';
const storageKey = `ascent.offer-lab.v1:${propertyKey}`;
function savedRecord() {
  const lab = emptyOfferLab(propertyKey, '2026-10-22');
  lab.offers = [
    {
      ...blankOffer(0, 'seller'),
      id: 'offer-restore',
      label: 'Restored offer',
      price: 725000,
      closingDate: '2026-11-30',
      earnestDueDays: 3,
    },
  ];
  return offerLabRecord(lab, compareOfferLab(lab, null), 'Test home');
}
const file = (value: unknown) => ({
  name: 'offers.json',
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(value)),
});

test.beforeAll(async ({ request }) => {
  test.setTimeout(180_000);
  expect((await request.get('/api/dc/property?parcel=3313____0047', { timeout: 120_000 })).status()).toBe(200);
});

test('a private export restores after preview and cancel, survives reload and preserves entered assumptions', async ({
  page,
}) => {
  await page.goto(path);
  await page.getByTestId('add-offer').click();
  const card = page.getByTestId('offer-card');
  await card.getByLabel('Name', { exact: true }).fill('My original offer');
  await card.getByLabel('Offered price ($)').fill('700000');
  await page.getByLabel('Mortgage payoff ($)').fill('300000');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Private export', exact: true }).click();
  const exported = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  await card.getByLabel('Offered price ($)').fill('800000');
  const before = await page.evaluate(key => localStorage.getItem(key), storageKey);
  await page.getByLabel('Choose private offer export').setInputFiles(file(exported));
  const preview = page.getByRole('region', { name: 'Review offer restore' });
  await expect(preview).toContainText('My original offer');
  expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBe(before);
  await page.getByRole('button', { name: 'Cancel restore' }).click();
  await expect(preview).toHaveCount(0);
  await expect(card.getByLabel('Offered price ($)')).toHaveValue('800000');
  await page.getByLabel('Choose private offer export').setInputFiles(file(exported));
  await page.getByRole('button', { name: 'Replace this comparison' }).click();
  await expect(page.getByText('Comparison restored and saved on this device.', { exact: false })).toBeVisible();
  await expect(card.getByLabel('Offered price ($)')).toHaveValue('700000');
  await page.reload();
  await expect(card.getByLabel('Offered price ($)')).toHaveValue('700000');
  await expect(page.getByLabel('Mortgage payoff ($)')).toHaveValue('300000');
});

test('mobile restore rejects the wrong home and preserves the current comparison if storage is full', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(path);
  await page.getByTestId('add-offer').click();
  await page.getByTestId('offer-card').getByLabel('Offered price ($)').fill('600000');
  const before = await page.evaluate(key => localStorage.getItem(key), storageKey);
  const wrong = savedRecord();
  wrong.property.key = 'maryland:other';
  await page.getByLabel('Choose private offer export').setInputFiles(file(wrong));
  await expect(page.locator('.os-transfer').getByRole('alert')).toContainText('different home');
  expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBe(before);
  await page.getByLabel('Choose private offer export').setInputFiles(file(savedRecord()));
  await expect(page.getByRole('region', { name: 'Review offer restore' })).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('region', { name: 'Review offer restore' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('restore-preview-mobile.png') });
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, value) {
      if (k === key) throw new DOMException('full', 'QuotaExceededError');
      return original.call(this, k, value);
    };
  }, storageKey);
  await page.getByRole('button', { name: 'Replace this comparison' }).click();
  await expect(page.locator('.os-transfer').getByRole('alert')).toContainText('Nothing was replaced');
  await expect(page.getByTestId('offer-card').getByLabel('Offered price ($)')).toHaveValue('600000');
  expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBe(before);
  await page.reload();
  await page.getByLabel('Choose private offer export').setInputFiles(file(savedRecord()));
  await page.getByRole('button', { name: 'Replace this comparison' }).click();
  await expect(page.getByTestId('offer-card').getByLabel('Name', { exact: true })).toHaveValue('Restored offer');
  await expect(page.getByLabel('Count from (today)')).toHaveValue('2026-10-22');
});

test('calendar downloads exclude missing dates and block conflicting dates until corrected', async ({ page }) => {
  await page.goto(path);
  await page.getByLabel('Choose private offer export').setInputFiles(file(savedRecord()));
  await page.getByRole('button', { name: 'Replace this comparison' }).click();
  await expect(page.locator('.os-deadlines')).toContainText('add an assumed acceptance date');
  const calendar = page.getByRole('button', { name: /Download .* calendar date/ });
  await expect(calendar).toHaveText('Download 1 calendar date');
  await page.getByLabel('Assumed acceptance date').fill('2026-11-29');
  await expect(calendar).toBeDisabled();
  await expect(page.getByText('Resolve these dates before downloading:')).toBeVisible();
  await page.getByLabel('Assumed acceptance date').fill('2026-11-20');
  await expect(calendar).toBeEnabled();
  await expect(calendar).toHaveText('Download 2 calendar dates');
  const pending = page.waitForEvent('download');
  await calendar.click();
  const downloaded = await pending;
  expect(downloaded.suggestedFilename()).toBe('ascent-offer-dates.ics');
  const contents = await readFile((await downloaded.path())!, 'utf8');
  expect(contents.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  expect(contents).toContain('DTSTART;VALUE=DATE:20261123');
  expect(contents).toContain('DTSTART;VALUE=DATE:20261130');
  expect(contents).not.toContain('725000');
});
