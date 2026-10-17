import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFile } from 'node:fs/promises';
import os from 'node:os';

for (const viewport of [
  { width: 1440, height: 960 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`account-free pricing decision and report at ${viewport.width}px`, async ({ page, browserName }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [],
      apiCalls: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => {
      if (new URL(r.url()).pathname.startsWith('/api/')) apiCalls.push(new URL(r.url()).pathname);
    });
    const started = Date.now();
    await page.goto('/');
    await page.getByRole('link', { name: 'Analyze a property', exact: true }).first().click();
    await expect(page.getByTestId('studio-estimate')).toHaveText('$963,010');
    const meaningfulMs = Date.now() - started;
    if (viewport.width === 1440) await page.screenshot({ path: 'evidence/ascent-studio-preview.png', fullPage: false });
    expect(meaningfulMs).toBeLessThan(30000);
    // No session, provider or model endpoint is needed for the public experience.
    expect(apiCalls).toEqual([]);
    const inspector = page.getByRole('region', { name: 'Selected comparable detail' });
    await page.getByRole('button', { name: /1186 Example Linden Court .*weight/ }).click();
    await expect(inspector.getByRole('heading')).toHaveText('1186 Example Linden Court');
    await inspector.getByText('Exactly how the weight is calculated', { exact: true }).click();
    await expect(inspector).toContainText('Raw weight = 1');
    // One axis shows every adjusted sale, the estimate and the asking price; a sale opens in the inspector.
    const strip = page.getByRole('group', { name: /^Price axis\./ });
    await expect(strip).toContainText('Asking $963,010');
    await strip.getByRole('button', { name: /1414 Example Cedar Lane: adjusted/ }).click();
    await expect(inspector.getByRole('heading')).toHaveText('1414 Example Cedar Lane');
    await page.getByRole('link', { name: /02 Choose a strategy/ }).click();
    const plan = page.getByRole('region', { name: 'Seller proceeds by pricing move' });
    await expect(plan).toContainText('Same amount as a credit');
    await expect(page.getByText(/credit nets the seller \$\d[\d,]* less than an equal price reduction/)).toBeVisible();
    await page.getByRole('link', { name: /03 Challenge the decision/ }).click();
    const drivers = page.getByRole('heading', { name: 'Which input moves this price most?', exact: true });
    await expect(drivers).toBeVisible();
    await expect(page.locator('.drivers-list li').first()).toContainText('Subject condition rating');
    await page.getByLabel('Subject condition rating', { exact: true }).selectOption('3');
    await expect(page.getByTestId('studio-estimate')).toHaveText('$949,010');
    await page.getByLabel('Subject condition rating', { exact: true }).selectOption('4');
    await page.getByLabel('Living area ($ per sq ft)', { exact: true }).fill('150');
    await expect(page.getByTestId('studio-estimate')).not.toHaveText('$963,010');
    await page.getByLabel('Sale to exclude', { exact: true }).selectOption('landing-c4');
    await page.getByLabel('Reason for excluding sale').fill('Finish quality needs a site visit');
    await page.getByRole('button', { name: 'Exclude sale', exact: true }).click();
    await expect(page.getByRole('region', { name: 'What changes my decision', exact: true })).toContainText(
      'Analyst decision: Finish quality needs a site visit',
    );
    // A sale the user knows about enters as labeled, unverified evidence and changes the calculation.
    const beforeEntry = await page.getByTestId('studio-estimate').innerText();
    await page.getByText('Add a sale you know about', { exact: true }).click();
    await page.getByLabel('Address or label', { exact: true }).fill('14 Practice Entry Lane');
    await page.getByLabel('Closing price ($)', { exact: true }).fill('1005000');
    await page.getByLabel('Closing date', { exact: true }).fill('2026-09-20');
    await page.getByLabel('Distance from subject (miles)', { exact: true }).fill('0.3');
    await page.getByRole('button', { name: 'Add practice sale', exact: true }).click();
    await expect(page.locator('.studio-exclusions')).toContainText('14 Practice Entry Lane · entered by you');
    await expect(page.getByTestId('studio-estimate')).not.toHaveText(beforeEntry);
    await page.getByRole('button', { name: /Conservative \$/ }).click();
    await page.getByLabel('Mortgage payoff ($)', { exact: true }).fill('300000');
    await page.getByRole('button', { name: 'What changed in this decision?', exact: true }).click();
    await expect(page.locator('.pricing-answer')).toContainText('frozen comparison');
    const selectedPrice = await page.locator('.studio-strategies button.selected>strong').innerText();
    await page.getByRole('link', { name: /04 Open your report/ }).click();
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('link', { name: 'Open professional report', exact: true }).click();
    const report = await popupPromise;
    await expect(report.getByRole('heading', { name: '1200 Example Linden Court', exact: true })).toBeVisible();
    await expect(report.getByText(/FICTIONAL DEMONSTRATION DATA/)).toBeVisible();
    await expect(report.locator('.net tr').first()).toContainText(selectedPrice);
    await expect(report.getByText('Mortgage payoff (entered)')).toBeVisible();
    await expect(report.getByRole('listitem').filter({ hasText: 'Finish quality needs a site visit' })).toBeVisible();
    await expect(report.getByText('Source: Entered by you in the practice studio (unverified) (user)')).toBeVisible();
    await expect(report.getByText(/condition 4\/5 \(analyst rating\)/)).toBeVisible();
    expect(await report.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const reportAxe = await new AxeBuilder({ page: report }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(reportAxe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
    const reportMs = Date.now() - started;
    expect(reportMs).toBeLessThan(120000);
    await report.close();
    await page.reload();
    await expect(page.getByLabel('Mortgage payoff ($)', { exact: true })).toHaveValue('300000');
    await expect(page.getByText('Practice draft restored on this device.')).toBeVisible();
    await page.getByRole('link', { name: /01 Review the evidence/ }).click();
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `evidence/ascent-studio-${viewport.width}.png`, fullPage: true });
    expect(errors).toEqual([]);
    await writeFile(
      `evidence/pricing-studio-${viewport.width}.json`,
      JSON.stringify(
        {
          at: new Date().toISOString(),
          baselineCommit: '4c66ee6',
          viewport,
          browserName,
          hardware: {
            platform: os.platform(),
            arch: os.arch(),
            cpu: os.cpus()[0]?.model,
            memoryGB: Math.round(os.totalmem() / 1024 ** 3),
          },
          node: process.version,
          environment:
            'Local Next.js development server, installed Chrome, fictional authored data, scripted warm/cold compile conditions uncontrolled; not human study or production SLA',
          sampleSize: 1,
          meaningfulMs,
          reportMs,
          accountRequired: false,
          workspaceProviderModelCalls: apiCalls.filter(path => !path.startsWith('/api/demo/')).length,
          axeViolations: axe.violations.length,
          horizontalOverflow: false,
        },
        null,
        2,
      ),
    );
  });
}

test('no-evidence recovery and corrupted device storage are explicit', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ascent.practice-studio.v1', '{"unrecognized":"old"}'));
  await page.goto('/demo');
  await expect(page.getByText('An older practice draft could not be restored. A fresh sample is ready.')).toBeVisible();
  await page.getByText('Eligibility filters: radius, sale age and size similarity', { exact: true }).click();
  await page.getByLabel('Sale age limit (days)', { exact: true }).fill('1');
  await expect(page.getByRole('alert').filter({ hasText: 'No eligible closed comparables' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open professional report', exact: true })).toHaveCount(0);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations).toEqual([]);
  await page.getByRole('button', { name: 'Restore original evidence', exact: true }).click();
  await expect(page.getByTestId('studio-estimate')).toHaveText('$963,010');
});

test('public entry preserves invitation handoff without claiming a session', async ({ page }) => {
  await page.goto('/?invite=fictional-invalid-invitation');
  await expect(page.getByRole('heading', { name: 'Keep the work connected.' })).toBeVisible();
});

test('workspace navigation survives browser history and reload; saved reports retain selected price', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the working demo', exact: true }).click();
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await nav.getByRole('button', { name: 'Pricing studio', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Interactive comparable intelligence' })).toBeVisible();
  await page.getByRole('slider', { name: 'Asking price scenario' }).fill('950000');
  await page.getByRole('button', { name: 'Save CMA snapshot', exact: true }).click();
  await expect(page.locator('.snapshot-row').last()).toContainText('Needs review');
  const href = await page
    .locator('.snapshot-row')
    .last()
    .getByRole('link', { name: 'Client report', exact: true })
    .getAttribute('href');
  expect(href).toContain('asking=950000');
  const report = await page.request.get(href!);
  expect(report.status()).toBe(200);
  expect(await report.text()).toContain('$950,000');
  await nav.getByRole('button', { name: 'Clients', exact: true }).click();
  await expect(page).toHaveURL(/view=clients/);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'A price you can explain.', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'A price you can explain.', exact: true })).toBeVisible();
});
