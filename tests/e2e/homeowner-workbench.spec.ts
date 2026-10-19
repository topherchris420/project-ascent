import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

for (const width of [1440, 390]) {
  test(`homeowner decisions, private snapshots and filtered sharing at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [],
      externalCalls: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => {
      if (/\/api\/(assistant|providers|billing)/.test(r.url())) externalCalls.push(r.url());
    });
    await page.goto('/demo');
    const home = page.getByRole('region', { name: 'Homeowner intelligence dashboard' });
    await expect(home).toContainText('Not provided');
    await home.getByRole('button', { name: 'Compare Decisions', exact: true }).click();
    await expect(
      home.getByRole('table', { name: 'Deterministic financial comparison · amounts in dollars' }),
    ).toContainText('Needs inputs');
    await home.getByRole('button', { name: 'Try illustrative financial inputs' }).click();
    await expect(home).toContainText('Illustrative financial assumptions loaded');
    await expect(
      home.getByRole('table', { name: 'Deterministic financial comparison · amounts in dollars' }),
    ).not.toContainText('Needs inputs');
    await expect(home.getByRole('img', { name: 'Scenario net position, not a forecast' })).toBeVisible();
    await home.getByText('Edit financial assumptions', { exact: true }).click();
    await home.getByLabel('Mortgage balance / payoff assumption ($)', { exact: true }).fill('313337');
    await home.getByLabel('Monthly gross rent ($)', { exact: true }).fill('3700');
    await home.getByRole('button', { name: 'Save home & decision snapshot' }).click();
    await expect(home).toContainText('Home and decision snapshot saved');
    await home.getByLabel('Monthly gross rent ($)', { exact: true }).fill('3800');
    await home.getByRole('button', { name: 'Save home & decision snapshot' }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () => JSON.parse(localStorage.getItem('ascent.homeowner-profiles.v1')!).profiles[0].snapshots.length,
        ),
      )
      .toBe(2);
    await home.getByRole('button', { name: 'Reports & History', exact: true }).click();
    await home.getByLabel('Earlier version', { exact: true }).selectOption({ index: 0 });
    await home.getByLabel('Compare with', { exact: true }).selectOption({ index: 2 });
    await home.getByText(/Inspect exact changes/).click();
    await expect(home.getByRole('region', { name: 'Exact decision history changes' })).toContainText(
      'assumptions.monthlyRent',
    );
    await home.getByText('Compare saved financial results', { exact: true }).click();
    await expect(home.getByRole('region', { name: 'Saved financial result differences' })).toContainText('$5,244');
    const sharing = page.waitForEvent('download');
    await home.getByRole('button', { name: 'Export sharing passport (JSON)' }).click();
    const shareDownload = await sharing;
    const share = JSON.parse(await readFile((await shareDownload.path())!, 'utf8'));
    expect(share.finance).toBeUndefined();
    expect(share.studioChoices).toBeUndefined();
    expect(JSON.stringify(share)).not.toContain('313337');
    const reportPopup = page.waitForEvent('popup');
    await home.getByRole('button', { name: 'Open readable passport', exact: true }).click();
    const report = await reportPopup;
    await expect(report.getByRole('heading', { name: '1200 Example Linden Court', exact: true })).toBeVisible();
    await expect(report.locator('body')).not.toContainText('313337');
    await expect(report.getByRole('heading', { name: 'Your financial choices', exact: true })).toHaveCount(0);
    expect(await report.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const reportAxe = await new AxeBuilder({ page: report }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(reportAxe.violations.map(v => v.id)).toEqual([]);
    await report.close();
    await home.getByLabel('Include private finances, renovation history and disputed-evidence notes').check();
    const privateDownload = page.waitForEvent('download');
    await home.getByRole('button', { name: 'Export private passport (JSON)' }).click();
    const privateData = JSON.parse(await readFile((await (await privateDownload).path())!, 'utf8'));
    expect(privateData.finance.inputs.mortgageBalance).toBe(313337);
    expect(privateData.finance.version).toBe('ascent-homeowner-finance-2');
    const financialRows = privateData.finance.results;
    expect(financialRows.find((r: { kind: string }) => r.kind === 'renovate').trajectory[0].equity).toBe(286663);
    expect(
      financialRows.find((r: { kind: string }) => r.kind === 'rent').ownershipCosts -
        financialRows.find((r: { kind: string }) => r.kind === 'hold').ownershipCosts,
    ).toBeCloseTo(17328, 2);
    expect(privateData.financeReplayMatches).toBe(true);
    expect(privateData.valuation.replay.reproduced).toBe(true);
    await home.getByLabel('Show evidence changes when I return to this home').check();
    await expect(home).toContainText('No recorded evidence changes');
    await home.getByRole('button', { name: 'Ask Ascent', exact: true }).click();
    await home.getByRole('button', { name: 'What changed since my saved decision?', exact: true }).click();
    await expect(home).toContainText('Against the selected saved decision');
    await home.getByRole('button', { name: 'What if I sell for $25,000 less?', exact: true }).click();
    await expect(home).toContainText('changes the sell scenario');
    await home.getByLabel('Editable explanation for your report').fill('My reviewed decision explanation.');
    await home.getByRole('button', { name: 'Compare Decisions', exact: true }).click();
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await home.screenshot({ path: `evidence/ascent-homeowner-${width}.png` });
    await page.reload();
    await home.getByRole('button', { name: 'Compare Decisions', exact: true }).click();
    await home.getByText('Edit financial assumptions', { exact: true }).click();
    await expect(home.getByLabel('Mortgage balance / payoff assumption ($)', { exact: true })).toHaveValue('313337');
    await expect(home.getByLabel('Monthly gross rent ($)', { exact: true })).toHaveValue('3800');
    await page.goto('/home');
    await expect(page.getByRole('heading', { name: '1200 Example Linden Court', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Remove saved home', exact: true }).click();
    const removal = page.getByRole('dialog', { name: 'Remove this saved home?' });
    await expect(removal).toContainText('2 saved decision versions');
    await expect(removal.getByRole('button', { name: 'Keep saved home' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(removal).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove saved home', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Remove saved home', exact: true }).click();
    await removal.getByRole('button', { name: 'Keep saved home' }).click();
    await expect(page.getByRole('heading', { name: '1200 Example Linden Court', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Remove saved home', exact: true }).click();
    const removalAxe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(removalAxe.violations.map(v => v.id)).toEqual([]);
    await removal.getByRole('button', { name: 'Remove home and history' }).click();
    await expect(page.getByRole('heading', { name: 'Start with one home.' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('ascent.practice-studio.v1'))).toBeNull();
    expect(errors).toEqual([]);
    expect(externalCalls).toEqual([]);
  });
}

test('real home keeps unprovided financial facts unknown and survives storage failure', async ({ page }) => {
  await page.goto('/dc?parcel=3313____0047');
  const home = page.getByRole('region', { name: 'Homeowner intelligence dashboard' });
  await expect(home).toContainText('Not provided');
  await expect(home.getByRole('button', { name: 'Try illustrative financial inputs' })).toHaveCount(0);
  await home.getByRole('button', { name: 'Save home & decision snapshot' }).click();
  await expect(home).toContainText('Home and decision snapshot saved');
  await home.getByRole('button', { name: 'Reports & History', exact: true }).click();
  const popup = page.waitForEvent('popup');
  await home.getByRole('button', { name: 'Open readable passport', exact: true }).click();
  const report = await popup;
  await expect(report.getByRole('heading', { name: 'Published accuracy reference', exact: true })).toBeVisible();
  await expect(report.locator('body')).toContainText('9 of 9 met');
  await report.close();
  await home.getByLabel('Show evidence changes when I return to this home').check();
  await expect(home).toContainText('No recorded evidence changes');
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    };
  });
  await home.getByRole('button', { name: 'Save home & decision snapshot' }).click();
  await expect(home).toContainText('Could not save');
  await expect(page.getByTestId('calibrated-interval')).toBeVisible();
});

test('failed saved-home removal retains the history and explains how to recover', async ({ page }) => {
  await page.goto('/demo');
  await page.getByRole('button', { name: 'Save home & decision snapshot' }).click();
  await page.goto('/home');
  const original = await page.evaluate(() => localStorage.getItem('ascent.homeowner-profiles.v1'));
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Blocked', 'SecurityError');
    };
  });
  await page.getByRole('button', { name: 'Remove saved home', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Remove home and history' }).click();
  await expect(dialog.getByRole('status')).toContainText('has not been removed');
  expect(await page.evaluate(() => localStorage.getItem('ascent.homeowner-profiles.v1'))).toBe(original);
  await dialog.getByRole('button', { name: 'Keep saved home' }).click();
  await expect(page.getByRole('heading', { name: '1200 Example Linden Court', exact: true })).toBeVisible();
});
