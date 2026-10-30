import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HPAP_TABLE,
  MMP_LIMITS,
  PG_PATHWAY_LIMITS,
  blankProfile,
  screenPrograms,
  type BuyerProfile,
} from '../src/lib/homebuyer-programs';

const profile = (patch: Partial<BuyerProfile>): BuyerProfile => ({ ...blankProfile(patch.area ?? 'dc'), ...patch });
const find = (results: ReturnType<typeof screenPrograms>, id: string) => {
  const result = results.find(item => item.id === id);
  assert.ok(result, id);
  return result;
};

test('posted tables are transcribed with eight household sizes and descending assistance', () => {
  for (const band of HPAP_TABLE.bands) assert.equal(band.limits.length, 8);
  const amounts = HPAP_TABLE.bands.map(band => band.assistance);
  assert.deepEqual(
    amounts,
    [...amounts].sort((a, b) => b - a),
  );
  assert.equal(PG_PATHWAY_LIMITS.length, 8);
  assert.ok(MMP_LIMITS.incomeOneOrTwo < MMP_LIMITS.incomeThreePlus);
});

test('HPAP picks the first table row the household fits, at the exact limit too', () => {
  const base = { area: 'dc' as const, householdSize: 3, lastOwned: 'never' as const };
  const atLimit = find(screenPrograms(profile({ ...base, householdIncome: 74_750 })), 'dc-hpap');
  assert.equal(atLimit.verdict, 'worth-checking');
  assert.match(atLimit.amount!, /\$202,000/);
  const nextRow = find(screenPrograms(profile({ ...base, householdIncome: 74_751 })), 'dc-hpap');
  assert.match(nextRow.amount!, /\$161,600/);
  const over = find(screenPrograms(profile({ ...base, householdIncome: 164_451 })), 'dc-hpap');
  assert.equal(over.verdict, 'does-not-fit');
  assert.equal(over.amount, null);
});

test('ownership within three years rules out first-time programs; unknown answers stay questions', () => {
  const recent = screenPrograms(
    profile({ area: 'dc', lastOwned: 'within-3', householdSize: 2, householdIncome: 60_000 }),
  );
  assert.equal(find(recent, 'dc-hpap').verdict, 'does-not-fit');
  assert.notEqual(find(recent, 'dc-open-doors').verdict, 'does-not-fit', 'Open Doors takes repeat buyers');
  const blank = screenPrograms(blankProfile('dc'));
  assert.equal(find(blank, 'dc-hpap').verdict, 'ask');
  assert.ok(
    blank.every(result => result.verdict !== 'worth-checking'),
    'nothing is "worth checking" with no answers',
  );
});

test('Open Doors counts borrower income and the 640 credit floor', () => {
  const fits = screenPrograms(
    profile({ area: 'dc', householdIncome: 300_000, borrowerIncome: 200_000, creditScore: 640 }),
  );
  assert.equal(find(fits, 'dc-open-doors').verdict, 'worth-checking');
  const low = screenPrograms(profile({ area: 'dc', householdIncome: 100_000, creditScore: 639 }));
  assert.equal(find(low, 'dc-open-doors').verdict, 'does-not-fit');
  const household = screenPrograms(profile({ area: 'dc', householdIncome: 300_000, creditScore: 700 }));
  assert.equal(find(household, 'dc-open-doors').verdict, 'ask', 'a high household income does not decide it');
});

test('EAHP appears only for District government employees', () => {
  assert.equal(
    screenPrograms(profile({ area: 'dc' })).find(item => item.id === 'dc-eahp'),
    undefined,
  );
  assert.ok(find(screenPrograms(profile({ area: 'dc', dcGovernmentEmployee: 'yes' })), 'dc-eahp'));
});

test('Maryland Mortgage Program limits, price bands and the veteran exemption', () => {
  const base = {
    area: 'montgomery' as const,
    lastOwned: 'never' as const,
    householdSize: 2,
    householdIncome: 199_320,
    creditScore: 700,
    price: 700_000,
  };
  assert.equal(find(screenPrograms(profile(base)), 'md-mmp').verdict, 'worth-checking');
  assert.equal(find(screenPrograms(profile({ ...base, householdIncome: 199_321 })), 'md-mmp').verdict, 'does-not-fit');
  assert.equal(
    find(screenPrograms(profile({ ...base, householdSize: 3, householdIncome: 232_540 })), 'md-mmp').verdict,
    'worth-checking',
  );
  assert.equal(find(screenPrograms(profile({ ...base, price: 1_400_000 })), 'md-mmp').verdict, 'ask', 'targeted only');
  assert.equal(find(screenPrograms(profile({ ...base, price: 1_600_000 })), 'md-mmp').verdict, 'does-not-fit');
  assert.equal(find(screenPrograms(profile({ ...base, lastOwned: 'within-3' })), 'md-mmp').verdict, 'ask');
  assert.equal(
    find(screenPrograms(profile({ ...base, lastOwned: 'within-3', veteran: 'yes' })), 'md-mmp').verdict,
    'worth-checking',
  );
});

