import { buildHomeDecisionBrief } from '../src/lib/home-decision-brief';
import { calculateStudio, defaultDemoState, sampleEvidence, type StudioState } from '../src/lib/demo-studio';
import { createHomeSnapshot, emptyOwnerNotes } from '../src/lib/homeowner-passport';
import { exampleFinance } from '../src/lib/homeowner-finance';
import { blankOffer, compareOfferLab, emptyOfferLab, type OfferLab } from '../src/lib/offer-lab';
import { valueContext, type OsInput, type RoomSummary } from '../src/lib/homeowner-os';

/** Shared Homeowner OS fixtures: the fictional sample home, two written offers and a room under contract. */
export const NOW = Date.parse('2026-10-22T12:00:00Z');
export const withSales = (keep: number): StudioState => {
  const comps = calculateStudio(sampleEvidence, defaultDemoState).comps;
  return {
    ...structuredClone(defaultDemoState),
    exclusions: comps.slice(keep).map(comp => ({ id: comp.propertyId, reason: 'Test exclusion' })),
  };
};
export const usd = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
export const none = { included: false, days: null };
export const lab = (): OfferLab => {
  const value = emptyOfferLab('demo:landing', '2026-10-22', 'seller', {
    commissionPercent: 5,
    closingPercent: 2,
    payoff: 0,
  });
  value.settings.assumedAcceptance = '2026-10-24';
  value.offers = [
    {
      ...blankOffer(0, 'seller'),
      id: 'offer-a',
      label: 'Offer A',
      price: 700000,
      financing: 'conventional',
      downPaymentPercent: 20,
      earnestMoney: 10000,
      closingDate: '2026-12-01',
      offerExpires: '2026-10-23',
      contingencies: { inspection: { included: true, days: 7 }, appraisal: none, financing: none, homeSale: none },
    },
    {
      ...blankOffer(1, 'seller'),
      id: 'offer-b',
      label: 'Offer B',
      price: 690000,
      escalationCap: 720000,
      financing: 'cash',
      earnestMoney: 30000,
      closingDate: '2026-11-15',
      contingencies: { inspection: none, appraisal: none, financing: none, homeSale: none },
    },
  ];
  return value;
};
export const room = (): RoomSummary => ({
  stage: 'under-contract',
  milestones: [{ id: 'm-000001', title: 'Inspection', due: '2026-10-30', status: 'planned' }],
  tasks: [
    { id: 't-000001', title: 'Book movers', due: '2026-11-10', done: false },
    { id: 't-000002', title: 'Old task', due: '2026-10-01', done: false },
  ],
  deadlines: [{ id: 'd-000001', label: 'Repair request due', date: '2026-10-28', note: '' }],
  inspection: [{ id: 'i-000001', item: 'Exposed wiring in basement', severity: 'safety', status: 'open' }],
  financing: [{ id: 'f-000001', label: 'Appraisal received', done: false }],
  settlement: [{ id: 's-000001', label: 'Final walk-through', done: false }],
  documents: [{ id: 'doc-1', name: 'inspection.pdf', section: 'inspection' }],
});
export function input(state: StudioState, withSaved = false): OsInput {
  const brief = buildHomeDecisionBrief({ evidence: sampleEvidence, state });
  const offerLab = lab();
  return {
    brief,
    timeline: null,
    lab: offerLab,
    offers: compareOfferLab(offerLab, valueContext(brief)),
    watch: null,
    room: room(),
    saved: withSaved
      ? createHomeSnapshot(sampleEvidence, state, exampleFinance(), emptyOwnerNotes(), '2026-10-01T00:00:00.000Z')
      : null,
    current: {
      valuationHash: brief.references.valuationHash,
      financeHash: brief.references.financeHash,
      salesSha256: null,
    },
    now: NOW,
  };
}
