import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * The Homeowner OS in a browser. Live public sources are replaced with fixtures marked E2E FIXTURE, so no test
 * reaches a District or Maryland server; rooms and invitations run end to end against the isolated SQLite database.
 */
const PARCEL = '3313____0047';
const OS = `/home/dc/${PARCEL}`;
const ORIGIN = { origin: 'http://localhost:3040' };
type Fixture = { permitStatus?: string; permitsFail?: boolean };
const source = (sourceId: string, name: string, status: string, checkedAt: string, errors: string[] = []) => ({
  sourceId,
  name: `${name} (E2E FIXTURE)`,
  status,
  cached: false,
  checkedAt,
  publishedAt: null,
  observations: 0,
  invalid: 0,
  conflicts: 0,
  errors,
  contentSha256: 'e2e-fixture',
  attribution: 'E2E FIXTURE, not a public record',
});
/**
 * The development server compiles a route the first time it is called, and each compile reloads every open page,
 * which can cancel a request mid-flow. Compiling the room routes before any page is open keeps the flow below honest.
 */
async function warmRoomRoutes(request: APIRequestContext) {
  const id = '00000000-0000-4000-8000-000000000000';
  const nested = [
    'grants',
    `grants/${id}`,
    'sections/milestones',
    'documents',
    `documents/${id}`,
    'stage',
    'notes',
    'audit',
  ];
  for (const path of [
    '/api/rooms',
    '/api/rooms/accept',
    `/api/rooms/${id}`,
    ...nested.map(part => `/api/rooms/${id}/${part}`),
    '/home/room',
  ]) {
    expect((await request.get(path)).status(), path).toBeLessThan(500);
  }
}
async function mockSources(page: Page, fixture: () => Fixture) {
  await page.route('**/api/property/sources?**', async route => {
    const { permitStatus = 'Issued', permitsFail = false } = fixture();
    const checkedAt = new Date().toISOString();
    await route.fulfill({
      json: {
        checkedAt,
        sources: [
          source('dc-property-sales', 'DC property sales', 'complete', checkedAt),
          source(
            'dc-building-permits',
            'DC building permits',
            permitsFail ? 'failed' : 'complete',
            checkedAt,
            permitsFail ? ['E2E FIXTURE outage'] : [],
          ),
        ],
        observations: permitsFail
          ? []
          : [
              {
                sourceId: 'dc-building-permits',
                kind: 'permit',
                parcelId: PARCEL,
                identity: 'E2E-FIXTURE-PERMIT-1',
                values: {
                  work: 'E2E FIXTURE deck repair',
                  status: permitStatus.toLowerCase(),
                  statusLabel: permitStatus,
                },
                dates: {
                  transaction: null,
                  recorded: null,
                  effective: '2026-10-10',
                  published: null,
                  observed: checkedAt,
                },
                fingerprint: `e2e-${permitStatus}`,
              },
            ],
        policy: 'E2E FIXTURE',
      },
    });
  });
  await page.route('**/api/property/nearby?**', route =>
    route.fulfill({
      json: {
        radiusMiles: 0.5,
        after: '2026-09-30',
        source: source('dc-property-sales', 'DC property sales', 'complete', new Date().toISOString()),
        sales: [],
        policy: 'E2E FIXTURE',
      },
    }),
  );
}
async function expectAccessible(page: Page) {
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
}
/** Moves the watch's last check back past the minimum interval, as if the homeowner returned the next day. */
async function ageWatch(page: Page, hours: number) {
  await page.evaluate(hours => {
    const state = JSON.parse(localStorage.getItem('ascent.watchtower.v1')!);
    const earlier = (iso: string | null) => (iso ? new Date(Date.parse(iso) - hours * 3_600_000).toISOString() : iso);
    for (const watch of state.watches) {
      watch.lastCheckAt = earlier(watch.lastCheckAt);
      watch.lastSuccessfulCheckAt = earlier(watch.lastSuccessfulCheckAt);
    }
    localStorage.setItem('ascent.watchtower.v1', JSON.stringify(state));
  }, hours);
}

// On a cold development server the first visit compiles this page and loads each market's snapshot (462,347 homes
// in Maryland), which can outlast any one assertion. Pay that once, before the tests, rather than inside them.
test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  const context = await browser.newContext();
  const paths = [OS, `/api/dc/property?parcel=${PARCEL}`, '/api/maryland/property?parcel=17020094110'];
  for (const path of paths) expect((await context.request.get(path, { timeout: 120_000 })).status(), path).toBe(200);
  await context.close();
});

