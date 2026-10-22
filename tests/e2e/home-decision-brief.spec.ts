import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const questions = [
  'What does the evidence suggest about value?',
  'Which sales support it?',
  'How reliable and current is the evidence?',
  'Which facts about your home are missing?',
  'What would each choice mean financially?',
  'Which assumptions move each outcome most?',
  'What should you get before deciding?',
];
const brief = (page: Page) => page.getByRole('region', { name: 'Your Home Decision Brief' });
const accessible = async (page: Page) => {
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
};

for (const width of [1440, 390, 320]) {
  test(`the brief answers seven questions with traced figures at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/demo');
    await expect(page.getByTestId('studio-estimate')).toHaveText('$963,010');
    const panel = brief(page);
    await expect(panel.getByRole('heading', { level: 2, name: 'Your Home Decision Brief' })).toBeVisible();
    for (const question of questions)
      await expect(
        panel.getByRole('heading', { level: 3, name: new RegExp(question.replace('?', '\\?')) }),
      ).toBeVisible();
    await expect(panel.getByText('Practice estimate · fictional data')).toBeVisible();
    await expect(panel.locator('.brief-figure.lead').first()).toContainText('$963,010');
    await expect(panel.locator('.brief-figure.lead').first()).toContainText('Calculation');
    await expect(panel).toContainText('not a confidence interval');
    await expect(panel).toContainText('No choice can be fully computed yet');
    // The jump links work from the keyboard and land on the question.
    const missing = panel
      .getByRole('navigation', { name: 'Brief questions' })
      .getByRole('link', { name: 'Missing facts' });
    await missing.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#brief-missing$/);
    await expect(panel.getByRole('heading', { name: /Which facts about your home are missing/ })).toBeInViewport();
    await accessible(page);
    expect(errors).toEqual([]);
  });
}

test('financial inputs flow into the brief, and Ask Ascent explains with references', async ({ page }) => {
  await page.goto('/demo');
  const home = page.getByRole('region', { name: 'Homeowner intelligence dashboard' });
  await home.getByRole('button', { name: 'Compare Decisions', exact: true }).click();
  await home.getByRole('button', { name: 'Try illustrative financial inputs' }).click();
  const panel = brief(page);
  await expect(panel).toContainText('6 of 6 choices can be computed');
  await expect(panel).toContainText('Ascent does not rank them');
  await expect(panel.getByText('Break-even thresholds', { exact: true })).toBeVisible();
  await expect(panel).toContainText('Sale price at which selling matches continuing to own');
  await home.getByRole('button', { name: 'Ask Ascent', exact: true }).click();
  await home.getByRole('button', { name: 'Why is my home valued this way?', exact: true }).click();
  await expect(home).toContainText('weighted average of 6 recorded sales');
  await expect(home).toContainText('References: valuation');
  await home.getByRole('button', { name: 'Which sale influences the estimate most?', exact: true }).click();
  await expect(home).toContainText('carries the most weight');
  await home.getByRole('button', { name: 'What would I receive after selling costs?', exact: true }).click();
  await expect(home).toContainText('proceeds before your mortgage payoff');
  await accessible(page);
});

test('with fewer than three eligible sales the brief and headline decline to state a value', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'ascent.practice-studio.v1',
      JSON.stringify({
        assumptions: {
          sqftRate: 110,
          bedroomValue: 12000,
          bathroomValue: 15000,
          conditionValue: 14000,
          monthlyTrend: 0,
          maxDistanceMiles: 3,
          maxAgeDays: 180,
          maxSizeRatio: 1.35,
        },
        exclusions: ['landing-c1', 'landing-c2', 'landing-c3', 'landing-c4'].map(id => ({
          id,
          reason: 'Removed to test abstention',
        })),
        listPrice: null,
        commissionPercent: 2.5,
        closingPercent: 1,
        concessions: 0,
        payoff: 0,
      }),
    ),
  );
  await page.goto('/demo');
  await expect(page.getByText('Draft restored on this device.')).toBeVisible();
  await expect(page.getByTestId('studio-estimate')).toHaveText('Not stated');
  const panel = brief(page);
  await expect(panel.locator('.brief-verdict')).toHaveText(/Value not stated/);
  await expect(panel.getByRole('heading', { name: 'Why no value is stated' })).toBeVisible();
  await expect(panel).toContainText('Only 2 eligible recorded sales');
  await expect(panel).toContainText('licensed appraisal');
  await expect(page.getByRole('region', { name: 'Pricing strategy simulator' })).toContainText(
    'Ascent is not stating a value for this home',
  );
  await expect(page.getByRole('region', { name: 'Homeowner intelligence dashboard' })).toContainText('Not stated');
  await accessible(page);
  await page.getByRole('button', { name: 'Reset to original' }).click();
  await expect(page.getByTestId('studio-estimate')).toHaveText('$963,010');
});

for (const [name, path, verdict, expected] of [
  ['DC', '/dc?parcel=3313____0047', /Supported by the evidence|Estimate with stated limits/, 'Calibrated 80% range'],
  ['Maryland', '/maryland?parcel=161301059818', /Estimate with stated limits/, 'Bedroom and bathroom counts'],
  ['DC condo', '/dc/condos?parcel=2528____2001', /Estimate with stated limits/, 'HOA dues'],
] as const)
  test(`${name}: the brief follows the property's market evidence`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(path);
    await expect(page.getByTestId('studio-estimate')).toHaveText(/^\$[\d,]+$/);
    const panel = brief(page);
    await expect(panel.locator('.brief-verdict')).toHaveText(verdict);
    await expect(panel).toContainText(expected);
    await expect(panel).toContainText('this is a snapshot, not a live feed');
    if (name !== 'DC') await expect(panel).toContainText('did not pass');
    await accessible(page);
  });
