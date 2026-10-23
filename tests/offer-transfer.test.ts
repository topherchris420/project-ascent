import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeOffer,
  blankOffer,
  compareOfferLab,
  emptyOfferLab,
  offerLabRecord,
  offerLabSchema,
  offerScheduleIssues,
} from '../src/lib/offer-lab';
import { MAX_OFFER_IMPORT_BYTES, offerCalendar, parseOfferImport } from '../src/lib/offer-transfer';
import { offerComparisonHtml } from '../src/lib/os-reports';

const key = 'dc:3313____0047';
function fixture() {
  const lab = emptyOfferLab(key, '2026-10-22');
  lab.settings.assumedAcceptance = '2026-10-25';
  lab.settings.mortgagePayoff = 312345;
  lab.offers = [
    {
      ...blankOffer(0, 'seller'),
      id: 'offer-a',
      label: 'Offer A',
      price: 725999,
      closingDate: '2026-11-30',
      offerExpires: '2026-10-27',
      earnestDueDays: 3,
      contingencies: { ...blankOffer(0, 'seller').contingencies, inspection: { included: true, days: 10 } },
      otherTerms: 'PRIVATE NEGOTIATION NOTES',
    },
  ];
  return lab;
}
const record = () => {
  const lab = fixture();
  return offerLabRecord(lab, compareOfferLab(lab, null), 'Test address');
};

test('private offer exports round-trip only inputs, never archived calculations or estimate claims', () => {
  const input = record();
  const tampered = { ...input, comparison: { estimate: { stated: true, rows: [{ difference: 999999 }] } } };
  const restored = parseOfferImport(JSON.stringify(tampered), key);
  assert.deepEqual(restored.lab, input.lab);
  assert.equal(restored.exportedAt, input.exportedAt);
  assert.deepEqual(Object.keys(restored).sort(), ['exportedAt', 'lab']);
  const recalculated = compareOfferLab(restored.lab, { verdict: 'declined', estimate: null, label: 'Withheld' });
  assert.equal(recalculated.estimate.stated, false);
  assert.deepEqual(recalculated.estimate.rows, []);
});

test('imports reject other homes, mismatched inner keys, malformed, oversized and unsupported records', () => {
  assert.throws(() => parseOfferImport(JSON.stringify(record()), 'maryland:other'), /different home/);
  const mismatched = record();
  mismatched.lab.propertyKey = 'dc:other';
  assert.throws(() => parseOfferImport(JSON.stringify(mismatched), key), /different home/);
  assert.throws(() => parseOfferImport('{', key), /not valid JSON/);
  assert.throws(() => parseOfferImport('é'.repeat(MAX_OFFER_IMPORT_BYTES / 2 + 1), key), /512 KB/);
  for (const value of [null, [], {}, { ...record(), format: 'future' }, { ...record(), exportedAt: 'yesterday' }])
    assert.throws(() => parseOfferImport(JSON.stringify(value), key), /incomplete, damaged or unsupported/);
  const invalid = record();
  invalid.lab.offers[0].price = -1;
  assert.throws(() => parseOfferImport(JSON.stringify(invalid), key), /incomplete/);
});

test('imports reject duplicate IDs, orphan references, extra input fields and oversized offer sets', () => {
  const duplicate = record();
  duplicate.lab.offers.push(duplicate.lab.offers[0]);
  assert.throws(() => parseOfferImport(JSON.stringify(duplicate), key), /incomplete/);
  const orphan = record();
  orphan.lab.referenceOfferId = 'offer-missing';
  assert.throws(() => parseOfferImport(JSON.stringify(orphan), key), /does not contain/);
  const extra = record();
  Object.assign(extra.lab.settings, { injectedEstimate: 999999 });
  assert.throws(() => parseOfferImport(JSON.stringify(extra), key), /incomplete/);
  const overflow = record();
  overflow.lab.offers = Array.from({ length: 7 }, (_, i) => ({ ...overflow.lab.offers[0], id: `offer-${i}` }));
  assert.throws(() => parseOfferImport(JSON.stringify(overflow), key), /incomplete/);
});

test('offer dates reject normalized impossible dates but accept leap days', () => {
  for (const date of ['2026-02-29', '2026-02-30', '2026-04-31', '2026-13-01', 'garbage']) {
    const lab = fixture();
    lab.offers[0].closingDate = date;
    assert.equal(offerLabSchema.safeParse(lab).success, false, date);
    lab.offers[0].closingDate = null;
    lab.settings.assumedAcceptance = date;
    assert.equal(offerLabSchema.safeParse(lab).success, false, date);
  }
  const leap = fixture();
  leap.offers[0].closingDate = '2028-02-29';
  assert.equal(offerLabSchema.safeParse(leap).success, true);
});

