import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }),
  page = await context.newPage(),
  all = [];
async function inspect(name, viewport = 'desktop') {
  await page.waitForLoadState('networkidle');
  await page.screenshot({
    path: 'evidence/ascent-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + viewport + '.png',
    fullPage: true,
  });
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  all.push({
    page: name,
    viewport,
    horizontalOverflow,
    violations: result.violations.map(v => ({
      id: v.id,
      description: v.description,
      nodes: v.nodes.map(n => ({ html: n.html, target: n.target, summary: n.failureSummary })),
    })),
  });
}
try {
  await page.goto('http://localhost:3040');
  await page.getByRole('button', { name: 'Explore the working demo' }).click();
  await page.getByRole('heading', { name: /Good (morning|afternoon|evening), Alex/ }).waitFor();
  for (const name of [
    'Overview',
    'Properties',
    'Pricing studio',
    'Market pulse',
    'Clients',
    'Offer room',
    'Transactions',
    'Decision graph',
    'Outcomes lab',
    'Reports',
    'Domain intelligence',
    'Professional academy',
    'Import & portability',
    'Improvement lab',
    'AI operations',
    'National data fabric',
    'Access & verification',
    'Plans & usage',
    'Brokerage team',
    'Workspace settings',
  ]) {
    if (name === 'Import & portability') await page.getByRole('button', { name: 'WORKSPACE TOOLS' }).click();
    if (name === 'Workspace settings') await page.getByRole('button', { name, exact: true }).click();
    else
      await page
        .getByRole('navigation', { name: 'Main navigation' })
        .getByRole('button', name === 'Market pulse' ? { name: /^Market pulse/ } : { name, exact: true })
        .click();
    await inspect(name);
  }
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Properties', exact: true })
    .click();
  await page.getByRole('button', { name: 'National provider research', exact: true }).click();
  await page.getByRole('button', { name: 'Retrieve property record', exact: true }).click();
  await page.locator('.provider-record-selector option').first().waitFor({ state: 'attached' });
  await page.getByRole('button', { name: 'Find recent recorded sales', exact: true }).click();
  await page.getByRole('button', { name: 'Retrieve RentCast valuation benchmark', exact: true }).click();
  await page.getByRole('heading', { name: 'RentCast reference: $725,000' }).waitFor();
  await page
    .getByRole('checkbox', { name: 'I acknowledge condition is unknown and explicitly omit its adjustment.' })
    .check();
  await page.getByRole('button', { name: 'Calculate & preserve independent CMA', exact: true }).click();
  await page.locator('.provider-cma-result').waitFor();
  await inspect('Provider research');
  await page.setViewportSize({ width: 390, height: 844 });
  await inspect('Provider research', 'mobile');
  await writeFile('evidence/accessibility-results.json', JSON.stringify(all, null, 2));
  console.log(
    JSON.stringify(
      all.map(x => ({
        page: x.page,
        viewport: x.viewport,
        horizontalOverflow: x.horizontalOverflow,
        violations: x.violations.map(v => ({ id: v.id, count: v.nodes.length, examples: v.nodes.slice(0, 2) })),
      })),
      null,
      2,
    ),
  );
  if (all.some(x => x.violations.length || x.horizontalOverflow)) process.exitCode = 1;
} finally {
  await browser.close();
}
