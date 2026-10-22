import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const width of [1440, 390]) {
  test(`guided decision setup keeps unknowns explicit and focuses the next input at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/demo');
    const home = page.getByRole('region', { name: 'Homeowner intelligence dashboard' });
    await home.getByRole('button', { name: 'Compare Decisions', exact: true }).click();
    const setup = home.getByRole('region', { name: 'Build your comparison' });
    await setup.getByLabel('Which choice would you like to explore?').selectOption('sell');
    await expect(setup.getByRole('status')).toContainText('2 inputs to review');
    await setup.getByRole('button', { name: /Mortgage balance/ }).click();
    const payoff = home.getByLabel('Mortgage balance / payoff assumption ($)', { exact: true });
    await expect(payoff).toBeFocused();
    await expect(payoff).toHaveValue('');
    await payoff.fill('0');
    await expect(setup.getByRole('status')).toContainText('1 input to review');
    await setup.getByRole('button', { name: /Hypothetical annual cash return/ }).click();
    const cashReturn = home.getByLabel('Hypothetical annual cash return (%)', { exact: true });
    await expect(cashReturn).toBeFocused();
    await cashReturn.fill('0');
    await expect(setup.getByRole('status')).toContainText('Ready to calculate');
    await expect(setup.getByRole('status')).toContainText('1 of 6 choices');
    // Completing a sale never silently fills ownership, rental or mortgage terms.
    await expect(home.getByLabel('Monthly gross rent ($)', { exact: true })).toHaveValue('');
    await expect(home.getByLabel('Existing interest rate (%)', { exact: true })).toHaveValue('');
    await setup.getByRole('button', { name: 'Add available cash reserves' }).click();
    await expect(home.getByLabel('Available cash reserves ($)', { exact: true })).toBeFocused();
    await home.getByRole('link', { name: 'Return to your comparison' }).click();
    await expect(setup.getByRole('heading')).toBeFocused();
    const axe = await new AxeBuilder({ page })
      .include('#homeowner-workbench')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await setup.screenshot({ path: testInfo.outputPath(`decision-setup-${width}.png`) });
  });
}

test('financial validation links to its field and preserves the chosen decision after recovery', async ({ page }) => {
  await page.goto('/demo');
  const home = page.getByRole('region', { name: 'Homeowner intelligence dashboard' });
  await home.getByRole('button', { name: 'Compare Decisions', exact: true }).click();
  await home.getByRole('button', { name: 'Try illustrative financial inputs' }).click();
  await home.getByLabel('Which choice would you like to explore?').selectOption('rent');
  await home.getByText('Edit financial assumptions', { exact: true }).click();
  const rent = home.getByLabel('Monthly gross rent ($)', { exact: true });
  await rent.fill('-1');
  await expect(rent).toHaveAttribute('aria-invalid', 'true');
  await expect(home.getByRole('button', { name: 'Save home & decision snapshot' })).toBeDisabled();
  await expect(
    home.getByRole('table', { name: 'Deterministic financial comparison · amounts in dollars' }),
  ).toHaveCount(0);
  // Error recovery also works after changing panels, when the form is unmounted.
  await home.getByRole('button', { name: 'Ask Ascent', exact: true }).click();
  await home.getByRole('alert').getByRole('button', { name: 'Monthly gross rent ($)', exact: true }).click();
  await expect(rent).toBeFocused();
  await rent.fill('0');
  await expect(rent).toHaveAttribute('aria-invalid', 'false');
  await expect(home.getByRole('alert')).toHaveCount(0);
  await expect(home.getByLabel('Which choice would you like to explore?')).toHaveValue('rent');
  await expect(home.getByRole('button', { name: 'Save home & decision snapshot' })).toBeEnabled();
});

test('a sale outside the horizon requests a timing review rather than reporting readiness', async ({ page }) => {
  await page.goto('/demo');
  const home = page.getByRole('region', { name: 'Homeowner intelligence dashboard' });
  await home.getByRole('button', { name: 'Compare Decisions', exact: true }).click();
  await home.getByRole('button', { name: 'Try illustrative financial inputs' }).click();
  await home.getByLabel('Which choice would you like to explore?').selectOption('renovate');
  await home.getByText('Edit financial assumptions', { exact: true }).click();
  await home.getByLabel('Comparison horizon (months)', { exact: true }).fill('2');
  const setup = home.getByRole('region', { name: 'Build your comparison' });
  await expect(setup).not.toContainText('Ready to calculate');
  await setup.getByRole('button', { name: /Additional renovation months.*Review timing/ }).click();
  const timing = home.getByLabel('Additional renovation months', { exact: true });
  await expect(timing).toBeFocused();
  await timing.fill('2');
  await expect(setup.getByRole('status')).toContainText('Ready to calculate');
});
