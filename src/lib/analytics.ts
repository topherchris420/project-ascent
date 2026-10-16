import type { Alert, CmaAssumptions, CmaRecord, CmaResult, CompAdjustment, GraphEdge, GraphNode, MarketSummary, Offer, Outcome, Property, Scenario, ValuationProperty, Workspace } from './types';

/** A frozen clock for the isolated demonstration, never a claim of live data. */
export const DEMO_AS_OF = '2026-10-15T12:00:00.000Z';
export const defaultAssumptions: CmaAssumptions = {
  sqftRate: 110, bedroomValue: 12000, bathroomValue: 15000, conditionValue: 14000,
  monthlyTrend: 0, maxDistanceMiles: 3, maxAgeDays: 180, maxSizeRatio: 1.35,
};
const DAY = 86400000;
const round = (value: number, digits = 0) => Number(value.toFixed(digits));
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length ? sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2 : 0;
};
const unique = (values: string[]) => [...new Set(values)].sort();
const timestamp = (value: string, label: string) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid ISO date.`);
  return parsed;
};
const finite = (value: number, label: string, min = 0) => {
  if (!Number.isFinite(value) || value < min) throw new Error(`${label} must be a finite number greater than or equal to ${min}.`);
};
/** Stable, non-cryptographic checksum for calculation reproducibility; not a security control. */
export function calculationChecksum(value: unknown): string {
  const canonical = (item: unknown): string => {
    if (Array.isArray(item)) return `[${item.map(canonical).join(',')}]`;
    if (item && typeof item === 'object') return `{${Object.entries(item).filter(([, val]) => val !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => `${JSON.stringify(key)}:${canonical(val)}`).join(',')}}`;
    return JSON.stringify(item) ?? 'null';
  };
  const input = canonical(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) hash = Math.imul(hash ^ input.charCodeAt(i), 0x01000193) >>> 0;
  return `fnv1a32-${hash.toString(16).padStart(8, '0')}`;
}

export function distanceMiles(a: Pick<Property, 'lat' | 'lng'>, b: Pick<Property, 'lat' | 'lng'>): number {
  const rad = (degrees: number) => degrees * Math.PI / 180;
  const dlat = rad(b.lat - a.lat), dlng = rad(b.lng - a.lng);
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dlng / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function validateProperty(property: ValuationProperty, requireCondition: boolean) {
  for (const field of ['sqft', 'beds', 'baths'] as const) finite(property[field], `${property.id} ${field}`);
  if (requireCondition || property.condition !== undefined) finite(property.condition!, `${property.id} condition (explicit conditionValue=0 is required when condition is unknown)`);
  if (property.sqft === 0) throw new Error(`${property.id} square footage must be greater than zero.`);
  if (!Number.isFinite(property.lat) || Math.abs(property.lat) > 90 || !Number.isFinite(property.lng) || Math.abs(property.lng) > 180) throw new Error(`${property.id} has invalid coordinates.`);
}

/** Paired-feature adjustment model. Rates are user assumptions, not fitted market coefficients. */
export function calculateCma(subject: ValuationProperty, candidates: ValuationProperty[], overrides: Partial<CmaAssumptions> = {}, asOf = DEMO_AS_OF): CmaResult {
  const asOfTime = timestamp(asOf, 'CMA as-of');
  const assumptions = { ...defaultAssumptions, ...overrides };
  for (const key of ['sqftRate', 'bedroomValue', 'bathroomValue', 'conditionValue', 'maxDistanceMiles', 'maxAgeDays'] as const) finite(assumptions[key], key);
  finite(assumptions.maxSizeRatio, 'maxSizeRatio', 1);
  if (!Number.isFinite(assumptions.monthlyTrend) || assumptions.monthlyTrend <= -1 || assumptions.monthlyTrend > 1) throw new Error('monthlyTrend must be greater than -1 and at most 1.');
  validateProperty(subject, assumptions.conditionValue > 0);
  const comps: CompAdjustment[] = [];
  const excluded: CmaResult['excluded'] = [];
  const seen = new Set<string>();
  for (const candidate of [...candidates].sort((a, b) => a.id.localeCompare(b.id))) {
    if (candidate.id === subject.id) continue;
    if (seen.has(candidate.id)) throw new Error(`Duplicate comparable ID: ${candidate.id}.`);
    seen.add(candidate.id);
    let reason = '';
    try { validateProperty(candidate, assumptions.conditionValue > 0); } catch (error) { reason = error instanceof Error ? error.message : 'Invalid property data.'; }
    const saleTime = candidate.soldAt ? Date.parse(candidate.soldAt) : NaN;
    const ageDays = (asOfTime - saleTime) / DAY;
    const distance = distanceMiles(subject, candidate);
    const ratio = Math.max(subject.sqft, candidate.sqft) / Math.min(subject.sqft, candidate.sqft);
    if (!reason && candidate.status !== 'sold') reason = 'Only documented closed sales are valuation comparables.';
    if (!reason && (!Number.isFinite(saleTime) || !Number.isFinite(candidate.soldPrice) || candidate.soldPrice! <= 0)) reason = 'Missing a valid closing date or positive closing price.';
    if (!reason && ageDays < 0) reason = 'Closing occurs after the analysis date; excluded to prevent look-ahead bias.';
    if (!reason && ageDays > assumptions.maxAgeDays) reason = `Sale is older than the ${assumptions.maxAgeDays}-day assumption.`;
    if (!reason && distance > assumptions.maxDistanceMiles) reason = `Outside the ${assumptions.maxDistanceMiles}-mile radius assumption.`;
    if (!reason && ratio > assumptions.maxSizeRatio) reason = `Size ratio exceeds the ${assumptions.maxSizeRatio} assumption.`;
    if (reason) { excluded.push({ propertyId: candidate.id, reason }); continue; }
    const base = candidate.soldPrice!;
    const adjustments = [
      { factor: 'Living area', amount: (subject.sqft - candidate.sqft) * assumptions.sqftRate, explanation: `(${subject.sqft} subject − ${candidate.sqft} comp) sqft × $${assumptions.sqftRate}/sqft marginal assumption.` },
      { factor: 'Bedrooms', amount: (subject.beds - candidate.beds) * assumptions.bedroomValue, explanation: `(${subject.beds} subject − ${candidate.beds} comp) × $${assumptions.bedroomValue}; may overlap living-area value; professional review required.` },
      { factor: 'Bathrooms', amount: (subject.baths - candidate.baths) * assumptions.bathroomValue, explanation: `(${subject.baths} subject − ${candidate.baths} comp) × $${assumptions.bathroomValue}.` },
      ...(assumptions.conditionValue > 0 ? [{ factor: 'Condition', amount: (subject.condition! - candidate.condition!) * assumptions.conditionValue, explanation: `(${subject.condition} subject − ${candidate.condition} comp) condition points × $${assumptions.conditionValue}; subjective rubric, verify inspection.` }] : []),
      { factor: 'Time', amount: base * (Math.pow(1 + assumptions.monthlyTrend, ageDays / 30.4375) - 1), explanation: `$${base} × ((1 + ${assumptions.monthlyTrend} monthly trend)^(${round(ageDays, 2)}/30.4375) − 1); trend is an explicit scenario assumption.` },
    ].map((adjustment) => ({ ...adjustment, amount: round(adjustment.amount, 2) }));
    const netAdjustment = round(adjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0), 2);
    const grossAdjustment = round(adjustments.reduce((sum, adjustment) => sum + Math.abs(adjustment.amount), 0), 2);
    const adjustedPrice = round(base + netAdjustment, 2);
    if (!Number.isFinite(adjustedPrice) || !Number.isFinite(grossAdjustment) || adjustedPrice <= 0) { excluded.push({ propertyId: candidate.id, reason: 'Assumptions produce a non-finite or non-positive adjusted value; revise assumptions.' }); continue; }
    comps.push({ propertyId: candidate.id, distanceMiles: round(distance, 4), ageDays: round(ageDays, 3), adjustments, netAdjustment, grossAdjustment, adjustedPrice,
      weight: 1 / ((1 + distance) * (1 + ageDays / 90) * (1 + Math.abs(Math.log(subject.sqft / candidate.sqft)) * 4)),
      warnings: grossAdjustment > base * 0.25 ? ['Gross adjustments exceed 25% of sale price; this is a review heuristic, not a validated reliability cutoff.'] : [] });
  }
  if (!comps.length) throw new Error('No eligible closed comparables. Expand documented distance, age, or size assumptions, or add verified closed sales.');
  const totalWeight = comps.reduce((sum, comp) => sum + comp.weight, 0);
  for (const comp of comps) comp.weight /= totalWeight;
  const estimate = round(comps.reduce((sum, comp) => sum + comp.adjustedPrice * comp.weight, 0));
  const low = Math.floor(Math.min(...comps.map((comp) => comp.adjustedPrice)));
  const high = Math.ceil(Math.max(...comps.map((comp) => comp.adjustedPrice)));
  const warnings = [
    'Professional review required. This calculation is a pricing aid, not an appraisal or a guaranteed sale price.',
    'The range spans adjusted observed comparables; it is not a statistical confidence interval or a forecast coverage guarantee.',
    'Adjustment rates and distance/age/size filters are explicit user assumptions, not coefficients learned from this sample.',
    'Weights use inverse distance, sale age, and relative size difference. Lot, school boundaries, concessions, permits, title, and unobserved condition are not modeled.',
    'Bedroom and square-footage adjustments may double-count related value; inspect sensitivity before use.',
  ];
  if (comps.length < 3) warnings.push('Fewer than three eligible sales; evidence is especially sparse and the observed range may understate uncertainty.');
  if (assumptions.monthlyTrend !== 0) warnings.push('A non-zero time trend was supplied as an assumption; independent local evidence is required to support it.');
  if (assumptions.conditionValue === 0) warnings.push('Condition adjustment was explicitly disabled (conditionValue=0). Unknown condition remains unknown; no zero or average condition score was invented. Review unmodeled condition differences before professional use.');
  const result: CmaResult = { version: assumptions.conditionValue === 0 ? 'ascent-cma-1.1' : 'ascent-cma-1.0', asOf: new Date(asOfTime).toISOString(), subjectId: subject.id, assumptions, comps, excluded, estimate, low, high,
    strategies: { conservative: low, moderate: estimate, aggressive: high }, warnings,
    sourceIds: unique([subject.sourceId, ...comps.map((comp) => candidates.find((candidate) => candidate.id === comp.propertyId)!.sourceId)]), calculationHash: '',
    inputSnapshot: structuredClone({ subject, candidates: [...candidates].sort((a, b) => a.id.localeCompare(b.id)) }) };
  result.calculationHash = calculationChecksum(result);
  return result;
}

export function summarizeMarket(properties: Property[], asOf = DEMO_AS_OF): MarketSummary {
  const now = timestamp(asOf, 'Market as-of');
  const eligible = properties.filter((property) => Date.parse(property.listedAt) <= now);
  const active = eligible.filter((property) => property.status === 'active');
  const sold = eligible.filter((property) => property.status === 'sold' && property.soldAt && Date.parse(property.soldAt) <= now && Date.parse(property.soldAt) >= now - 90 * DAY);
  const reference = active.length ? active : sold;
  const reductions = eligible.filter((property) => {
    const prices = property.history.filter((event) => event.price !== undefined && Date.parse(event.date) <= now && !/closed|closing|sold/i.test(event.event) && !(property.soldAt && Date.parse(event.date) === Date.parse(property.soldAt) && event.price === property.soldPrice)).sort((a, b) => a.date.localeCompare(b.date));
    return prices.some((event, index) => index > 0 && Date.parse(event.date) >= now - 90 * DAY && event.price! < prices[index - 1].price!);
  });
  return { active: active.length, sold: sold.length, pending: eligible.filter((property) => property.status === 'pending').length, withdrawn: eligible.filter((property) => property.status === 'withdrawn').length,
    medianDom: round(median(reference.map((property) => property.dom)), 1), medianPrice: round(median(reference.map((property) => property.status === 'sold' ? property.soldPrice! : property.price))),
    monthsSupply: sold.length ? round(active.length / (sold.length / 3), 2) : null,
    absorption: active.length ? round((sold.length / 3) / active.length * 100, 2) : null,
    priceReductions: reductions.length, sampleSize: eligible.length,
    warnings: ['Snapshot metrics cover only supplied records, not complete regional or MLS inventory.', 'Sold count uses the trailing 90 days; monthly absorption = (90-day closings / 3) / current active listings × 100. Months supply uses the same pace.', 'Median asking price and days on market use current active records, falling back to recent sold records; a small non-random sample is not a market forecast.'],
    sourceIds: unique(eligible.map((property) => property.sourceId)) };
}

export function simulatePricing(cma: CmaResult, listPrice: number, costs: Partial<Scenario['costAssumptions']> = {}): Scenario {
  finite(listPrice, 'List price', 1);
  const costAssumptions = { commissionPercent: 2.5, closingPercent: 1, concessions: 0, ...costs };
  for (const [key, value] of Object.entries(costAssumptions)) finite(value, key);
  if (costAssumptions.commissionPercent + costAssumptions.closingPercent > 100) throw new Error('Combined percentage costs cannot exceed 100%.');
  const difference = round(listPrice - cma.estimate);
  const estimatedNet = round(listPrice * (1 - (costAssumptions.commissionPercent + costAssumptions.closingPercent) / 100) - costAssumptions.concessions);
  return { listPrice, difference, differencePercent: round(difference / cma.estimate * 100, 2),
    position: listPrice < cma.low ? 'Below observed adjusted-comp range' : listPrice > cma.high ? 'Above observed adjusted-comp range' : 'Within observed adjusted-comp range',
    estimatedNet, costAssumptions, warnings: ['Scenario assumes a sale at the entered list price; it does not predict a buyer response, sale price, sale probability, or time to sell.', 'Net is before mortgage payoff, taxes, liens, repairs, prorations, and other unmodeled obligations. Fees are editable assumptions, not a prescribed commission.', 'Professional review required before any price or listing change.'], evidenceIds: unique([cma.subjectId, ...cma.comps.map((comp) => comp.propertyId), ...cma.sourceIds, cma.calculationHash]) };
}

export type OfferComparison = { id: string; buyer: string; price: number; sellerCredit: number; netBeforeCosts: number; financing: Offer['financing']; downPercent: number; earnestMoney: number; earnestPercent: number; daysToClose: number; contingencyCount: number; contingencies: string[]; cautions: string[]; expired: boolean; evidenceIds: string[] };
export function compareOffers(offers: Offer[], asOf = DEMO_AS_OF): { rows: OfferComparison[]; warnings: string[]; evidenceIds: string[] } {
  const now = timestamp(asOf, 'Offer as-of');
  const rows = offers.map((offer): OfferComparison => {
    finite(offer.price, 'Offer price', 1); finite(offer.sellerCredit, 'Seller credit'); finite(offer.earnestMoney, 'Earnest money'); finite(offer.downPercent, 'Down payment percent');
    if (offer.downPercent > 100 || offer.sellerCredit > offer.price || offer.earnestMoney > offer.price) throw new Error(`Offer ${offer.id} contains inconsistent financial terms.`);
    const daysToClose = Math.ceil((timestamp(offer.closeDate, 'Closing date') - now) / DAY);
    const expired = timestamp(offer.expiresAt, 'Offer expiry') < now;
    const cautions = ['Review the signed contract, proof of funds, lender approval, and local requirements with the licensed professional.'];
    if (offer.financing !== 'cash') cautions.push(`${offer.financing.toUpperCase()} financing requires lender and loan-term verification; the label alone does not predict closing reliability.`);
    if (offer.financing === 'cash') cautions.push('Cash terms still require proof of funds; cash alone does not guarantee performance.');
    if (offer.contingencies.length) cautions.push(`Review ${offer.contingencies.length} recorded contingency terms and deadlines; count is not a probability of failure.`);
    if (daysToClose < 0) cautions.push('The stated closing date has passed; verify whether the offer is still actionable.');
    if (expired) cautions.push('The stated expiration has passed; obtain a documented extension before treating this as actionable.');
    return { id: offer.id, buyer: offer.buyer, price: offer.price, sellerCredit: offer.sellerCredit, netBeforeCosts: offer.price - offer.sellerCredit, financing: offer.financing,
      downPercent: offer.downPercent, earnestMoney: offer.earnestMoney, earnestPercent: round(offer.earnestMoney / offer.price * 100, 2), daysToClose, contingencyCount: offer.contingencies.length,
      contingencies: [...offer.contingencies], cautions, expired, evidenceIds: [offer.id, offer.propertyId] };
  });
  return { rows, warnings: ['No automated offer winner or financing-risk score is inferred. Price less seller credit is an arithmetic comparison before transaction costs and payoff.', 'Only contractual financial and performance terms are compared. Protected characteristics and buyer names are not decision criteria.', 'Accepting, declining, countering, or sending communications requires explicit professional approval.'], evidenceIds: unique(rows.flatMap((row) => row.evidenceIds)) };
}

/** The graph describes recorded facts and links, with validity dates and source-use constraints. */
export function buildDecisionGraph(workspace: Workspace): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [], edges: GraphEdge[] = [];
  const bySource = new Map(workspace.sources.map((source) => [source.id, source]));
  const confidence = (ids: string[]) => ids.length ? Math.min(...ids.map((id) => bySource.get(id)?.confidence ?? 0)) : 1;
  const node = (id: string, type: string, label: string, sourceIds: string[], validFrom = workspace.asOf, validTo?: string) => nodes.push({ id, type, label, sourceIds: unique(sourceIds), validFrom, ...(validTo ? { validTo } : {}), confidence: confidence(sourceIds) });
  const edge = (from: string, to: string, relation: string, sourceIds: string[], validFrom = workspace.asOf) => edges.push({ id: calculationChecksum({ from, to, relation, validFrom }), from, to, relation, sourceIds: unique(sourceIds), validFrom, confidence: confidence(sourceIds) });
  for (const source of workspace.sources) node(source.id, 'source', `${source.label} · ${source.license}`, [source.id], source.observedAt);
  for (const property of workspace.properties) {
    node(property.id, 'property', property.address, [property.sourceId], property.listedAt);
    edge(property.id, property.sourceId, 'supported_by', [property.sourceId], property.listedAt);
    property.history.forEach((event, index) => {
      const id = `${property.id}:event:${index}`;
      node(id, 'listing-event', `${event.event}${event.price ? ` · $${event.price.toLocaleString('en-US')}` : ''}`, [property.sourceId], event.date, property.history[index + 1]?.date);
      edge(property.id, id, 'recorded_event', [property.sourceId], event.date);
    });
  }
  for (const client of workspace.clients) {
    node(client.id, 'client', client.name, [], client.timeline[0]?.date ?? workspace.asOf);
    for (const propertyId of client.savedPropertyIds) edge(client.id, propertyId, 'saved_interest', [], workspace.asOf);
    client.timeline.forEach((event, index) => {
      const id = `${client.id}:interaction:${index}`;
      node(id, 'interaction', event.note, [], event.date); edge(client.id, id, 'recorded_interaction', [], event.date);
    });
    for (const task of client.followUps || []) {
      const sourceIds = workspace.properties.filter(property => property.id === task.propertyId).map(property => property.sourceId);
      node(task.id, 'client-follow-up', `Manual reminder · ${task.title} · ${task.status}`, sourceIds, task.createdAt, task.completedAt);
      edge(client.id, task.id, 'has_follow_up', sourceIds, task.createdAt);
      if (task.propertyId) edge(task.id, task.propertyId, 'reminder_concerns_property', sourceIds, task.createdAt);
    }
  }
  for (const search of workspace.savedSearches) { node(search.id, 'saved-search', search.name, [], search.createdAt); if (search.clientId) edge(search.clientId, search.id, 'saved_objective_criteria', [], search.createdAt); }
  for (const alert of workspace.alerts) {
    node(alert.id, 'evidence-alert', alert.title, alert.sourceIds, alert.createdAt);
    if (alert.propertyId) edge(alert.id, alert.propertyId, 'flags_evidence_for_review', alert.sourceIds, alert.createdAt);
    if (alert.searchId) edge(alert.id, alert.searchId, 'matches_saved_criteria', alert.sourceIds, alert.createdAt);
    if (alert.clientId) edge(alert.id, alert.clientId, 'suggests_client_review', alert.sourceIds, alert.createdAt);
  }
  for (const cma of workspace.cmas) {
    // Archived/minimal provider facts remain graph evidence even without a fabricated full listing record.
    const snapshot = cma.result.inputSnapshot;
    const admittedIds = new Set([cma.propertyId, ...cma.result.comps.map((comp) => comp.propertyId)]);
    const observations = snapshot ? [snapshot.subject, ...snapshot.candidates].filter((property) => admittedIds.has(property.id)) : [];
    for (const observation of observations) {
      if (nodes.some((existing) => existing.id === observation.id)) continue;
      node(observation.id, 'property-observation', observation.address, [observation.sourceId], cma.result.asOf);
      edge(observation.id, observation.sourceId, 'supported_by', [observation.sourceId], cma.result.asOf);
      const history = observation.history?.filter((event) => Number.isFinite(Date.parse(event.date)) && Date.parse(event.date) <= Date.parse(cma.result.asOf)) ?? [];
      if (history.length) history.forEach((event, index) => {
        const id = `${observation.id}:observation-event:${index}`;
        node(id, 'recorded-event', event.event, [observation.sourceId], event.date);
        edge(observation.id, id, 'recorded_event', [observation.sourceId], event.date);
      });
      else if (observation.status === 'sold' && observation.soldAt && observation.soldPrice && Date.parse(observation.soldAt) <= Date.parse(cma.result.asOf)) {
        const id = `${observation.id}:recorded-sale:${calculationChecksum({ date: observation.soldAt, price: observation.soldPrice })}`;
        node(id, 'recorded-event', `Source-reported closing · $${observation.soldPrice.toLocaleString('en-US')}`, [observation.sourceId], observation.soldAt);
        edge(observation.id, id, 'recorded_event', [observation.sourceId], observation.soldAt);
      }
    }
    node(cma.id, 'valuation', `${cma.name} · ${cma.result.calculationHash}`, cma.result.sourceIds, cma.result.asOf);
    edge(cma.id, cma.propertyId, 'estimates', cma.result.sourceIds, cma.result.asOf);
    for (const comp of cma.result.comps) edge(cma.id, comp.propertyId, 'uses_comparable', cma.result.sourceIds, cma.result.asOf);
  }
  for (const offer of workspace.offers) {
    const sourceIds = workspace.properties.find((property) => property.id === offer.propertyId)?.sourceId;
    node(offer.id, 'offer', `Recorded offer · $${offer.price.toLocaleString('en-US')}`, sourceIds ? [sourceIds] : [], workspace.asOf, offer.expiresAt);
    edge(offer.id, offer.propertyId, 'offers_on', sourceIds ? [sourceIds] : []);
  }
  for (const transaction of workspace.transactions) {
    node(transaction.id, 'transaction', `${transaction.stage} transaction`, [], workspace.asOf);
    edge(transaction.id, transaction.propertyId, 'concerns_property', []); edge(transaction.id, transaction.clientId, 'represents_client', []);
    for (const milestone of transaction.milestones) {
      node(milestone.id, 'milestone', milestone.title, milestone.sourceId ? [milestone.sourceId] : [], milestone.dueAt);
      edge(transaction.id, milestone.id, 'requires', milestone.sourceId ? [milestone.sourceId] : []);
    }
  }
  for (const document of workspace.documents) {
    node(document.id, 'document', document.name, [], document.uploadedAt); edge(document.id, document.transactionId, 'documents_transaction', [], document.uploadedAt);
  }
  for (const outcome of workspace.outcomes) {
    node(outcome.id, 'outcome', `Observed closing · $${outcome.actualPrice.toLocaleString('en-US')}`, workspace.properties.filter((property) => property.id === outcome.propertyId).map((property) => property.sourceId), outcome.observedAt);
    edge(outcome.id, outcome.cmaId, 'evaluates_forecast', [], outcome.observedAt); edge(outcome.id, outcome.propertyId, 'observed_on', [], outcome.observedAt);
  }
  for (const approval of workspace.approvals) {
    node(approval.id, 'approval', `${approval.kind} · ${approval.status}`, [], approval.createdAt);
    edge(approval.id, approval.entityId, 'professional_review', [], approval.approvedAt ?? approval.createdAt);
  }
  const ids = new Set(nodes.map((item) => item.id));
  return { nodes, edges: edges.filter((item) => ids.has(item.from) && ids.has(item.to)) };
}

export function detectMarketChanges(previous: Workspace, current: Workspace, asOf = current.asOf): Alert[] {
  timestamp(asOf, 'Alert as-of');
  const alerts: Alert[] = [];
  const seen = new Set([...previous.alerts, ...current.alerts].map((alert) => alert.fingerprint));
  const emit = (property: Property, title: string, explanation: string, event: unknown, sourceIds: string[]) => {
    const fingerprint = calculationChecksum({ propertyId: property.id, event });
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);
    alerts.push({ id: `alert-${fingerprint}`, propertyId: property.id, title, explanation, severity: 'review', sourceIds: unique(sourceIds), createdAt: asOf, read: false, fingerprint });
  };
  for (const property of current.properties) {
    const old = previous.properties.find((candidate) => candidate.id === property.id);
    if (!old) continue;
    if (old.status !== property.status) emit(property, 'Recorded listing status changed', `${property.address} changed from ${old.status} to ${property.status}. Review competition and active workflows; this observation does not establish a price effect.`, { status: property.status, previous: old.status }, [old.sourceId, property.sourceId]);
    const nextCma = [...current.cmas].reverse().find((cma) => cma.propertyId === property.id)?.result;
    const oldCma = [...previous.cmas].reverse().find((cma) => cma.propertyId === property.id)?.result;
    if (old.price !== property.price && nextCma && (property.price < nextCma.low || property.price > nextCma.high)) emit(property, 'Asking price moved outside comparable evidence', `The recorded asking price changed by $${round(property.price - old.price).toLocaleString('en-US')} and is outside the $${nextCma.low.toLocaleString('en-US')}–$${nextCma.high.toLocaleString('en-US')} adjusted-comp range. Review assumptions; the range is not a confidence interval.`, { price: property.price, previous: old.price, range: [nextCma.low, nextCma.high] }, [property.sourceId, ...nextCma.sourceIds]);
    if (oldCma && nextCma && (nextCma.low > oldCma.high || nextCma.high < oldCma.low)) emit(property, 'Comparable evidence ranges no longer overlap', `The recomputed adjusted-comp range $${nextCma.low.toLocaleString('en-US')}–$${nextCma.high.toLocaleString('en-US')} no longer overlaps the prior $${oldCma.low.toLocaleString('en-US')}–$${oldCma.high.toLocaleString('en-US')} range. This evidence change warrants professional review, not an automatic price action.`, { oldHash: oldCma.calculationHash, newHash: nextCma.calculationHash }, [...oldCma.sourceIds, ...nextCma.sourceIds]);
  }
  return alerts;
}

export type OutcomeEvaluation = { count: number; meanAbsoluteError: number | null; meanAbsolutePercentError: number | null; meanSignedError: number | null; rootMeanSquaredError: number | null; empiricalRangeCoverage: number | null; samples: { outcomeId: string; cmaId: string; predicted: number; actual: number; signedError: number; absolutePercentError: number; inRange: boolean; evidenceIds: string[] }[]; excluded: { outcomeId: string; reason: string }[]; warnings: string[] };
export function evaluateOutcomes(cmas: CmaRecord[], outcomes: Outcome[]): OutcomeEvaluation {
  const samples: OutcomeEvaluation['samples'] = [], excluded: OutcomeEvaluation['excluded'] = [], seen = new Set<string>();
  for (const outcome of outcomes) {
    const cma = cmas.find((record) => record.id === outcome.cmaId);
    let reason = '';
    if (!cma) reason = 'No matching frozen CMA.';
    else if (cma.propertyId !== outcome.propertyId || cma.result.subjectId !== outcome.propertyId) reason = 'Forecast and outcome property IDs differ.';
    else if (!Number.isFinite(outcome.actualPrice) || outcome.actualPrice <= 0) reason = 'Actual price must be positive and finite.';
    else if (![cma.result.estimate, cma.result.low, cma.result.high].every((value) => Number.isFinite(value) && value > 0) || cma.result.low > cma.result.high) reason = 'Frozen forecast contains invalid estimate or range values.';
    else if (![outcome.forecastAt, outcome.observedAt, cma.result.asOf, cma.createdAt].every((date) => Number.isFinite(Date.parse(date)))) reason = 'Invalid forecast, creation, or observation timestamp.';
    else if (Date.parse(outcome.forecastAt) >= Date.parse(outcome.observedAt) || Date.parse(cma.result.asOf) >= Date.parse(outcome.observedAt) || Date.parse(cma.createdAt) >= Date.parse(outcome.observedAt)) reason = 'Forecast was not frozen before the outcome; excluded to prevent look-ahead bias.';
    else if (Date.parse(cma.result.asOf) > Date.parse(outcome.forecastAt)) reason = 'CMA uses information later than the declared forecast.';
    else if (seen.has(`${outcome.propertyId}:${outcome.cmaId}`)) reason = 'Duplicate property/forecast outcome; excluded to avoid duplicate weighting.';
    if (reason) { excluded.push({ outcomeId: outcome.id, reason }); continue; }
    seen.add(`${outcome.propertyId}:${outcome.cmaId}`);
    const result = cma!.result, signedError = result.estimate - outcome.actualPrice;
    samples.push({ outcomeId: outcome.id, cmaId: cma!.id, predicted: result.estimate, actual: outcome.actualPrice, signedError,
      absolutePercentError: round(Math.abs(signedError) / outcome.actualPrice * 100, 4), inRange: outcome.actualPrice >= result.low && outcome.actualPrice <= result.high,
      evidenceIds: unique([outcome.id, cma!.id, outcome.propertyId, ...result.sourceIds]) });
  }
  const n = samples.length;
  return { count: n, meanAbsoluteError: n ? round(samples.reduce((sum, sample) => sum + Math.abs(sample.signedError), 0) / n, 2) : null,
    meanAbsolutePercentError: n ? round(samples.reduce((sum, sample) => sum + sample.absolutePercentError, 0) / n, 4) : null,
    meanSignedError: n ? round(samples.reduce((sum, sample) => sum + sample.signedError, 0) / n, 2) : null,
    rootMeanSquaredError: n ? round(Math.sqrt(samples.reduce((sum, sample) => sum + sample.signedError ** 2, 0) / n), 2) : null,
    empiricalRangeCoverage: n ? round(samples.filter((sample) => sample.inRange).length / n * 100, 2) : null, samples, excluded,
    warnings: ['Retrospective descriptive metrics, not evidence of causal improvement or guaranteed future accuracy.', 'Closed-sale outcomes are selected observations: unsold, withdrawn, missing, and unlicensed outcomes can create selection and survivorship bias.', 'Use a prospectively frozen cohort, time-based holdouts, market/price-band stratification, missing-outcome accounting, and a paired baseline before claiming improvement.', 'Repeated forecasts of the same property are dependent observations; evaluate one prespecified forecast per property or use property-clustered analysis.', 'Range coverage describes an empirical comparable envelope, not calibrated confidence-interval coverage.', 'Synthetic demo outcomes test evaluation plumbing only; they cannot validate market accuracy.', ...(n < 30 ? ['Fewer than 30 evaluable observations; do not infer statistical calibration or comparative superiority from this sample.'] : [])] };
}
