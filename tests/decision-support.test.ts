import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { calculateCma, DEMO_AS_OF } from '../src/lib/analytics';
import { buildAgenda, countdownLabel, daysUntil, urgencyOf } from '../src/lib/agenda';
import { incentiveMath, monthlyPayment, reviewListing } from '../src/lib/listing-review';
import { contingencyDays, rankOffers, scoreOffer } from '../src/lib/offer-strength';
import { explainPricing } from '../src/lib/pricing-narrative';
import { createDemoWorkspace } from '../src/lib/seed';
import { register } from '../src/lib/auth';
import { closeDatabase, getWorkspace } from '../src/lib/db';
import { executeAction } from '../src/lib/service';
import { getFabricSnapshot } from '../src/lib/fabric-service';
import type { ListingCheckIn, Offer } from '../src/lib/types';
process.env.SQLITE_PATH = resolve('.data', `decision-support-${randomUUID()}.sqlite`);
delete process.env.DATABASE_URL;
after(closeDatabase);
const owner = () =>
  register({
    seed: 'demo',
    name: 'Decision support test',
    email: `${randomUUID()}@example.test`,
    password: 'decision support private passphrase 123',
  });
const demo = createDemoWorkspace();
const offer = (overrides: Partial<Offer>): Offer => ({
  id: randomUUID(),
  propertyId: 'property-01',
  buyer: 'Test buyer',
  price: 750000,
  sellerCredit: 0,
  financing: 'conventional',
  downPercent: 20,
  earnestMoney: 15000,
  contingencies: ['Inspection: 7 days'],
  closeDate: '2026-11-20T12:00:00.000Z',
  expiresAt: '2026-10-20T23:59:00.000Z',
  status: 'received',
  ...overrides,
});

test('offer strength shows every factor, its formula and the weighted arithmetic', () => {
  const strength = scoreOffer(offer({}), { estimate: 750000 });
  assert.equal(strength.factors.length, 6);
  for (const factor of strength.factors) {
    assert.ok(factor.score >= 0 && factor.score <= 100, factor.key);
    assert.ok(factor.formula.length > 10 && factor.rationale.length > 10, factor.key);
  }
  const weighted = strength.factors.reduce((sum, factor) => sum + factor.score * factor.weight, 0);
  const totalWeight = strength.factors.reduce((sum, factor) => sum + factor.weight, 0);
  assert.equal(strength.score, Math.round(weighted / totalWeight));
  assert.equal(strength.reference.kind, 'estimate');
});

test('cash, short inspection and a home-sale contingency move the right factors', () => {
  const cash = scoreOffer(offer({ financing: 'cash', downPercent: 100, contingencies: ['Inspection: 3 days'] }));
  const contingent = scoreOffer(
    offer({
      financing: 'fha',
      downPercent: 3.5,
      contingencies: ['Inspection: 10 days', 'Appraisal', 'Sale of existing home'],
    }),
  );
  const factor = (strength: ReturnType<typeof scoreOffer>, key: string) =>
    strength.factors.find(item => item.key === key)!.score;
  assert.equal(factor(cash, 'financing'), 100);
  assert.ok(factor(cash, 'inspection') > factor(contingent, 'inspection'));
  assert.ok(factor(contingent, 'contingencies') <= 45);
  assert.ok(cash.score > contingent.score);
});

test('re-weighting to the client priorities can change the ranking', () => {
  const highPrice = offer({
    id: 'high',
    price: 790000,
    financing: 'fha',
    downPercent: 3.5,
    contingencies: ['Inspection: 10 days', 'Appraisal', 'Sale of existing home'],
  });
  const cleanCash = offer({ id: 'cash', price: 745000, financing: 'cash', downPercent: 100, contingencies: [] });
  const byPrice = rankOffers([highPrice, cleanCash], {
    estimate: 750000,
    weights: { price: 100, financing: 0, inspection: 0, contingencies: 0, earnest: 0, closing: 0 },
  });
  const byCertainty = rankOffers([highPrice, cleanCash], {
    estimate: 750000,
    weights: { price: 10, financing: 40, inspection: 10, contingencies: 40, earnest: 0, closing: 0 },
  });
  assert.equal(byPrice[0].offerId, 'high');
  assert.equal(byCertainty[0].offerId, 'cash');
});

test('without an estimate, price is scored against the best competing net and expiry is flagged', () => {
  const low = offer({ price: 700000, expiresAt: '2026-10-01T00:00:00.000Z' });
  const strength = scoreOffer(low, { competing: [offer({ price: 760000 })] });
  assert.equal(strength.reference.kind, 'best-offer');
  assert.equal(strength.reference.value, 760000);
  assert.ok(strength.notes.some(note => /expired/i.test(note)));
});

