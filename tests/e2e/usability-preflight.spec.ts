import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { usabilityAnswerKey } from '../../src/lib/usability-study';

/**
 * Pre-flight for the registered comprehension study: every task's correct answer must be on the page in its
 * prepared state, at phone and desktop widths, before a session runs. This checks the build, not comprehension.
 */
const key = usabilityAnswerKey();
const usd = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
const brief = (page: Page) => page.getByRole('region', { name: 'Your Home Decision Brief' });
const accessible = async (page: Page) => {
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
};
/** A returning visitor's practice draft and saved home must never leak into a prepared state. */
const seedEarlierVisit = (page: Page) =>
  page.addInitScript(() => {
    localStorage.setItem(
      'ascent.practice-studio.v1',
      JSON.stringify({
        assumptions: {
          sqftRate: 300,
          bedroomValue: 0,
          bathroomValue: 0,
          conditionValue: 0,
          monthlyTrend: 0,
          maxDistanceMiles: 3,
          maxAgeDays: 180,
          maxSizeRatio: 1.35,
        },
        exclusions: [],
        listPrice: 1234567,
        commissionPercent: 2.5,
        closingPercent: 1,
        concessions: 0,
        payoff: 0,
      }),
    );
  });

/** Prepared states keep nothing on the device: the seeded earlier visit is all that remains, unchanged. */
const storageUntouched = async (page: Page) => {
  await expect(page.getByRole('button', { name: 'Save home & decision snapshot' })).toBeDisabled();
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).map(key => [key, JSON.parse(localStorage.getItem(key) ?? 'null')?.listPrice ?? null]),
    ),
  ).toEqual([['ascent.practice-studio.v1', 1234567]]);
};

for (const width of [390, 1440]) {
  test(`T1, T3–T5: the practice home shows the estimate, its limits, the leading sale and missing facts at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await seedEarlierVisit(page);
    await page.goto('/demo/study/value');
    await expect(page.getByTestId('studio-estimate')).toHaveText(key.T1.estimate);
    await expect(page.getByText('Draft restored on this device.')).toHaveCount(0);
    await expect(page.getByText('Prepared session · Practice home')).toBeVisible();
    const panel = brief(page);
    await expect(panel.locator('.brief-verdict')).toHaveText(new RegExp(key.T1.label));
    await expect(panel).toContainText(`${key.T4.range}, which is not a confidence interval`);
    const lead = panel.locator('.brief-sales > li').first();
    await expect(lead).toContainText(key.T3.sale);
    await expect(lead).toContainText(`${key.T3.weightPercent}% of the weight`);
    for (const fact of key.T5.facts) await expect(panel.locator('.brief-missing')).toContainText(fact);
    await accessible(page);
    await storageUntouched(page);
  });

  test(`T2: the few-sales home states no value and says why at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await seedEarlierVisit(page);
    await page.goto('/demo/study/abstention');
    await expect(page.getByTestId('studio-estimate')).toHaveText('Not stated');
    const panel = brief(page);
    await expect(panel.locator('.brief-verdict')).toHaveText(new RegExp(key.T2.label));
    await expect(panel).toContainText(key.T2.reason);
    // Nothing the participant did not do is attributed to them.
    await expect(panel.getByRole('heading', { name: 'Sales you excluded' })).toHaveCount(0);
    await expect(panel).toContainText('None. Every setting matches Ascent’s practice defaults.');
    await accessible(page);
  });

  test(`T6–T9: illustrative finances load with proceeds, drivers, break-even and a mortgage-free export at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await seedEarlierVisit(page);
    await page.goto('/demo/study/finance');
    const panel = brief(page);
    await expect(panel).toContainText('6 of 6 choices can be computed');
    await expect(panel).toContainText(`would leave about ${key.T6.sellNetProceeds}`);
    await expect(panel).toContainText('Ascent does not rank them');
    const home = page.getByRole('region', { name: 'Homeowner intelligence dashboard' });
    await expect(home.getByRole('button', { name: 'Compare Decisions', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(home.getByRole('heading', { name: 'Continue owning: the inputs that move it most' })).toBeVisible();
    await expect(
      home
        .getByRole('table', { name: /Change in net position at month 60/ })
        .locator('tbody th')
        .first(),
    ).toContainText(key.T7.topDriver);
    await expect(home.locator('.home-breakevens')).toContainText(`${usd(key.T8.breakEven!)}.`);
    await accessible(page);
    await home.getByRole('button', { name: 'Reports & History', exact: true }).click();
    await expect(home.getByRole('checkbox', { name: /Include private finances/ })).not.toBeChecked();
    const download = page.waitForEvent('download');
    await home.getByRole('button', { name: 'Export sharing passport (JSON)' }).click();
    const file = await (await download).path();
    const shared = await readFile(file!, 'utf8');
    expect(shared).not.toMatch(/"(mortgageBalance|payoff|finance)"/);
    await expect(home.getByText(/Mortgage, financial inputs and homeowner notes are omitted/)).toBeVisible();
    await storageUntouched(page);
  });
}

test('only the three prepared states exist', async ({ page }) => {
  const response = await page.goto('/demo/study/not-a-state');
  expect(response?.status()).toBe(404);
});
