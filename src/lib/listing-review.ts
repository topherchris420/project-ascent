import type { ListingCheckIn, Property } from './types';

const DAY = 86400000;
export type ListingPhase = 'launch' | 'early' | 'established' | 'extended';
export type ListingSignal = { tone: 'positive' | 'neutral' | 'review'; title: string; detail: string };
export type ListingOption = {
  action: 'hold' | 'refresh' | 'incentive' | 'reposition';
  title: string;
  rationale: string;
  tradeoff: string;
  recommended: boolean;
};
export type IncentiveMath = {
  amount: number;
  rate: number;
  downPercent: number;
  paymentAtList: number;
  paymentAfterReduction: number;
  monthlySavingFromReduction: number;
  buydownRate: number;
  paymentWithBuydown: number;
  monthlySavingFromBuydown: number;
};
export type ListingReview = {
  propertyId: string;
  daysOnMarket: number;
  phase: ListingPhase;
  weeks: number;
  totals: { showings: number; secondShowings: number; offers: number };
  recent: { showingsPerWeek: number; secondShowingRate: number | null; offers: number };
  themes: { theme: string; mentions: number }[];
  signals: ListingSignal[];
  options: ListingOption[];
  incentive: IncentiveMath;
  competingInBand: number;
  nextCheckInDue: string;
  basis: string[];
};

const themePatterns: [string, RegExp][] = [
  ['Price', /\b(price[ds]?|pricey|expensive|overpriced|too high|value|cost)\b/gi],
  ['Condition', /\b(condition|dated|update[ds]?|repairs?|worn|renovat\w*|needs work|tlc)\b/gi],
  ['Layout', /\b(layout|floor ?plan|flow|small rooms?|closets?|storage)\b/gi],
  ['Location', /\b(location|street|noise|noisy|traffic|busy road|commute)\b/gi],
  ['Kitchen & baths', /\b(kitchens?|baths?|bathrooms?)\b/gi],
  ['Outdoor & parking', /\b(yard|garden|parking|garage|driveway|outdoor)\b/gi],
  ['Light & feel', /\b(light|dark|bright|feel|staging|smell)\b/gi],
];

/** Standard fixed-rate amortization payment; principal and interest only. */
export function monthlyPayment(principal: number, annualRatePercent: number, years = 30): number {
  const r = annualRatePercent / 100 / 12,
    n = years * 12;
  if (principal <= 0) return 0;
  return r === 0 ? principal / n : (principal * r) / (1 - (1 + r) ** -n);
}

export function incentiveMath(price: number, amount: number, rate: number, downPercent = 20): IncentiveMath {
  const loan = (value: number) => value * (1 - downPercent / 100);
  const paymentAtList = monthlyPayment(loan(price), rate);
  const paymentAfterReduction = monthlyPayment(loan(price - amount), rate);
  // Broker rule of thumb: each point (1% of the loan) buys roughly 0.25 percentage points of rate.
  const points = (amount / loan(price)) * 100;
  const buydownRate = Math.max(0, rate - points * 0.25);
  const paymentWithBuydown = monthlyPayment(loan(price), buydownRate);
  const r = (value: number) => Math.round(value);
  return {
    amount: r(amount),
    rate,
    downPercent,
    paymentAtList: r(paymentAtList),
    paymentAfterReduction: r(paymentAfterReduction),
    monthlySavingFromReduction: r(paymentAtList - paymentAfterReduction),
    buydownRate: Number(buydownRate.toFixed(3)),
    paymentWithBuydown: r(paymentWithBuydown),
    monthlySavingFromBuydown: r(paymentAtList - paymentWithBuydown),
  };
}

export function feedbackThemes(feedback: string[]): { theme: string; mentions: number }[] {
  const text = feedback.join('\n');
  return themePatterns
    .map(([theme, pattern]) => ({ theme, mentions: text.match(pattern)?.length ?? 0 }))
    .filter(item => item.mentions > 0)
    .sort((a, b) => b.mentions - a.mentions);
}

