import { test, expect, type Page } from '@playwright/test';

// Browser workflow tests exercise deterministic evidence mode; live inference has a separate capped evaluation.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/assistant', async route => {
    const body = route.request().postDataJSON();
    await route.continue({ postData: JSON.stringify({ ...body, mode: 'evidence' }) });
  });
});
import { writeFile } from 'node:fs/promises';

async function demo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the working demo' }).click();
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Alex/ })).toBeVisible();
}
function nav(page: Page, name: string) {
  return page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name, exact: true });
}
/** Workspace tools start collapsed; expand the group before using one of its pages. */
async function openTools(page: Page) {
  const toggle = page.getByRole('button', { name: 'WORKSPACE TOOLS' });
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
}

test('domain review and contextual safety are connected to an actual frozen CMA', async ({ page }) => {
  await demo(page);
  await nav(page, 'Pricing studio').click();
  await page.getByRole('button', { name: 'Save CMA snapshot' }).click();
  await expect(page.getByText('Saved to your decision history.')).toBeVisible();
  await nav(page, 'Domain intelligence').click();
  await page.getByRole('button', { name: 'Evaluate current CMA' }).click();
  await expect(page.locator('.explanation-grid')).toBeVisible();
  await expect(page.locator('.explanation-grid')).toContainText('What remains unknown');
  await page.getByLabel('Text to review').fill('White buyers only.');
  await page.getByRole('button', { name: 'Inspect context' }).click();
  await expect(page.locator('.safety-result')).toContainText('Do not use');
  const snapshot = await (await page.request.get('/api/domain')).json();
  expect(snapshot.evaluations).toHaveLength(1);
  expect(snapshot.workspace.domain.safetyEvents.at(-1).decision).toBe('block');
  expect(JSON.stringify(snapshot.workspace.domain.safetyEvents)).not.toContain('White buyers only');
  await openTools(page);
  await nav(page, 'AI operations').click();
  await expect(page.getByRole('heading', { name: 'Fast thinking. Accountable economics.' })).toBeVisible();
  await expect(page.getByText('No measured provider calls in this workspace.')).toBeVisible();
});

test('academy progress requires real work and support requests have honest visible status', async ({ page }) => {
  await demo(page);
  await nav(page, 'Professional academy').click();
  await expect(page.locator('.academy-progress')).toContainText('0 of 5');
  await nav(page, 'Pricing studio').click();
  await page.getByRole('button', { name: 'Save CMA snapshot' }).click();
  await expect(page.getByText('Saved to your decision history.')).toBeVisible();
  await nav(page, 'Professional academy').click();
  await expect(page.locator('.academy-progress')).toContainText('1 of 5');
  const tasks = await (await page.request.get('/api/trust')).json();
  const inspect = tasks.academy.find((t: { nextAction: string }) => t.nextAction === 'inspectCma');
  await page.locator('.academy-task').filter({ hasText: inspect.title }).getByRole('button').click();
  await expect(page.getByRole('heading', { name: 'Your saved evidence breakdown' })).toBeVisible();
  await expect(page.locator('.academy-progress')).toContainText('2 of 5');
  await page.getByLabel('What is getting in the way?').fill('Please help interpret this comparable exclusion.');
  await page.getByRole('button', { name: 'Open a support request' }).click();
  await expect(page.locator('.ticket-row')).toContainText('Please help interpret this comparable exclusion.');
  await expect(page.locator('.ticket-row')).toContainText('open');
  await page.getByRole('button', { name: 'Close request', exact: true }).click();
  await expect(page.locator('.ticket-row')).toContainText('resolved');
});

