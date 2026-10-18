import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Deterministic evidence mode only; live inference has its own capped evaluation.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/assistant', async route => {
    const body = route.request().postDataJSON();
    await route.continue({ postData: JSON.stringify({ ...body, mode: 'evidence' }) });
  });
});
const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: new RegExp(`^${name}`) });
async function axe(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target.join(' ')) }))).toEqual([]);
}

test('landing page runs the real engine before sign-up', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /Real estate intelligence belongs to homeowners/i })).toBeVisible();
  const slider = page.getByRole('slider', { name: 'Sample asking price' });
  const before = await slider.inputValue();
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  expect(await slider.inputValue()).not.toBe(before);
  await axe(page);
});

test('weekly agenda, listing check-ins, offer strength, pipeline, descriptions and presentation work together', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the working demo' }).click();
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Alex/ })).toBeVisible();

  const agenda = page.locator('.agenda-panel');
  await expect(agenda.getByRole('heading', { name: 'This week' })).toBeVisible();
  await expect(agenda.locator('.countdown.overdue')).toHaveCount(1);
  await agenda.getByRole('button', { name: /Walk Riley through the three offers/ }).click();
  await expect(page.getByRole('heading', { name: 'Riley — demo seller', level: 2 })).toBeVisible();

  await nav(page, 'Clients').click();
  const pipeline = page.locator('.pipeline');
  await expect(pipeline.locator('.pipeline-column').filter({ hasText: 'Lost' })).toContainText('Taylor');
  await pipeline.getByRole('button', { name: 'Role', exact: true }).click();
  await expect(pipeline.locator('.pipeline-column').filter({ hasText: 'Seller' })).toContainText('Riley');
  await pipeline.getByRole('button', { name: 'List', exact: true }).click();
  await expect(pipeline.locator('.pipeline-list .pipeline-card')).toHaveCount(7);
  await axe(page);

  await nav(page, 'Market pulse').click();
  const review = page.locator('.listing-review');
  await review.getByRole('button', { name: /114 Example Potomac Way/ }).click();
  await expect(review.locator('.option-card.recommended').filter({ hasText: 'Reposition' })).toHaveCount(1);
  await review.getByLabel('Showings', { exact: true }).fill('7');
  await review.getByLabel('Second showings').fill('3');
  await review.getByLabel('Offers', { exact: true }).fill('1');
  await review.getByLabel('Buyer feedback').fill('Strong open house; one written offer.');
  await review.getByRole('button', { name: 'Save check-in' }).click();
  await expect(page.getByText('Saved to your decision history.')).toBeVisible();
  await expect(review.locator('.option-card.recommended')).toHaveCount(1);
  await expect(review.locator('.option-card.recommended')).toContainText('Hold');
  await axe(page);

  await nav(page, 'Offer room').click();
  const board = page.locator('.strength-board');
  await expect(board.locator('.strength-row')).toHaveCount(3);
  const leader = async () =>
    (await board.locator('.strength-row').first().locator('strong').first().innerText()).trim();
  const initial = await leader();
  for (const factor of ['Financing', 'Inspection terms', 'Other contingencies', 'Earnest money', 'Closing fit'])
    await board.getByRole('slider', { name: `${factor} weight` }).fill('0');
  await board.getByRole('slider', { name: 'Net price vs. reference weight' }).fill('50');
  expect(await leader()).toBe('Demo offer C');
  expect(initial).toBe('Demo offer B');
  await board.locator('.strength-row').first().getByText('Show the math').click();
  await expect(board.locator('.math-table').first()).toContainText('× 50');
  await axe(page);

  await nav(page, 'Properties').click();
  const studio = page.locator('.description-studio');
  await studio.getByText('Write a listing description').click();
  await studio.getByLabel('Highlights (comma separated)').fill('renovated kitchen, fenced yard');
  await expect(studio.getByRole('status')).toContainText('Fair-housing check passed');
  await studio.getByLabel('Description').fill('Great home. Perfect for young professionals, no children.');
  await expect(studio.getByRole('status')).not.toContainText('passed');
  await expect(studio.getByRole('button', { name: 'Save draft for approval' })).toBeDisabled();

  await nav(page, 'Pricing studio').click();
  await expect(page.locator('.pricing-intelligence h2')).toBeVisible();
  await page.getByRole('button', { name: 'Save CMA snapshot' }).click();
  const snapshot = page.locator('.snapshot-row').last();
  const presentation = await snapshot.getByRole('link', { name: /Listing presentation/ }).getAttribute('href');
  expect(presentation).toContain('view=presentation');
  expect(presentation).toContain('commission=2.5');
  const html = await (await page.request.get(presentation!)).text();
  expect(html).toContain('<body class="presentation">');
  expect(html).toContain('How the evidence reads');

  await nav(page, 'Transactions').click();
  await expect(page.locator('.next-deadline')).toBeVisible();
  expect(errors).toEqual([]);
});
