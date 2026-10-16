import { test, expect } from '@playwright/test';

// Browser workflow tests exercise deterministic evidence mode; live inference has a separate capped evaluation.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/assistant', async route => {
    const body = route.request().postDataJSON();
    await route.continue({ postData: JSON.stringify({ ...body, mode: 'evidence' }) });
  });
});
import AxeBuilder from '@axe-core/playwright';
import { writeFile } from 'node:fs/promises';

test('professional workflow: sign in, research, price, client, offers, transaction, copilot, report and persistence', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /Price with proof/ })).toBeVisible();
  await page.getByRole('button', { name: 'Explore the working demo' }).click();
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Alex/ })).toBeVisible();
  await expect(page.getByText('SYNTHETIC DEMO', { exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Market region' })).toHaveValue('dmv');
  await page.getByRole('combobox', { name: 'Market region' }).selectOption('austin');
  await expect(page.locator('.feature-details h3')).toContainText('104 Example Willow');
  await page.screenshot({ path: 'evidence/ascent-overview-desktop.png', fullPage: true });
  const overviewAxe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(overviewAxe.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }))).toEqual([]);
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Properties', exact: true })
    .click();
  await page.getByRole('textbox', { name: 'Search properties' }).fill('Willow');
  await expect(page.getByRole('button', { name: /104 Example Willow/ }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Build a CMA for this property' }).click();
  await expect(page.getByRole('heading', { name: 'A price you can explain.' })).toBeVisible();
  const slider = page.getByRole('slider', { name: 'Asking price scenario' });
  const before = await slider.inputValue();
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  expect(await slider.inputValue()).not.toBe(before);
  await page.getByRole('button', { name: 'Save CMA snapshot' }).click();
  await expect(page.getByText('Saved to your decision history.')).toBeVisible();
  const snapshot = page
    .locator('.snapshot-row')
    .filter({ hasText: /Willow/ })
    .last();
  await expect(snapshot).toBeVisible();
  await snapshot.getByRole('button', { name: 'Approve recommendation' }).click();
  await expect(snapshot.getByText('Reviewed', { exact: true })).toBeVisible();
  const reportHref = await snapshot.getByRole('link', { name: 'Client report' }).getAttribute('href');
  expect(reportHref).toContain('cmaId=');
  const reportStart = Date.now();
  const report = await page.request.get(reportHref!);
  const reportMs = Date.now() - reportStart;
  expect(report.status()).toBe(200);
  expect(await report.text()).toContain('synthetic');
  await writeFile(
    'evidence/report-acceptance.json',
    JSON.stringify(
      {
        at: new Date().toISOString(),
        elapsedMs: reportMs,
        status: report.status(),
        mode: 'Local development HTTP report generation with synthetic evidence',
        competitiveComparison: false,
      },
      null,
      2,
    ),
  );
  await page.screenshot({ path: 'evidence/ascent-pricing-desktop.png', fullPage: true });
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Clients', exact: true })
    .click();
  await page.getByRole('button', { name: 'Add client', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Client name', { exact: true }).fill('Jordan Demo');
  await dialog.getByLabel('Email', { exact: true }).fill('jordan@example.invalid');
  await dialog
    .getByLabel('Property preferences')
    .fill('Three bedrooms, flexible closing, budget verified with lender.');
  await dialog.getByRole('button', { name: 'Save to workspace' }).click();
  await page.getByRole('button', { name: /JD Jordan Demo/ }).click();
  await page
    .getByRole('textbox', { name: 'Add relationship note' })
    .fill('Confirmed property needs and asked for a CMA review.');
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await expect(page.getByText('Confirmed property needs and asked for a CMA review.')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Offer room', exact: true })
    .click();
  await expect(page.locator('.offer-card')).toHaveCount(3);
  await page.locator('.offer-card').first().getByRole('button', { name: 'Create counteroffer draft' }).click();
  await expect(page.getByText('DRAFT FOR PROFESSIONAL REVIEW', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Approve draft' }).first().click();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Transactions', exact: true })
    .click();
  const complete = page.getByRole('button', { name: /Complete / }).first();
  const label = await complete.getAttribute('aria-label');
  await complete.click();
  await expect(page.getByRole('button', { name: label!.replace('Complete ', 'Reopen ') })).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({
    name: 'contract-demo.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'Synthetic contract. Inspection contingency due 2026-10-27. Closing target 2026-11-16. All dates require professional review.',
    ),
  });
  await page.getByRole('button', { name: 'Upload privately' }).click();
  await expect(page.getByText('contract-demo.txt', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review & add deadline' }).first().click();
  await expect(page.getByText('Added to timeline', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ask Ascent', exact: false }).click();
  await page
    .getByRole('textbox', { name: 'Ask about this workspace' })
    .fill('What deadlines need review in this transaction?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.locator('.assistant-message')).toBeVisible();
  await expect(page.locator('.citation').first()).toBeVisible();
  await expect(page.locator('.assistant-message')).toContainText('Evidence retrieval');
  await page.getByRole('button', { name: 'Close copilot' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Alex/ })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Clients', exact: true })
    .click();
  await expect(page.getByRole('button', { name: /JD Jordan Demo/ })).toBeVisible();
  await page.keyboard.press('Control+k');
  await page.getByRole('textbox', { name: 'Search workspace commands' }).fill('Market pulse');
  await page.getByRole('dialog', { name: 'Command search' }).getByRole('button', { name: 'Market pulse' }).click();
  await expect(page.getByRole('heading', { name: 'Know when the picture changes.' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('registration, logout, password login and tenant-private workspace', async ({ page }) => {
  const email = `agent-${Date.now()}@example.invalid`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).first().click();
  await page.getByLabel('Full name').fill('Casey Agent');
  await page.getByLabel('Organization', { exact: true }).fill('Independent Test Brokerage');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Correct-battery-42!');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Casey/ })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Good to have you here.' })).toBeVisible();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Correct-battery-42!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Independent Test Brokerage', { exact: true })).toBeVisible();
  const ws = await page.request.get('/api/workspace');
  expect(ws.status()).toBe(200);
  const body = await ws.json();
  expect(body.workspace.clients.some((c: { name: string }) => c.name === 'Jordan Demo')).toBe(false);
});

test('mobile navigation and accessible working views', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the working demo' }).click();
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Alex/ })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Market region' })).toHaveValue('dmv');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'evidence/ascent-overview-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Pricing studio', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'A price you can explain.' })).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('sign-out clears copilot context and ignores a previous tenant’s late response', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the working demo' }).click();
  await expect(page.getByRole('combobox', { name: 'Market region' })).toHaveValue('dmv');
  let release!: () => void, arrived!: () => void;
  const gate = new Promise<void>(resolve => {
      release = resolve;
    }),
    intercepted = new Promise<void>(resolve => {
      arrived = resolve;
    });
  await page.route('**/api/assistant', async route => {
    arrived();
    await gate;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        mode: 'evidence',
        answer: 'PRIOR_TENANT_SENTINEL',
        citations: [],
        missingInformation: [],
        suggestedActions: [],
        computed: false,
        tools: [],
      }),
    });
  });
  await page.getByRole('button', { name: 'Ask Ascent', exact: false }).click();
  await page.getByRole('textbox', { name: 'Ask about this workspace' }).fill('A private prior-session question');
  await page.getByRole('button', { name: 'Send question' }).click();
  await intercepted;
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Good to have you here.' })).toBeVisible();
  await page.getByRole('button', { name: 'Explore the working demo' }).click();
  await expect(page.getByRole('combobox', { name: 'Market region' })).toHaveValue('dmv');
  const delivered = page.waitForResponse(response => response.url().endsWith('/api/assistant'));
  release();
  await (await delivered).finished();
  await page.getByRole('button', { name: 'Ask Ascent', exact: false }).click();
  await expect(page.locator('.assistant-welcome')).toBeVisible();
  await expect(page.getByText('PRIOR_TENANT_SENTINEL')).toHaveCount(0);
  await expect(page.locator('.conversation-turn')).toHaveCount(0);
});