test('contingency lengths parse stated days and distinguish absent from unstated', () => {
  assert.equal(contingencyDays(['Inspection: 7 days after effective date'], /inspect/i), 7);
  assert.equal(contingencyDays(['Financing approval: 21 business days'], /financ/i), 21);
  assert.equal(contingencyDays(['Appraisal'], /inspect/i), null);
  assert.ok(Number.isNaN(contingencyDays(['Inspection'], /inspect/i)));
});

test('mortgage arithmetic matches the standard amortization formula', () => {
  assert.equal(Math.round(monthlyPayment(400000, 6.5) * 100) / 100, 2528.27);
  assert.equal(monthlyPayment(360000, 0), 1000);
  const math = incentiveMath(750000, 7500, 6.5);
  assert.ok(math.monthlySavingFromBuydown > math.monthlySavingFromReduction);
  assert.equal(math.paymentAtList - math.paymentAfterReduction, math.monthlySavingFromReduction);
});

const listing = { ...demo.properties[0], status: 'active' as const, dom: 70, listedAt: '2026-08-06T12:00:00.000Z' };
const week = (
  weekOf: string,
  showings: number,
  secondShowings: number,
  offers: number,
  feedback = '',
): ListingCheckIn => ({
  id: randomUUID(),
  propertyId: listing.id,
  weekOf: `${weekOf}T12:00:00.000Z`,
  showings,
  secondShowings,
  offers,
  feedback,
  createdAt: `${weekOf}T12:00:00.000Z`,
});

test('a late listing with falling traffic and price feedback recommends repositioning', () => {
  const review = reviewListing(
    listing,
    [
      week('2026-09-28', 4, 0, 0, 'Price is high for the condition.'),
      week('2026-10-05', 2, 0, 0, 'Too expensive versus recent sales.'),
      week('2026-10-12', 1, 0, 0, 'Overpriced.'),
    ],
    { asOf: DEMO_AS_OF },
  );
  assert.equal(review.phase, 'extended');
  assert.ok(review.signals.some(signal => signal.title === 'Low showing traffic'));
  assert.equal(review.themes[0].theme, 'Price');
  assert.equal(review.options.find(option => option.recommended)?.action, 'reposition');
  assert.equal(review.nextCheckInDue, '2026-10-19');
});

test('recorded offers keep the recommendation on hold, and no check-ins asks for the first one', () => {
  const healthy = reviewListing(listing, [week('2026-10-05', 6, 2, 0), week('2026-10-12', 6, 3, 2)], {
    asOf: DEMO_AS_OF,
  });
  assert.equal(healthy.options.find(option => option.recommended)?.action, 'hold');
  assert.ok(healthy.signals.some(signal => signal.tone === 'positive'));
  const empty = reviewListing(listing, [], { asOf: DEMO_AS_OF });
  assert.equal(empty.signals[0].title, 'No check-ins yet');
  assert.equal(empty.weeks, 0);
});

test('second showings without offers suggest a buyer incentive with its payment arithmetic', () => {
  const review = reviewListing(
    { ...listing, dom: 20, listedAt: '2026-09-25T12:00:00.000Z' },
    [week('2026-10-05', 5, 2, 0), week('2026-10-12', 5, 2, 0)],
    { asOf: DEMO_AS_OF },
  );
  assert.equal(review.options.find(option => option.recommended)?.action, 'incentive');
  assert.ok(review.incentive.amount > 0);
});

test('pricing narration restates computed evidence for in-range and above-range prices', () => {
  const subject = demo.properties.find(property => property.id === 'property-01')!;
  const cma = calculateCma(subject, demo.properties, undefined, DEMO_AS_OF);
  const lookup = (id: string) => demo.properties.find(property => property.id === id);
  const inside = explainPricing(cma, cma.strategies.moderate, demo.properties, lookup);
  assert.equal(inside.position, 'moderate');
  assert.match(inside.points[0], new RegExp(`of ${cma.comps.length} adjusted comparable`));
  const above = explainPricing(cma, cma.high + 50000, demo.properties, lookup);
  assert.equal(above.position, 'above-range');
  assert.equal(above.tone, 'review');
  assert.match(above.headline, /above every adjusted comparable/);
});

