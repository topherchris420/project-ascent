import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
test.use({ trace: 'off', screenshot: 'off' });
test('opt-in: real cached property evidence, saved CMA restoration and report work with zero additional provider requests', async ({
  page,
}) => {
  test.skip(
    process.env.ASCENT_VERIFY_CACHED_LIVE !== 'true',
    'Private local live cache is explicitly opt-in; ordinary tests use fixtures.',
  );
  const access = JSON.parse(await readFile('.data/rentcast-local-access.json', 'utf8'));
  const workflow = JSON.parse(await readFile('.data/rentcast-live-workflow.json', 'utf8'));
  const login = await page.request.post('/api/auth/login', {
    headers: { origin: 'http://localhost:3040' },
    data: access,
  });
  expect(login.ok()).toBe(true);
  const before = await (await page.request.get('/api/providers/property')).json();
  let providerPosts = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().endsWith('/api/providers/property')) providerPosts++;
  });
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Properties', exact: true })
    .click();
  await page.getByRole('button', { name: 'National provider research', exact: true }).click();
  await page.getByRole('combobox', { name: /^Data environment/ }).selectOption('live');
  await page.getByLabel('Stored property evidence', { exact: true }).selectOption(workflow.subjectId);
  await expect(page.getByRole('heading', { name: 'Access and remaining requests', exact: true })).toBeVisible();
  await expect(page.locator('.provider-cma-result')).toBeVisible();
  await expect(page.getByLabel('Maximum comparable sale age (days)', { exact: true })).toHaveValue('365');
  await page.getByRole('button', { name: 'Explain saved research', exact: true }).click();
  await expect(page.locator('.provider-answer')).toContainText('Evidence retrieval');
  const exported = await page.request.get(`/api/report?cmaId=${workflow.cmaId}`);
  expect(exported.status()).toBe(200);
  expect(await exported.text()).toContain('RentCast licensed provider data');
  const after = await (await page.request.get('/api/providers/property')).json();
  expect(after.budget.globallyObservedRequests).toBe(before.budget.globallyObservedRequests);
  expect(providerPosts).toBe(0);
  const desktop = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(desktop.violations.map(value => value.id)).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const mobile = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(mobile.violations.map(value => value.id)).toEqual([]);
  await page.screenshot({ path: '.data/rentcast-live-browser-mobile.png', fullPage: true });
  await writeFile(
    'evidence/rentcast-live-browser.json',
    JSON.stringify(
      {
        at: new Date().toISOString(),
        source: 'Actual previously retrieved licensed RentCast records; no mocked data for this test',
        newProviderRequests: providerPosts,
        observedMonthlyRequests: after.budget.globallyObservedRequests,
        savedCmaRestored: true,
        explicitAgeAssumptionDays: 365,
        report: 'HTTP 200 with authorized source',
        assistant: 'deterministic evidence; no real records sent to Groq',
        accessibility: {
          desktopViolations: desktop.violations.length,
          mobileViolations: mobile.violations.length,
          overflow: false,
        },
        actualExpertReview: false,
      },
      null,
      2,
    ) + '\n',
  );
});
