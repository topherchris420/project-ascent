import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendMlsAudit,
  assertDisplayableListing,
  authorizeMlsUse,
  MLS_AGREEMENTS,
  mlsBridgeStatus,
  mlsRecordExpired,
  MOCK_MLS_FIXTURES,
  verifyMlsAudit,
  type MlsAgreement,
} from '../src/lib/mls-bridge';

const NOW = new Date('2026-10-22T12:00:00Z');
const viewer = { registered: true, acceptedVowTerms: true, brokerRelationship: true };
const agreement = (overrides: Partial<MlsAgreement> = {}): MlsAgreement => ({
  id: 'test-agreement',
  arrangement: 'idx',
  mls: 'Test MLS',
  participant: 'Test Broker',
  signedOn: '2026-01-01',
  expiresOn: '2027-01-01',
  uses: {
    'public-display': true,
    'registered-display': false,
    monitoring: false,
    valuation: true,
    export: false,
    'model-inference': false,
  },
  fields: { allowed: ['listPrice', 'status'], registeredOnly: ['soldPrice'] },
  retentionDays: 30,
  refreshHours: 12,
  attribution: 'Listing courtesy of the listing broker.',
  evidence: 'test fixture',
  ...overrides,
});

test('the bridge is disabled with no agreement on file, and says what permission it needs', () => {
  assert.equal(MLS_AGREEMENTS.length, 0);
  const status = mlsBridgeStatus(NOW);
  assert.equal(status.enabled, false);
  assert.match(status.reason!, /never presents them as live inventory/);
  assert.match(status.requiredPermission, /IDX, VOW or data-license/);
  assert.deepEqual(
    status.arrangements.map(item => item.kind),
    ['idx', 'vow', 'broker-back-office', 'data-license'],
  );
  const decision = authorizeMlsUse(null, { use: 'public-display', fields: ['listPrice'], viewer: null }, NOW);
  assert.equal(decision.allowed, false);
  assert.deepEqual(decision.fields, []);
});

test('authorization fails closed on expiry, unpermitted uses, unlisted fields and valuation', () => {
  assert.equal(
    authorizeMlsUse(agreement(), { use: 'public-display', fields: ['listPrice'], viewer: null }, NOW).allowed,
    true,
  );
  const expired = authorizeMlsUse(
    agreement({ expiresOn: '2026-10-01' }),
    { use: 'public-display', fields: ['listPrice'], viewer: null },
    NOW,
  );
  assert.match(expired.reasons[0], /expired on 2026-10-01/);
  assert.equal(
    authorizeMlsUse(agreement(), { use: 'export', fields: ['listPrice'], viewer: null }, NOW).allowed,
    false,
  );
  const field = authorizeMlsUse(
    agreement(),
    { use: 'public-display', fields: ['listPrice', 'sellerName'], viewer: null },
    NOW,
  );
  assert.match(field.reasons.join(' '), /sellerName/);
  // Even an agreement that permits valuation is refused: estimates come from validated public records only.
  const valuation = authorizeMlsUse(agreement(), { use: 'valuation', fields: ['listPrice'], viewer: null }, NOW);
  assert.equal(valuation.allowed, false);
  assert.match(valuation.reasons.join(' '), /does not use MLS data in a valuation/);
  const backOffice = authorizeMlsUse(
    agreement({ arrangement: 'broker-back-office' }),
    { use: 'public-display', fields: ['listPrice'], viewer: null },
    NOW,
  );
  assert.match(backOffice.reasons.join(' '), /cannot be shown to consumers/);
});

test('VOW fields need a registered viewer who accepted the terms and has a broker relationship', () => {
  const vow = agreement({ arrangement: 'vow', uses: { ...agreement().uses, 'registered-display': true } });
  const request = { use: 'registered-display' as const, fields: ['listPrice', 'soldPrice'] };
  assert.equal(authorizeMlsUse(vow, { ...request, viewer }, NOW).allowed, true);
  const anonymous = authorizeMlsUse(vow, { ...request, viewer: null }, NOW);
  assert.equal(anonymous.allowed, false);
  assert.ok(anonymous.reasons.some(reason => /registered viewer/.test(reason)));
  const noTerms = authorizeMlsUse(vow, { ...request, viewer: { ...viewer, acceptedVowTerms: false } }, NOW);
  assert.match(noTerms.reasons.join(' '), /soldPrice/);
  // IDX never unlocks registered-only fields.
  assert.equal(authorizeMlsUse(agreement(), { ...request, viewer }, NOW).allowed, false);
});

test('retention, the hash-linked audit log and the synthetic-fixture guard', () => {
  assert.equal(mlsRecordExpired(agreement(), '2026-09-01T00:00:00Z', NOW), true);
  assert.equal(mlsRecordExpired(agreement(), '2026-10-01T00:00:00Z', NOW), false);
  let log = appendMlsAudit([], {
    at: NOW.toISOString(),
    agreementId: null,
    use: 'public-display',
    decision: authorizeMlsUse(null, { use: 'public-display', fields: [], viewer: null }, NOW),
  });
  log = appendMlsAudit(log, {
    at: NOW.toISOString(),
    agreementId: 'test-agreement',
    use: 'export',
    decision: { allowed: false, reasons: ['x'], fields: [] },
  });
  assert.equal(verifyMlsAudit(log), true);
  assert.equal(verifyMlsAudit([{ ...log[0], allowed: true }, log[1]]), false);
  assert.equal(verifyMlsAudit([log[1]]), false);
  for (const fixture of MOCK_MLS_FIXTURES) {
    assert.equal(fixture.synthetic, true);
    assert.match(fixture.notice, /FICTIONAL TEST FIXTURE/);
    assert.throws(() => assertDisplayableListing(fixture), /synthetic/);
  }
  assert.throws(() => assertDisplayableListing({}), /unmarked/);
});