test('no acceptance date means no invented relative deadline, regardless of the count-from date', () => {
  const lab = fixture();
  lab.settings.assumedAcceptance = null;
  for (const asOf of ['2026-10-22', '2026-11-15']) {
    lab.settings.asOf = asOf;
    const analysis = analyzeOffer(lab.offers[0], lab.settings);
    for (const key of ['earnest', 'inspection']) {
      const deadline = analysis.deadlines.find(item => item.key === key)!;
      assert.equal(deadline.date, null);
      assert.equal(deadline.basis, 'missing');
    }
    assert.ok(analysis.missing.includes('Assumed acceptance date for relative deadlines'));
    const calendar = offerCalendar(lab, 'offer-a');
    assert.equal(calendar.match(/BEGIN:VEVENT/g)?.length, 2);
    assert.doesNotMatch(calendar, /Earnest money due|inspection contingency ends/);
  }
});

test('calendar dates handle month and leap boundaries, preserve day-only dates, and export only one offer', () => {
  const lab = fixture();
  lab.settings.assumedAcceptance = '2028-02-27';
  lab.offers[0].offerExpires = null;
  lab.offers[0].closingDate = '2028-03-31';
  lab.offers[0].earnestDueDays = 2;
  lab.offers[0].rentBackDays = 2;
  lab.offers.push({ ...blankOffer(1, 'buyer'), id: 'offer-b', label: 'UNSELECTED', closingDate: '2028-05-01' });
  const output = offerCalendar(lab, 'offer-a', new Date('2026-10-22T20:00:00Z'));
  assert.match(output, /DTSTART;VALUE=DATE:20280229\r\n/);
  assert.match(output, /DTSTART;VALUE=DATE:20280402\r\n/);
  assert.match(output, /DTSTAMP:20261022T200000Z/);
  assert.match(output, /CLASS:PRIVATE/);
  assert.match(output, /STATUS:TENTATIVE/);
  assert.doesNotMatch(output, /UNSELECTED|725999|312345|PRIVATE NEGOTIATION NOTES|ATTENDEE|ORGANIZER|VALARM/);
  const repeated = offerCalendar(lab, 'offer-a', new Date('2026-10-23T20:00:00Z'));
  assert.deepEqual(output.match(/^UID:.*$/gm), repeated.match(/^UID:.*$/gm));
});

test('conflicting dates appear in the report and prevent calendar export without inventing legal outcomes', () => {
  const lab = fixture();
  lab.offers[0].closingDate = '2026-10-26';
  lab.offers[0].offerExpires = '2026-10-24';
  const issues = offerScheduleIssues(lab.offers[0], lab.settings);
  assert.equal(issues.length, 3);
  assert.match(issues[0], /after the entered offer expiration/);
  assert.match(issues.join(' '), /Earnest money due falls after/);
  assert.match(issues.join(' '), /Home inspection contingency ends falls after/);
  const html = offerComparisonHtml(lab, compareOfferLab(lab, null), 'Test', new Date());
  assert.match(html, /after the entered offer expiration/);
  assert.throws(() => offerCalendar(lab, 'offer-a'), /Resolve the conflicting dates/);
  lab.offers[0].closingDate = '2026-10-20';
  assert.match(offerScheduleIssues(lab.offers[0], lab.settings).join(' '), /before the assumed acceptance/);
});

test('calendar serializing resists content-line injection and folds UTF-8 without breaking characters', () => {
  const lab = fixture();
  lab.offers[0].label = '房'.repeat(20) + ';,\\\r\nBEGIN:VEVENT';
  const output = offerCalendar(lab, 'offer-a');
  assert.equal(output.match(/\r\nBEGIN:VEVENT\r\n/g)?.length, 4);
  assert.ok(output.split('\r\n').every(line => Buffer.byteLength(line, 'utf8') <= 75));
  const unfolded = output.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('房'.repeat(20)));
  assert.ok(unfolded.includes('\\;\\,\\\\\\nBEGIN:VEVENT'));
  assert.ok(!output.includes('\ufffd'));
});

test('a what-if calendar is explicitly labeled; absent dates or selection cannot produce an empty calendar', () => {
  const lab = fixture();
  lab.offers[0].basis = 'what-if';
  assert.match(offerCalendar(lab, 'offer-a'), /SUMMARY:What-if review:/);
  assert.throws(() => offerCalendar(lab, 'offer-missing'), /Choose an offer/);
  lab.offers = [{ ...blankOffer(0, 'buyer'), id: 'offer-empty' }];
  assert.throws(() => offerCalendar(lab, 'offer-empty'), /Enter a date/);
});
