import { test, expect, type Page } from '@playwright/test';
import type { CmaRecord, Workspace } from '../../src/lib/types';

// Browser workflow tests exercise deterministic evidence mode; live inference has a separate capped evaluation.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/assistant', async route => {
    const body = route.request().postDataJSON();
    await route.continue({ postData: JSON.stringify({ ...body, mode: 'evidence' }) });
  });
});
import { writeFile } from 'node:fs/promises';

async function saveAndReadCma(page: Page) {
  const [response] = await Promise.all([
    page.waitForResponse(
      response =>
        response.url().endsWith('/api/actions') &&
        response.request().method() === 'POST' &&
        response.request().postDataJSON().type === 'saveCma',
    ),
    page.getByRole('button', { name: 'Save CMA snapshot' }).click(),
  ]);
  expect(response.status()).toBe(200);
  const saved = (await response.json()) as { result: CmaRecord };
  const state = (await (await page.request.get('/api/workspace')).json()) as { workspace: Workspace };
  const record = state.workspace.cmas.find(record => record.id === saved.result.id)!;
  expect(record).toBeDefined();
  expect(record.result.inputSnapshot).toBeDefined();
  return { workspace: state.workspace, record };
}
test('onboarding acceptance: useful CMA in under two minutes with pending professional review', async ({ page }) => {
  const started = Date.now();
  await page.goto('/');
  // On a cold development server the first page can paint before React attaches handlers.
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Create an account' }).first().click();
  await page.getByLabel('Full name').fill('Taylor Explorer');
  await page.getByLabel('Organization', { exact: true }).fill('Instant Exploration');
  await page.getByLabel('Email address').fill(`explorer-${Date.now()}@example.invalid`);
  await page.getByLabel('Password', { exact: true }).fill('Independent-Free-Explorer!');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Taylor/ })).toBeVisible();
  // A new account starts empty; the labeled fixture is an explicit choice, not a default.
  await expect(page.getByRole('combobox', { name: 'Market region' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Practice on the labeled fixture' }).click();
  await expect(page.getByRole('combobox', { name: 'Market region' })).toHaveValue('dmv');
  await page.getByRole('button', { name: 'WORKSPACE TOOLS' }).click();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Access & verification' })
    .click();
  await page.getByLabel('Legal name on license').fill('Taylor Explorer');
  await page.getByLabel('License number', { exact: true }).fill('SYNTHETIC-REVIEW-ONLY');
  await page.getByRole('button', { name: 'Submit for asynchronous review' }).click();
  await expect(page.getByText('Credential status: pending')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Pricing studio', exact: true })
    .click();
  await expect(page.locator('.valuation-card h2')).toContainText('$');
  await saveAndReadCma(page);
  await expect(page.locator('.snapshot-row').last().getByRole('link', { name: 'Client report' })).toBeVisible();
  const elapsedMs = Date.now() - started;
  expect(elapsedMs).toBeLessThan(120000);
  const response = await page.request.get('/api/workspace');
  const data = await response.json();
  expect(data.workspace.platform.verification.status).toBe('pending');
  expect(data.workspace.platform.plan).toBe('free');
  // Exactly the analysis the user saved: an empty account never receives an invented CMA.
  expect(data.workspace.cmas.length).toBe(1);
  await writeFile(
    'evidence/onboarding-acceptance.json',
    JSON.stringify(
      {
        at: new Date().toISOString(),
        environment: 'Local development browser; fictional records; not a human usability study',
        elapsedMs,
        registered: true,
        verification: 'pending',
        plan: 'free',
        usefulWorkflow: 'Empty account, explicit practice-fixture load, DMV synthetic CMA saved with printable report',
        underTwoMinutes: elapsedMs < 120000,
      },
      null,
      2,
    ),
  );
});
test('geographic expansion acceptance: same property/CMA interfaces work in DMV and Austin', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the working demo' }).click();
  await expect(page.getByRole('combobox', { name: 'Market region' })).toHaveValue('dmv');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  const results = [];
  for (const region of ['dmv', 'austin']) {
    await page.getByRole('combobox', { name: 'Market region' }).selectOption(region);
    await nav.getByRole('button', { name: 'Properties', exact: true }).click();
    await expect(page.locator('.property-card').first()).toBeVisible();
    await page.getByRole('button', { name: 'Build a CMA for this property' }).click();
    await expect(page.locator('.valuation-card h2')).toContainText('$');
    const title = await page.locator('.valuation-card-top .eyebrow').textContent();
    const { workspace, record } = await saveAndReadCma(page);
    await expect(page.getByText('Saved to your decision history.')).toBeVisible();
    expect(record.result.inputSnapshot!.subject.id).toBe(record.propertyId);
    expect(record.result.inputSnapshot!.subject.address).toBe(title);
    expect(record.result.inputSnapshot!.subject.state).toBe(region === 'dmv' ? 'VA' : 'TX');
    expect(record.result.comps.length).toBeGreaterThan(2);
    results.push({
      region,
      property: title,
      comps: record.result.comps.length,
      estimate: record.result.estimate,
      mode: workspace.mode,
    });
  }
  expect(results[0].property).not.toEqual(results[1].property);
  const tools = page.getByRole('button', { name: 'WORKSPACE TOOLS' });
  if ((await tools.getAttribute('aria-expanded')) === 'false') await tools.click();
  await nav.getByRole('button', { name: 'National data fabric' }).click();
  await expect(page.getByRole('heading', { name: 'One engine. More places to understand.' })).toBeVisible();
  await expect(page.locator('.coverage-card')).toHaveCount(2);
  await expect(page.getByText('No nationwide MLS access implied')).toBeVisible();
  await writeFile(
    'evidence/geographic-acceptance.json',
    JSON.stringify(
      {
        at: new Date().toISOString(),
        regions: results,
        implementation: 'Shared canonical ingestion, property interface, and calculateCma function',
        data: 'Synthetic fixtures only',
        liveCoverageClaim: false,
      },
      null,
      2,
    ),
  );
});

test('a pending market switch withholds stale property actions until the selected market is ready', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the working demo' }).click();
  const market = page.getByRole('combobox', { name: 'Market region' });
  await expect(market).toHaveValue('dmv');
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/api/fabric', async route => {
    const request = route.request();
    if (request.method() === 'POST' && request.postDataJSON().action === 'selectRegion') await gate;
    await route.continue();
  });
  try {
    await market.selectOption('austin');
    await expect(page.getByRole('status').filter({ hasText: 'Loading market' })).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'Properties', exact: true })
      .click();
    await expect(page.getByRole('button', { name: 'Build a CMA for this property' })).toBeHidden();
    await expect(page.locator('#main')).toHaveAttribute('aria-busy', 'true');
  } finally {
    release();
  }
  await expect(market).toBeEnabled();
  await expect(market).toHaveValue('austin');
  await expect(page.getByRole('heading', { level: 2, name: '104 Example Willow Loop' })).toBeVisible();
  await page.getByRole('button', { name: 'Build a CMA for this property' }).click();
  await expect(page.locator('.valuation-card-top .eyebrow')).toContainText('104 Example Willow');
  const { workspace, record } = await saveAndReadCma(page);
  await expect(page.getByText('Saved to your decision history.')).toBeVisible();
  expect(workspace.fabric?.selectedRegionId).toBe('austin');
  expect(record.result.inputSnapshot!.subject.state).toBe('TX');
});
