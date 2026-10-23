import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateStudio, defaultDemoState, sampleEvidence } from '../src/lib/demo-studio';
import { agentPacket, DEFAULT_PACKET_PARTS, packetPartLabels, packetParts } from '../src/lib/agent-packet';
import { buildOsBrief } from '../src/lib/homeowner-os';
import { agentPacketHtml, offerComparisonHtml, osBriefHtml } from '../src/lib/os-reports';
import { input, usd, withSales } from './os-fixtures';

const CREATED = '2026-10-22T12:00:00.000Z';
function packet(state = defaultDemoState, include = DEFAULT_PACKET_PARTS) {
  const value = input(state);
  const os = buildOsBrief(value);
  return agentPacket({
    os,
    brief: value.brief,
    timeline: value.timeline,
    lab: value.lab,
    offers: value.offers,
    room: value.room,
    include,
    createdAt: CREATED,
  });
}
const OFFER_FIGURES = ['700000', '690000', '720000', usd(700000), usd(690000), usd(720000)];

test('by default the packet holds only public research: no offer terms, finances or transaction', () => {
  assert.deepEqual(
    packetParts.filter(part => packetPartLabels[part].private),
    ['offers', 'finance', 'transaction'],
  );
  assert.ok(DEFAULT_PACKET_PARTS.every(part => !packetPartLabels[part].private));
  const result = packet();
  assert.equal(result.offers, null);
  assert.equal(result.finance, null);
  assert.equal(result.transaction, null);
  const text = JSON.stringify(result);
  for (const figure of OFFER_FIGURES) assert.ok(!text.includes(figure), `${figure} must not leave without consent`);
  // The escalation-clause question cites an offer, so it is dropped with the offers.
  assert.ok(!result.questions!.some(item => /escalation|waives/.test(item)));
  assert.ok(result.excluded.includes(packetPartLabels.offers.label));
  assert.match(result.preparedBy, /did not send this packet/);
});

test('each private part is included only when chosen, and one does not carry another', () => {
  const offers = packet(defaultDemoState, [...DEFAULT_PACKET_PARTS, 'offers']);
  assert.equal(offers.offers!.lab.offers[0].price, 700000);
  assert.equal(offers.finance, null);
  assert.ok(offers.questions!.some(item => /escalation clause up to \$720,000/.test(item)));
  const finance = packet(defaultDemoState, ['finance']);
  assert.ok(finance.finance!.length >= 1);
  assert.ok(!JSON.stringify(finance).includes(usd(700000)), 'offer headlines stay out without the offers part');
  assert.equal(finance.estimate, null);
  const transaction = packet(defaultDemoState, ['transaction']);
  assert.equal(transaction.transaction!.stage, 'under-contract');
  assert.deepEqual(
    transaction.transaction!.openTasks.map(task => task.title),
    ['Book movers', 'Old task'],
  );
});

test('documents and notes never enter the packet, even with every part chosen', () => {
  const result = packet(defaultDemoState, packetParts);
  const text = JSON.stringify(result);
  assert.ok(!text.includes('inspection.pdf'));
  assert.ok(!text.includes('"documents"'));
  assert.deepEqual(Object.keys(result.transaction!).sort(), [
    'deadlines',
    'inspection',
    'milestones',
    'openTasks',
    'stage',
  ]);
});

test('a withheld estimate stays withheld in the packet with every part chosen', () => {
  const state = withSales(2);
  const withheld = calculateStudio(sampleEvidence, state).estimate;
  const result = packet(state, packetParts);
  assert.equal(result.estimate!.verdict, 'declined');
  assert.equal(result.estimate!.estimate, null);
  assert.equal(result.estimate!.range, null);
  assert.ok(result.estimate!.comparables.every(item => item.adjustedPrice === null && item.weightPercent === null));
  const text = JSON.stringify(result) + agentPacketHtml(result);
  assert.ok(!text.includes(usd(withheld)) && !text.includes(String(Math.round(withheld))));
});

test('the packet is reproducible and ignores unknown parts', () => {
  assert.equal(packet().checksum, packet().checksum);
  assert.notEqual(packet().checksum, packet(defaultDemoState, ['estimate']).checksum);
  const odd = packet(defaultDemoState, ['estimate', 'everything' as never]);
  assert.deepEqual(odd.included, ['estimate']);
});

test('printable pages escape every entered value', () => {
  const value = input(defaultDemoState);
  const hostile = '<img src=x onerror=alert(1)>';
  value.brief = { ...value.brief, property: { ...value.brief.property, address: hostile } };
  value.lab!.offers[0].label = '<script>alert(1)</script>';
  const os = buildOsBrief(value);
  const html = [
    osBriefHtml(os, new Date(CREATED)),
    offerComparisonHtml(value.lab!, value.offers!, hostile, new Date(CREATED)),
    agentPacketHtml(
      agentPacket({ ...value, os, include: packetParts, createdAt: CREATED, offers: value.offers, lab: value.lab }),
    ),
  ];
  for (const page of html) {
    assert.ok(!page.includes('<img src=x') && !page.includes('<script>alert'), 'raw markup must not survive');
    assert.match(page, /&lt;img src=x onerror=alert\(1\)&gt;/);
  }
});
