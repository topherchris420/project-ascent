import { compareOffers, DEMO_AS_OF } from './analytics';
import { builtinRules, evaluateDomainRules } from './domain';
import type { DomainRule, FactValue, OfferRisk } from './domain-types';
import type { Offer } from './types';

export function offerDomainFacts(offer: Offer, asOf = DEMO_AS_OF): Record<string, FactValue> {
  const row = compareOffers([offer], asOf).rows[0];
  const contingencies = offer.contingencies.join(' ').toLowerCase();
  return { 'offer.financingRequired': offer.financing !== 'cash', 'offer.hasFinancingContingency': /financ|loan approval/.test(contingencies), 'offer.hasAppraisalContingency': /apprais/.test(contingencies), 'offer.hasSaleContingency': /sale of|home.sale|sell.{0,20}(?:home|property)|existing home/.test(contingencies), 'offer.hasInspectionContingency': /inspect/.test(contingencies), 'offer.sellerCreditPercent': offer.sellerCredit / offer.price * 100, 'offer.earnestPercent': row.earnestPercent, 'offer.earnestMoney': offer.earnestMoney, 'offer.closeDays': row.daysToClose, 'offer.expired': row.expired, 'offer.noContingencies': offer.contingencies.length === 0 };
}

export function analyzeOfferRisk(offer: Offer, options: { perspective?: 'seller' | 'buyer'; regionId?: string; asOf?: string; rules?: DomainRule[] } = {}): OfferRisk {
  const perspective = options.perspective ?? 'seller', regionId = options.regionId ?? 'austin', asOf = options.asOf ?? DEMO_AS_OF;
  const row = compareOffers([offer], asOf).rows[0];
  const facts = offerDomainFacts(offer, asOf);
  const findings = evaluateDomainRules(options.rules ?? builtinRules, facts, { category: 'offer', regionId, asOf, perspective });
  return { offerId: offer.id, perspective, findings, explainability: {
    known: [`Recorded financing: ${offer.financing}; ${offer.contingencies.length} entered contingencies.`, 'Entered fields are not a substitute for the executed agreement, proof of funds or lender confirmation.'],
    computed: [{ label: 'Price less seller credit', value: row.netBeforeCosts, formula: `${offer.price} − ${offer.sellerCredit}; before all other costs and payoff`, evidenceIds: [offer.id] }, { label: 'Earnest share', value: row.earnestPercent, formula: 'Earnest money / offer price × 100; arithmetic, not risk probability', evidenceIds: [offer.id] }, { label: 'Calendar days to entered closing', value: row.daysToClose, formula: `Ceiling((closing date − ${asOf}) / 24 hours); not a legal deadline calculation`, evidenceIds: [offer.id] }],
    assumptions: ['Contingency tags are recognized from entered descriptions. An absent tag means unrecorded protection, not a proven contractual waiver.', 'Rule interactions are unreviewed analyst-practice assumptions unless a current independent review is attached.', `Perspective: ${perspective}; neither offer price nor financing label alone determines suitability.`],
    unknowns: ['Signed contract language, effective date, notice provisions, applicable remedies and earnest-money refundability.', 'Lender program limits, verified reserves, appraisal-gap funds, other-home contract status and client-approved priorities.', 'Closing reliability, default probability and causal effects are not estimated.'],
    professionalDecision: [perspective === 'buyer' ? 'Review contractual exposure, affordability and verified financing before waiving protections or authorizing a counteroffer.' : 'Compare verified contractual performance terms and client priorities; approve any acceptance, rejection or counteroffer explicitly.'],
    evidenceIds: [offer.id, offer.propertyId, ...new Set(findings.flatMap((finding) => finding.evidenceIds))],
  } };
}
export function analyzeOfferRisks(offers: Offer[], options: Parameters<typeof analyzeOfferRisk>[1] = {}): OfferRisk[] { return offers.map((offer) => analyzeOfferRisk(offer, options)); }
