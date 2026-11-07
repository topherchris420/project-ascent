import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const DC_CONDOS = '/sales?q=2+bed+condos+in+20009+under+%24700k+in+the+last+6+months';
const MD_HOUSES = '/sales?q=Houses+in+Silver+Spring+between+%24500k+and+%24750k';

const salesTable = (page: Page) =>
  page.getByRole('table').filter({ has: page.getByRole('columnheader', { name: 'Living area', exact: true }) });
const accessible = async (page: Page) => {
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
};

for (const width of [390, 320]) {
  test(`on a ${width}px phone every sale shows its price without scrolling sideways`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(MD_HOUSES);
    const table = salesTable(page);
    const first = table.getByRole('row').nth(1);
    await first.scrollIntoViewIfNeeded();
    // Rendered text (innerText) is what a reader sees: each cell carries a desktop and a phone wording, one hidden.
    // The row keeps its table semantics while it is laid out as a card.
    await expect(first.getByRole('rowheader')).toContainText('Silver Spring, MD');
    const cells = first.getByRole('cell');
    await expect(cells).toHaveCount(5);
    await expect(cells.nth(1)).toHaveText(/^\$\d{3},\d{3}$/, { useInnerText: true });
    await expect(cells.nth(1)).toBeInViewport({ ratio: 1 });
    await expect(cells.nth(0)).toHaveText(/^Sold \w{3} \d{1,2}, \d{4}$/, { useInnerText: true });
    // Maryland records carry no room count; the phone layout names the gap instead of a bare "Not recorded".
    await expect(cells.nth(2)).toHaveText('No room count', { useInnerText: true });
    await expect(cells.nth(4)).toHaveText(/^\$\d+\/sq ft$/, { useInnerText: true });
    const sideways = await page.locator('.sales-table-wrap').evaluate(el => el.scrollWidth - el.clientWidth);
    expect(sideways).toBeLessThanOrEqual(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await accessible(page);
  });
}

test('on a desktop the sales stay a six-column table under their headings', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(DC_CONDOS);
  const table = salesTable(page);
  for (const heading of ['Home', 'Sold', 'Price', 'Rooms', 'Living area', '$/sq ft'])
    await expect(table.getByRole('columnheader', { name: heading, exact: true })).toBeVisible();
  const first = table.getByRole('row').nth(1);
  // No phone-only labels leak into the columns.
  await expect(first.getByRole('cell').nth(0)).toHaveText(/^\w{3} \d{1,2}, \d{4}$/, { useInnerText: true });
  await expect(first.getByRole('cell').nth(4)).toHaveText(/^\$\d+$/, { useInnerText: true });
  await page.goto(MD_HOUSES);
  await expect(salesTable(page).getByRole('row').nth(1).getByRole('cell').nth(2)).toHaveText('Not recorded', {
    useInnerText: true,
  });
  await accessible(page);
});