test('agenda collects overdue and upcoming work across the workspace in date order', () => {
  const workspace = structuredClone(demo);
  workspace.clients[0].followUps = [
    { id: 'late', title: 'Overdue call', dueAt: '2026-10-10', status: 'pending', createdAt: '2026-10-01' },
    { id: 'done', title: 'Finished', dueAt: '2026-10-16', status: 'complete', createdAt: '2026-10-01' },
  ];
  const agenda = buildAgenda(workspace, DEMO_AS_OF);
  assert.equal(agenda[0].id, 'follow-up:late');
  assert.equal(agenda[0].urgency, 'overdue');
  assert.ok(!agenda.some(item => item.id === 'follow-up:done'));
  assert.ok(agenda.some(item => item.kind === 'offer-expiry'));
  assert.ok(agenda.some(item => item.kind === 'check-in'));
  assert.ok(agenda.every((item, index) => !index || Date.parse(agenda[index - 1].dueAt) <= Date.parse(item.dueAt)));
  assert.equal(daysUntil('2026-10-15T23:00:00.000Z', DEMO_AS_OF), 0);
  assert.equal(urgencyOf(3), 'urgent');
  assert.equal(urgencyOf(6), 'soon');
  assert.equal(countdownLabel(-2), '2 days overdue');
  assert.equal(countdownLabel(1), 'Due tomorrow');
});

test('weekly check-ins validate counts, upsert by week, require active listings and screen feedback', async () => {
  const { user } = await owner();
  const base = {
    type: 'recordCheckIn',
    propertyId: 'property-01',
    weekOf: '2026-10-19',
    showings: 3,
    secondShowings: 1,
    offers: 0,
  };
  await assert.rejects(executeAction(user, { ...base, secondShowings: 4, feedback: '' }));
  const first = await executeAction(user, { ...base, feedback: 'Buyers liked the yard.' });
  const second = await executeAction(user, { ...base, showings: 5, feedback: 'Updated count.' });
  const records = second.workspace.listingCheckIns!.filter(item => item.weekOf.startsWith('2026-10-19'));
  assert.equal(records.length, 1);
  assert.equal(records[0].showings, 5);
  assert.deepEqual((first.result as { updated: boolean }).updated, false);
  await assert.rejects(executeAction(user, { ...base, propertyId: 'property-02', feedback: '' }), /active listings/);
  await assert.rejects(
    executeAction(user, { ...base, feedback: 'Seller prefers no families with children.' }),
    (error: Error) => /fair|hous|review|protected/i.test(error.message),
  );
});

test('clients keep phone, role and the lost stage, and reject malformed phones', async () => {
  const { user } = await owner();
  const saved = await executeAction(user, {
    type: 'saveClient',
    name: 'Phone test',
    email: 'phone@example.test',
    phone: '(555) 010-0199',
    role: 'investor',
    stage: 'lost',
    budget: 500000,
    preferences: 'Objective criteria only.',
  });
  const client = saved.workspace.clients.find(item => item.name === 'Phone test')!;
  assert.equal(client.phone, '(555) 010-0199');
  assert.equal(client.role, 'investor');
  assert.equal(client.stage, 'lost');
  await assert.rejects(
    executeAction(user, {
      type: 'saveClient',
      name: 'Bad',
      email: 'bad@example.test',
      phone: 'call me maybe',
      stage: 'lead',
      budget: 1,
      preferences: '',
    }),
  );
});

test('the default DMV region opens with fictional offers, a transaction and check-ins, seeded exactly once', async () => {
  const { user } = await owner();
  const first = await getFabricSnapshot(user);
  const listingId = first.workspace.properties.find(property => property.address === '100 Example Potomac Way')!.id;
  assert.equal(first.workspace.offers.filter(item => item.propertyId === listingId).length, 3);
  assert.ok(first.workspace.transactions.some(item => item.id === 'transaction-dmv-01'));
  assert.ok((first.workspace.listingCheckIns ?? []).some(item => item.propertyId === listingId));
  assert.ok(first.workspace.clients.some(item => item.stage === 'lost'));
  await getFabricSnapshot(user);
  const stored = await getWorkspace(user.tenantId);
  assert.equal(stored.clients.filter(item => item.id === 'client-dmv-01').length, 1);
  assert.equal(stored.offers.filter(item => item.id.startsWith('offer-dmv')).length, 3);
});