export function reviewListing(
  property: Property,
  checkIns: ListingCheckIn[],
  context: {
    asOf: string;
    competingActive?: Property[];
    range?: { low: number; moderate: number; high: number };
    rate?: number;
  },
): ListingReview {
  const asOf = Date.parse(context.asOf);
  const own = checkIns
    .filter(item => item.propertyId === property.id)
    .sort((a, b) => Date.parse(a.weekOf) - Date.parse(b.weekOf));
  const daysOnMarket = Math.max(property.dom, Math.floor((asOf - Date.parse(property.listedAt)) / DAY));
  const phase: ListingPhase =
    daysOnMarket <= 14 ? 'launch' : daysOnMarket <= 30 ? 'early' : daysOnMarket <= 60 ? 'established' : 'extended';
  const sum = (items: ListingCheckIn[], key: 'showings' | 'secondShowings' | 'offers') =>
    items.reduce((total, item) => total + item[key], 0);
  const recentWindow = own.slice(-2);
  const recentShowings = sum(recentWindow, 'showings');
  const recent = {
    showingsPerWeek: recentWindow.length ? Number((recentShowings / recentWindow.length).toFixed(1)) : 0,
    secondShowingRate: recentShowings
      ? Number((sum(recentWindow, 'secondShowings') / recentShowings).toFixed(2))
      : null,
    offers: sum(recentWindow, 'offers'),
  };
  const totals = {
    showings: sum(own, 'showings'),
    secondShowings: sum(own, 'secondShowings'),
    offers: sum(own, 'offers'),
  };
  const themes = feedbackThemes(own.map(item => item.feedback));
  const competingInBand = (context.competingActive ?? []).filter(
    other => other.id !== property.id && other.status === 'active' && Math.abs(other.price / property.price - 1) <= 0.1,
  ).length;
  const signals: ListingSignal[] = [];
  const priceThemes = themes.find(item => item.theme === 'Price')?.mentions ?? 0;
  const conditionThemes = themes.find(item => item.theme === 'Condition')?.mentions ?? 0;
  const lowTraffic = own.length >= 2 && recent.showingsPerWeek < 2;
  const visitsWithoutReturn =
    recent.showingsPerWeek >= 3 && recent.secondShowingRate !== null && recent.secondShowingRate < 0.15;
  const returnWithoutOffers = sum(recentWindow, 'secondShowings') >= 2 && recent.offers === 0;
  const aboveRange = context.range && property.price > context.range.high;

  if (!own.length)
    signals.push({
      tone: 'neutral',
      title: 'No check-ins yet',
      detail: 'Record showings, second showings, offers and feedback each week to build the response record.',
    });
  if (totals.offers > 0)
    signals.push({
      tone: 'positive',
      title: `${totals.offers} offer${totals.offers === 1 ? '' : 's'} recorded`,
      detail: 'Compare terms side by side in the Offer room before advising.',
    });
  if (lowTraffic)
    signals.push({
      tone: 'review',
      title: 'Low showing traffic',
      detail: `${recent.showingsPerWeek} showings a week over the last ${recentWindow.length} check-ins. Buyers are not choosing to visit, which usually points to price position or listing visibility.`,
    });
  if (visitsWithoutReturn)
    signals.push({
      tone: 'review',
      title: 'Visits without return interest',
      detail: `${Math.round((recent.secondShowingRate ?? 0) * 100)}% of recent showings led to a second visit. Buyers come but don't come back — often presentation or condition relative to price.`,
    });
  if (returnWithoutOffers)
    signals.push({
      tone: 'review',
      title: 'Second showings, no offers',
      detail:
        'Buyers are seriously considering it but not writing. They may be stretching at this price band or comparing alternatives.',
    });
  if (own.length >= 2 && own.at(-1)!.showings < own.at(-2)!.showings * 0.6)
    signals.push({
      tone: 'review',
      title: 'Traffic falling',
      detail: `Showings fell from ${own.at(-2)!.showings} to ${own.at(-1)!.showings} week over week.`,
    });
  if (aboveRange)
    signals.push({
      tone: 'review',
      title: 'Asking price above the adjusted-comp range',
      detail: `Listed at $${property.price.toLocaleString('en-US')}, above the observed high of $${context.range!.high.toLocaleString('en-US')}.`,
    });
  if (competingInBand >= 3)
    signals.push({
      tone: 'neutral',
      title: `${competingInBand} competing actives within ±10% of price`,
      detail: 'Buyers in this band have alternatives; differentiation matters more.',
    });
  if (own.length && !signals.some(signal => signal.tone === 'review'))
    signals.push({
      tone: 'positive',
      title: 'Response on track',
      detail: 'No warning patterns in the recorded check-ins.',
    });

  const reductionTarget = context.range
    ? Math.min(property.price * 0.97, Math.max(context.range.moderate, context.range.low))
    : property.price * 0.97;
  const reduction = Math.max(0, Math.round((property.price - reductionTarget) / 1000) * 1000);
  const incentive = incentiveMath(property.price, Math.round((property.price * 0.01) / 500) * 500, context.rate ?? 6.5);
  const late = phase === 'established' || phase === 'extended';
  // Offers in hand turn the conversation to negotiation; nothing else should be suggested over them.
  const offersInHand = recent.offers > 0;
  const shouldReposition = !offersInHand && Boolean((lowTraffic && late) || priceThemes >= 2 || aboveRange);
  const shouldRefresh = !offersInHand && (visitsWithoutReturn || conditionThemes >= 2);
  const shouldIncent = !offersInHand && returnWithoutOffers && !shouldReposition;
  const shouldHold = !shouldReposition && !shouldRefresh && !shouldIncent;
  const options: ListingOption[] = [
    {
      action: 'hold',
      title: 'Hold price and strategy',
      rationale:
        totals.offers > 0
          ? 'Offers are arriving; let the market work and negotiate terms.'
          : phase === 'launch' || phase === 'early'
            ? 'Early in the listing; give the market another week of data.'
            : 'No warning pattern in the recorded response.',
      tradeoff: 'Every additional week on market is visible to buyers and can soften negotiating leverage.',
      recommended: shouldHold,
    },
    {
      action: 'refresh',
      title: 'Refresh presentation',
      rationale: conditionThemes
        ? `Feedback mentions condition ${conditionThemes} time${conditionThemes === 1 ? '' : 's'}. Address repairs, staging or photos before touching price.`
        : 'Visitors are not returning. Revisit staging, photos and pre-listing repairs.',
      tradeoff: 'Costs time and money up front; does not fix a price-band mismatch.',
      recommended: shouldRefresh,
    },
    {
      action: 'incentive',
      title: `Offer a $${incentive.amount.toLocaleString('en-US')} buyer credit`,
      rationale: `Used as a rate buydown it cuts the buyer's payment about $${incentive.monthlySavingFromBuydown}/mo; the same amount off the price saves about $${incentive.monthlySavingFromReduction}/mo.`,
      tradeoff:
        'Keeps the headline price, but the credit reduces seller net dollar for dollar and lender limits apply.',
      recommended: shouldIncent,
    },
    {
      action: 'reposition',
      title: reduction
        ? `Reposition toward $${(property.price - reduction).toLocaleString('en-US')}`
        : 'Reposition price',
      rationale: aboveRange
        ? 'The asking price sits above every adjusted comparable.'
        : priceThemes >= 2
          ? `Feedback mentions price ${priceThemes} times.`
          : 'Traffic is low for this stage of the listing.',
      tradeoff:
        'A reduction resets buyer attention but lowers the ceiling for negotiation and is recorded in listing history.',
      recommended: shouldReposition,
    },
  ];
  const last = own.at(-1);
  const nextCheckInDue = new Date((last ? Date.parse(last.weekOf) : Date.parse(property.listedAt)) + 7 * DAY)
    .toISOString()
    .slice(0, 10);
  return {
    propertyId: property.id,
    daysOnMarket,
    phase,
    weeks: own.length,
    totals,
    recent,
    themes,
    signals,
    options,
    incentive,
    competingInBand,
    nextCheckInDue,
    basis: [
      'Signals use your recorded counts and feedback only; no buyer behavior is inferred.',
      'Thresholds (2 showings/week, 15% second-showing rate, ±10% price band) are broker rules of thumb, not fitted models.',
      `Payments assume ${incentive.downPercent}% down, a 30-year fixed loan at ${incentive.rate}% and roughly 0.25 points of rate per point of loan bought down.`,
    ],
  };
}
