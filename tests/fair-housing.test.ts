import test from 'node:test';
import assert from 'node:assert/strict';
import { fairHousingAuditSummary, fairHousingGoldenCases, inspectFairHousing } from '../src/lib/fair-housing';

for (const entry of fairHousingGoldenCases)
  test(`fair housing golden: ${entry.id} → ${entry.expected}`, () => {
    const result = inspectFairHousing(entry.text, { surface: entry.surface });
    assert.equal(result.decision, entry.expected, `${entry.text}: ${JSON.stringify(result.findings)}`);
  });

test('guard returns structured reasons without echoing private names, email or the raw query', () => {
  const raw = 'Private Person private@example.com wants no Muslim tenants.';
  const result = inspectFairHousing(raw, { surface: 'client-preferences' });
  assert.equal(result.decision, 'block');
  assert.ok(result.findings.every(finding => finding.code && finding.layer && finding.reason));
  const audit = JSON.stringify(fairHousingAuditSummary(result));
  assert.ok(!audit.includes('Private Person'));
  assert.ok(!audit.includes('private@example.com'));
  assert.ok(!audit.includes(raw));
});

test('declaring neutral/educational intent does not authorize actionable discriminatory targeting', () => {
  const result = inspectFairHousing('Create an ad for white families only.', {
    surface: 'advertising',
    intent: 'education',
  });
  assert.equal(result.decision, 'block');
});

test('accessibility, neutral research and housing features are available across workflow surfaces', () => {
  for (const surface of [
    'client-preferences',
    'search',
    'client-communication',
    'assistant-input',
    'assistant-output',
  ] as const) {
    assert.equal(
      inspectFairHousing('Needs wheelchair access, 3 bedrooms, no stairs and published school data.', { surface })
        .decision,
      'allow',
    );
  }
});

test('ad-specific occupant copy is reviewed while ordinary family-room descriptions remain available', () => {
  assert.equal(
    inspectFairHousing('Family-friendly home, ideal for couples.', { surface: 'advertising' }).decision,
    'review',
  );
  assert.equal(
    inspectFairHousing('A family room with white cabinets and black appliances.', { surface: 'advertising' }).decision,
    'allow',
  );
});

test('unsupported input bounds return review rather than a compliance pass', () => {
  assert.equal(inspectFairHousing('a'.repeat(20001), { surface: 'search' }).decision, 'review');
});