test('the six areas share one home and work on a phone with keyboard and screen reader semantics', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await mockSources(page, () => ({}));
  await page.goto(OS);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/NW/);
  await expect(page.getByTestId('os-verdict')).toBeVisible();
  for (const title of ['What we know', 'How we know it', 'What is missing', 'What to do next'])
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(6);
  await expectAccessible(page);

  await page.getByRole('tab', { name: 'My Property' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Market Watch' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Market Watch' })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/tab=market/);
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Share With My Agent' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('mls-status')).toContainText('Disabled: no MLS agreement is on file');
  await expectAccessible(page);

  await page.getByRole('tab', { name: 'My Property' }).click();
  await page.getByTestId('check-records').click();
  await expect(page.getByText(/Checked .*\./).first()).toBeVisible();
  await expect(page.getByText('E2E FIXTURE deck repair').first()).toBeVisible();
  // A live record never moves the estimate.
  const verdict = await page.getByTestId('os-verdict').textContent();
  await page.getByTestId('check-records').click();
  await expect(page.getByTestId('os-verdict')).toHaveText(verdict!);

  await page.getByRole('button', { name: 'What is missing?' }).click();
  await expect(page.getByTestId('os-answer')).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test('a watch records a baseline, reports a changed record once and shows an outage without inventing a change', async ({
  page,
}) => {
  let fixture: Fixture = {};
  await mockSources(page, () => fixture);
  await page.goto(`${OS}?tab=market`);
  await page.getByTestId('start-watch').click();
  await expect(page.getByTestId('watch-status')).toContainText('Last successful check');
  await expect(page.getByText(/Nothing has changed since the first check/)).toBeVisible();
  await expectAccessible(page);

  fixture = { permitStatus: 'Finaled' };
  await ageWatch(page, 13);
  await page.reload();
  const notifications = page.getByTestId('notifications');
  await expect(notifications.getByText('Changed record')).toBeVisible();
  await expect(notifications).toContainText('not a change to your estimate');
  await expect(page.getByRole('tab', { name: /Market Watch/ }).locator('.os-badge')).toHaveText('1');

  // Opening the page again inside the interval does not check or notify again.
  await page.reload();
  await expect(notifications.locator('li')).toHaveCount(1);

  fixture = { permitsFail: true };
  await ageWatch(page, 13);
  await page.reload();
  await expect(notifications.getByText('Source unavailable')).toBeVisible();
  await expect(notifications.getByText('No longer listed')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mark all as read' }).click();
  await expect(page.getByRole('tab', { name: /Market Watch/ }).locator('.os-badge')).toHaveCount(0);
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByTestId('watch-status')).toContainText('Paused');
});

test('Compare Offers works out what a seller keeps, prints a brief and never ranks the offers', async ({ page }) => {
  await mockSources(page, () => ({}));
  await page.goto(`${OS}?tab=offers`);
  const cards = page.getByTestId('offer-card');
  await page.getByTestId('add-offer').click();
  await page.getByTestId('add-offer').click();
  await expect(cards).toHaveCount(2);
  await cards.nth(0).getByLabel('Offered price ($)').fill('700000');
  await cards.nth(1).getByLabel('Offered price ($)').fill('690000');
  await cards.nth(1).getByLabel('Financing', { exact: true }).selectOption('cash');
  await page.getByLabel('Mortgage payoff ($)').fill('300000');
  const explanation = page.getByTestId('offer-explanation');
  await expect(explanation).toBeVisible();
  await expect(page.locator('.os-compare')).toContainText('$700,000');
  await expect(page.locator('#os-panel-offers')).not.toContainText(/best offer|recommend|stronger|probabilit/i);
  await expectAccessible(page);
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Printable comparison brief' }).click();
  const brief = await popup;
  await expect(brief.getByRole('heading', { name: 'Offer Comparison Brief' })).toBeVisible();
  await brief.close();
  await page.reload();
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0).getByLabel('Offered price ($)')).toHaveValue('700000');
});

