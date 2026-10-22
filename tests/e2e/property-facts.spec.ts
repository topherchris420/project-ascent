import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const brief = (page: Page) => page.getByRole('region', { name: 'Your Home Decision Brief' });
const accessible = async (page: Page) => {
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
};

for (const { name, path, fact, permits, extra } of [
  {
    name: 'DC house',
    path: '/dc?parcel=0016____0046',
    fact: 'Structure',
    permits: true,
    extra: 'the last recorded remodel was in 2012',
  },
  {
    name: 'DC condo',
    path: '/dc/condos?parcel=0013____2001',
    fact: 'Condominium',
    permits: true,
    extra: '6 (inferred from the unit number)',
  },
  {
    name: 'Montgomery County',
    path: '/maryland?parcel=160101469306',
    fact: 'Dwelling type',
    permits: true,
    extra: 'Whether permitted work was finished and closed out',
  },
  {
    name: 'Prince George’s County',
    path: '/maryland?parcel=17010000059',
    fact: 'Assessor last reviewed the record',
    permits: false,
    extra: 'without a stated open license',
  },
])
  test(`${name}: the brief shows what the public records record, separately from what they miss`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(path);
    // The facts appear whether or not the evidence supports a value.
    await expect(page.getByTestId('studio-estimate')).toHaveText(/^(\$[\d,]+|Not stated)$/);
    const panel = brief(page);
    const recorded = panel.locator('.brief-recorded');
    await expect(recorded.getByRole('heading', { name: 'What the public records show' })).toBeVisible();
    await expect(recorded.locator('.brief-facts dt').getByText(fact, { exact: true })).toBeVisible();
    await expect(recorded.getByRole('heading', { name: 'What the records do not show' })).toBeVisible();
    await expect(recorded.getByRole('heading', { name: 'Permits on record' })).toHaveCount(permits ? 1 : 0);
    await expect(panel).toContainText(extra);
    await expect(panel).toContainText('When checked on');
    // Its status changes with the calendar, so only its presence is checked.
    await expect(panel.getByTestId('brief-freshness')).toContainText('The newest recorded sale here is');
    await expect(panel.locator('.brief-sale-notes').first()).toBeVisible();
    await accessible(page);
  });