test('the assistant lists the week, drafts with placeholders and ranks offers from workspace evidence', async () => {
  const { answerFromEvidence } = await import('../src/lib/assistant');
  const workspace = createDemoWorkspace();
  const agenda = answerFromEvidence(workspace, 'What is due this week?');
  assert.ok(agenda.tools.includes('weekly-agenda'));
  assert.match(agenda.answer, /Due in the next seven days/);
  assert.match(agenda.answer, /Due tomorrow|days left|overdue|Due today/);

  const context = { page: 'clients', clientId: 'client-01', propertyId: 'property-01', cmaId: 'cma-01' };
  const email = answerFromEvidence(workspace, 'Draft an email to my seller about pricing', context);
  assert.ok(email.tools.includes('placeholder-draft'));
  assert.match(email.answer, /\{client_first_name\}/);
  assert.match(email.answer, /\{property_address\}/);
  assert.match(email.answer, /Subject:/);
  const draft = email.answer.slice(email.answer.indexOf('Email draft'));
  assert.ok(!draft.includes('avery@example.com') && !draft.includes('Avery'), 'draft leaks no client identity');

  const text = answerFromEvidence(workspace, 'Write a quick text to the client', context);
  assert.match(text.answer, /Text draft for your review/);
  assert.ok(!answerFromEvidence(workspace, 'What context do we have?', context).tools.includes('placeholder-draft'));

  const summary = answerFromEvidence(workspace, 'Summarize the CMA for tomorrow’s seller meeting', {
    page: 'cma',
    propertyId: 'property-01',
    cmaId: 'cma-01',
  });
  assert.ok(summary.tools.includes('seller-meeting-summary'));
  assert.match(summary.answer, /Conservative \$/);

  const offers = answerFromEvidence(workspace, 'Compare the offers', { page: 'offers', propertyId: 'property-01' });
  assert.ok(offers.tools.includes('offer-term-strength'));
  assert.match(offers.answer, /Demo offer [ABC] \d+ \((Strong|Competitive|Moderate|Weak)\)/);

  const listing = answerFromEvidence(workspace, 'How are showings going?', {
    page: 'market',
    propertyId: 'property-01',
  });
  assert.ok(listing.tools.includes('listing-review'));
  assert.match(listing.answer, /weekly check-ins/);
});

test('client report leads with positions, shows waterfalls and excluded sales by address, and honors seller costs', async () => {
  const { renderCmaReport } = await import('../src/lib/report-html');
  const workspace = createDemoWorkspace();
  const record = workspace.cmas.find(item => item.id === 'cma-01')!;
  const base = {
    record,
    property: record.result.inputSnapshot!.subject,
    organization: 'Test <Brokerage>',
    preparedBy: 'Agent',
    synthetic: true,
    sources: workspace.sources,
    candidates: record.result.inputSnapshot!.candidates,
    payoff: 0,
    presentation: false,
    generatedAt: DEMO_AS_OF,
  };
  const html = renderCmaReport({ ...base, costs: {} });
  assert.ok(html.includes('Test &lt;Brokerage&gt;'), 'organization is escaped');
  assert.ok(html.indexOf('Conservative') < html.indexOf('Comparable sales, adjustment by adjustment'));
  assert.match(html, /How the evidence reads/);
  assert.match(html, /Commission \(2\.5%, negotiable\)/, 'omitted costs fall back to defaults');
  assert.ok(html.includes(record.result.calculationHash));
  assert.ok(html.includes('FICTIONAL DEMONSTRATION DATA'));
  for (const excluded of record.result.excluded) {
    const sale = record.result.inputSnapshot!.candidates.find(item => item.id === excluded.propertyId);
    if (sale?.status === 'sold') assert.ok(html.includes(sale.address), `${sale.address} is listed as set aside`);
  }
  const withCosts = renderCmaReport({ ...base, costs: { commissionPercent: 2, closingPercent: 0.5 }, payoff: 300000 });
  assert.match(withCosts, /Commission \(2%, negotiable\)/);
  assert.match(withCosts, /Mortgage payoff \(entered\)/);
  assert.match(renderCmaReport({ ...base, costs: {}, presentation: true }), /<body class="presentation">/);
});

test('listing descriptions describe the property, pass the advertising check and save only as reviewable drafts', async () => {
  const { composeListingDescription } = await import('../src/lib/listing-description');
  const { inspectFairHousing } = await import('../src/lib/fair-housing');
  const subject = demo.properties[0];
  for (const tone of ['warm', 'concise', 'refined'] as const) {
    const text = composeListingDescription(subject, ['renovated kitchen', 'fenced yard'], tone);
    assert.ok(text.includes(subject.address) && /renovated kitchen/i.test(text), tone);
    assert.equal(inspectFairHousing(text, { surface: 'advertising' }).decision, 'allow', tone);
  }
  const { user } = await owner();
  const saved = await executeAction(user, {
    type: 'draftListingDescription',
    propertyId: 'property-01',
    text: composeListingDescription(subject, ['two-car garage']),
  });
  const draft = saved.workspace.approvals[0];
  assert.equal(draft.kind, 'communication');
  assert.equal(draft.status, 'draft');
  assert.match(draft.draft, /LISTING DESCRIPTION DRAFT/);
  await assert.rejects(
    executeAction(user, {
      type: 'draftListingDescription',
      propertyId: 'property-01',
      text: 'Perfect for young professionals, no children please.',
    }),
  );
});
