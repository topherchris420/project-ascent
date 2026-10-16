import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFile } from 'node:fs/promises';

// Run against an optimized local server without production account configuration.
const origin = process.env.HOBBY_SMOKE_ORIGIN || 'http://localhost:3041';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const apiRequests = [],
    pageErrors = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(new URL(request.url()).pathname);
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  const response = await page.goto(origin);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('status').filter({ hasText: 'Workspace setup is in progress.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Explore the working demo', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled();
  const slider = page.getByRole('slider', { name: 'Sample asking price' });
  const before = await slider.inputValue();
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  expect(await slider.inputValue()).not.toBe(before);
  const checks = [];
  for (const [viewport, width, height] of [
    ['desktop', 1280, 900],
    ['mobile', 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    const violations = axe.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) }));
    checks.push({ viewport, violations, horizontalOverflow: overflow });
    expect(violations).toEqual([]);
    expect(overflow).toBe(false);
    await page.screenshot({ path: `evidence/ascent-hobby-setup-${viewport}.png`, fullPage: true });
  }
  expect(apiRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
  const result = {
    at: new Date().toISOString(),
    environment: 'Local optimized Next.js server without production account configuration',
    homeStatus: response.status(),
    setupMessageVisible: true,
    accountActionsDisabled: true,
    pricingExampleInteractive: true,
    browserApiRequests: apiRequests.length,
    checks,
    pageErrors,
    liveVercelDeployment: false,
    productionDatabaseVerified: false,
    scope: 'Public setup experience only; no accounts, database, property or inference calls',
  };
  await writeFile('evidence/hobby-setup-acceptance.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