test('a Transaction Room is owner-controlled: least-privilege invitations, no downloads and revocation', async ({
  page,
  browser,
}) => {
  const stamp = Date.now();
  const owner = { name: 'Room Owner', email: `room-owner-${stamp}@example.test`, password: 'room owner password 1234' };
  const guest = { name: 'Room Agent', email: `room-agent-${stamp}@example.test`, password: 'room agent password 1234' };
  // Two accounts, two browsers and a dozen routes: more than the default minute on a cold development server.
  test.slow();
  await warmRoomRoutes(page.request);
  await mockSources(page, () => ({}));
  expect((await page.request.post('/api/auth/register', { headers: ORIGIN, data: owner })).status()).toBe(200);
  await page.goto(`${OS}?tab=room`);
  await page.getByTestId('open-room').click();
  const roomView = page.getByTestId('room-view');
  await expect(roomView).toBeVisible();
  const milestones = roomView.locator('details').filter({ has: page.locator('summary', { hasText: /^Milestones/ }) });
  await milestones.getByRole('button', { name: 'Add' }).click();
  await milestones.getByRole('textbox', { name: 'Milestone', exact: true }).fill('Listing photos');
  await milestones.getByRole('button', { name: 'Save changes' }).click();
  await expect(milestones.getByRole('button', { name: 'Saved' })).toBeVisible();
  await roomView.locator('input[type=file]').setInputFiles({
    name: 'payoff-statement.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('E2E FIXTURE payoff statement, not a real document.'),
  });
  await roomView.getByLabel('File it under').selectOption('financing');
  await roomView.getByRole('button', { name: 'Upload' }).click();
  await expect(page.getByTestId('room-documents')).toContainText('payoff-statement.txt');
  await roomView.getByLabel('Keep new documents for').selectOption('90');
  await expect(roomView.getByText('Retention updated for documents uploaded from now on.')).toBeVisible();
  await expect(roomView.getByLabel('Keep new documents for')).toHaveValue('90');
  await expectAccessible(page);

  await page.getByRole('tab', { name: 'Share With My Agent' }).click();
  const form = page.getByTestId('invite-form');
  await form.getByLabel(/Their email/).fill(guest.email);
  await form.getByRole('button', { name: 'Create private link' }).click();
  const link = await page.getByTestId('invite-link').getByLabel('Private link (shown once)').inputValue();
  expect(link).toMatch(/\/home\/room#invite=room\./);
  await expect(page.getByTestId('grants')).toContainText('invited');

  const agent = await browser.newContext();
  const agentPage = await agent.newPage();
  expect((await agentPage.request.post('/api/auth/register', { headers: ORIGIN, data: guest })).status()).toBe(200);
  await agentPage.goto(link);
  await expect(agentPage).toHaveURL(/\/home\/room$/);
  await agentPage.getByTestId('accept-invite').getByRole('button').click();
  const shared = agentPage.getByTestId('room-view');
  await expect(shared).toContainText('Listing photos');
  await expect(shared).not.toContainText('payoff-statement.txt');
  await expect(shared.locator('summary', { hasText: 'Documents' })).toHaveCount(0);
  await expect(shared.getByRole('button', { name: 'Save changes' })).toHaveCount(0);

  const rooms = await (await page.request.get('/api/rooms')).json();
  const roomId = rooms.owned[0].id;
  const room = await (await page.request.get(`/api/rooms/${roomId}`)).json();
  const documentId = room.documents[0].id;
  expect((await agentPage.request.get(`/api/rooms/${roomId}/documents/${documentId}`)).status()).toBe(404);
  expect(
    (
      await agentPage.request.put(`/api/rooms/${roomId}/sections/milestones`, {
        headers: ORIGIN,
        data: { version: room.version, items: [] },
      })
    ).status(),
  ).toBe(403);

  await page.getByTestId('grants').getByRole('button', { name: 'Revoke' }).click();
  await expect(page.getByTestId('grants')).toContainText('revoked');
  expect((await agentPage.request.get(`/api/rooms/${roomId}`)).status()).toBe(404);
  const audit = await (await page.request.get(`/api/rooms/${roomId}/audit`)).json();
  expect(audit.verified).toBe(true);
  expect(audit.entries.map((entry: { action: string }) => entry.action)).toEqual(
    expect.arrayContaining(['room.grant-created', 'room.grant-accepted', 'room.viewed', 'room.grant-revoked']),
  );
  await agent.close();
});

test('a Maryland home shows the disabled Prince George’s permit source as a gap, and uncovered markets do not open', async ({
  page,
}) => {
  await mockSources(page, () => ({}));
  await page.goto('/home/maryland/17020094110');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByText(/What this timeline cannot show/).click();
  await expect(page.locator('.os-gaps')).toContainText(/Prince George/);
  await expectAccessible(page);
  for (const path of [
    '/home/virginia/123456789012',
    '/home/dc/not%20a%20parcel',
    '/home/maryland/12AB',
    '/home/dc/%E0%A4%A',
  ]) {
    const response = await page.goto(path);
    expect(response!.status(), path).toBe(404);
    await expect(page.getByRole('heading', { name: 'This page isn’t here.' })).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(0);
  }
  expect((await page.goto(`/home/dc/${PARCEL}`, { waitUntil: 'commit' }))!.status()).toBe(200);
  expect((await page.goto('/home/room', { waitUntil: 'commit' }))!.status()).toBe(200);
});