test('county programs follow their own posted rules and amounts', () => {
  const montgomery = screenPrograms(
    profile({ area: 'montgomery', lastOwned: '3-to-5', householdSize: 2, householdIncome: 90_000, creditScore: 700 }),
  );
  assert.equal(find(montgomery, 'mc-mpdu').verdict, 'does-not-fit', 'MPDU looks back five years');
  assert.match(find(montgomery, 'mc-homeownership').amount!, /\$36,000/, '40% of $90,000 is under $50,000');
  assert.equal(find(montgomery, 'mc-hoc').verdict, 'ask', 'stale HOC limits are never compared');
  const large = screenPrograms(profile({ area: 'montgomery', householdSize: 7, householdIncome: 90_000 }));
  assert.equal(find(large, 'mc-mpdu').checks[1].outcome, 'unknown', 'MPDU posts limits for 1–6 people only');
  const pg = screenPrograms(
    profile({ area: 'prince-georges', lastOwned: 'never', householdSize: 4, householdIncome: 132_900, price: 400_000 }),
  );
  const pathway = find(pg, 'pg-pathway');
  assert.equal(pathway.checks[1].outcome, 'meets');
  assert.equal(pathway.verdict, 'ask', 'the purchase-price cap is unconfirmed, so it stays a question');
  assert.match(find(pg, 'pg-workforce').amount!, /\$50,000/);
  const cheaper = screenPrograms(profile({ area: 'prince-georges', price: 150_000 }));
  assert.match(find(cheaper, 'pg-workforce').amount!, /\$37,500/, '25% of the price when that is less');
});

test('results lead with programs worth checking', () => {
  const results = screenPrograms(
    profile({ area: 'dc', lastOwned: 'within-3', householdSize: 2, householdIncome: 90_000, creditScore: 700 }),
  );
  const order = results.map(result => result.verdict);
  assert.deepEqual(
    order,
    [...order].sort(
      (a, b) =>
        ['worth-checking', 'ask', 'does-not-fit'].indexOf(a) - ['worth-checking', 'ask', 'does-not-fit'].indexOf(b),
    ),
  );
});

test('household sizes outside a posted table, or not whole, never fail a program', () => {
  for (const householdSize of [2.5, 9]) {
    const results = screenPrograms(
      profile({ area: 'dc', householdSize, householdIncome: 60_000, lastOwned: 'never', creditScore: 700 }),
    );
    const income = find(results, 'dc-hpap').checks.find(check => /HPAP table/.test(check.rule))!;
    assert.equal(income.outcome, 'unknown', String(householdSize));
    assert.doesNotMatch(income.detail, /NaN/);
  }
  const nine = screenPrograms(profile({ area: 'dc', householdSize: 9, householdIncome: 60_000 }));
  assert.match(
    find(nine, 'dc-hpap').checks.find(check => /HPAP table/.test(check.rule))!.detail,
    /households of 1 to 8 people; ask DHCD/,
  );
  const pg = screenPrograms(profile({ area: 'prince-georges', householdSize: 3.5, householdIncome: 60_000 }));
  for (const result of pg) for (const check of result.checks) assert.doesNotMatch(check.detail, /NaN/, result.id);
});

test('screener failure guards', () => {
  const openDoors = find(
    screenPrograms(profile({ area: 'dc', borrowerIncome: 275_401, householdIncome: 300_000, creditScore: 700 })),
    'dc-open-doors',
  );
  assert.equal(openDoors.verdict, 'does-not-fit');
  const mpdu = find(
    screenPrograms(profile({ area: 'montgomery', lastOwned: 'never', householdSize: 2, householdIncome: 39_999 })),
    'mc-mpdu',
  );
  assert.equal(mpdu.verdict, 'does-not-fit');
});