test('authorized migration previews, confirms, exports and reverses contact changes', async ({ page }) => {
  await demo(page);
  await openTools(page);
  await nav(page, 'Import & portability').click();
  const original = await (await page.request.get('/api/workspace')).json();
  await page.getByLabel('Source name').fill('Authorized synthetic fixture');
  await page
    .getByLabel('CSV content')
    .fill(
      'name,email,stage,budget,preferences\nPortability Sample,portable@example.invalid,active,725000,Three bedrooms',
    );
  await page.getByRole('checkbox', { name: 'I am authorized to transfer these records.' }).check();
  await page.getByRole('checkbox', { name: 'This import contains no restricted MLS-derived property data.' }).check();
  await page.getByRole('button', { name: 'Validate & preview' }).click();
  await expect(page.getByRole('heading', { name: 'Review this exact import' })).toBeVisible();
  expect((await (await page.request.get('/api/workspace')).json()).workspace.clients.length).toBe(
    original.workspace.clients.length,
  );
  await page.getByRole('button', { name: 'Confirm this import' }).click();
  await expect(page.getByText('Import committed with audit history.')).toBeVisible();
  const imported = await (await page.request.get('/api/workspace')).json();
  expect(imported.workspace.clients.some((c: { email: string }) => c.email === 'portable@example.invalid')).toBe(true);
  const exported = await page.request.get('/api/migration/export?format=csv');
  expect(exported.ok()).toBe(true);
  expect(await exported.text()).toContain('portable@example.invalid');
  await page.getByRole('button', { name: 'Evaluate rollback' }).click();
  await expect(page.getByText('Rollback evaluated. Later manual changes are preserved.')).toBeVisible();
  expect((await (await page.request.get('/api/workspace')).json()).workspace.clients.length).toBe(
    original.workspace.clients.length,
  );
  await writeFile(
    'evidence/migration-browser-acceptance.json',
    JSON.stringify(
      {
        at: new Date().toISOString(),
        data: 'Synthetic contact CSV',
        previewChangesNothing: true,
        explicitConfirmation: true,
        exported: true,
        rollbackRestoresOriginalCount: true,
        externalVendorContacted: false,
      },
      null,
      2,
    ),
  );
});

test('opt-in metrics count saved work, priorities remain assumptions and flags can be reverted', async ({ page }) => {
  await demo(page);
  await openTools(page);
  await nav(page, 'Improvement lab').click();
  await page.getByRole('button', { name: 'Opt in to aggregate workflow metrics' }).click();
  await expect(page.getByRole('button', { name: 'Turn aggregate metrics off' })).toBeVisible();
  await page.getByRole('button', { name: 'Record a prioritization hypothesis' }).click();
  await expect(page.getByText('1.50 · assumptions only')).toBeVisible();
  await expect(page.locator('.experiment-row')).toHaveCount(3);
  await page.locator('.experiment-row').first().getByRole('button').click();
  await expect(page.locator('.experiment-row').first()).toContainText('Disable variation');
  await page.locator('.experiment-row').first().getByRole('button').click();
  await expect(page.locator('.experiment-row').first()).toContainText('Enable 50% rollout');
  await nav(page, 'Pricing studio').click();
  await page.getByRole('button', { name: 'Save CMA snapshot' }).click();
  await expect(page.getByText('Saved to your decision history.')).toBeVisible();
  await openTools(page);
  await nav(page, 'Improvement lab').click();
  const product = await (await page.request.get('/api/product')).json();
  expect(product.metrics.find((m: { feature: string }) => m.feature === 'cma').completedTasks).toBe(1);
  expect(JSON.stringify(product.metrics)).not.toContain('Alex');
});

test('a late child workflow response cannot replace the next tenant workspace', async ({ page }) => {
  await demo(page);
  const old = await (await page.request.get('/api/workspace')).json();
  old.workspace.settings.organization = 'PRIOR_TENANT_WORKSPACE_SENTINEL';
  let release!: () => void, arrived!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const intercepted = new Promise<void>(resolve => {
    arrived = resolve;
  });
  await page.route('**/api/workspace', async route => {
    arrived();
    await gate;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(old) });
  });
  await nav(page, 'Professional academy').click();
  await page.getByLabel('What is getting in the way?').fill('Synthetic session-boundary check');
  await page.getByRole('button', { name: 'Open a support request' }).click();
  await intercepted;
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('button', { name: 'Explore the working demo' }).click();
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Alex/ })).toBeVisible();
  const delivered = page.waitForResponse(response => response.url().endsWith('/api/workspace'));
  release();
  await (await delivered).finished();
  await expect(page.getByText('PRIOR_TENANT_WORKSPACE_SENTINEL')).toHaveCount(0);
  await expect(page.locator('.org-switch')).toContainText('Ascent Demonstration');
});
