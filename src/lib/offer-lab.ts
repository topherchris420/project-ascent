import { z } from 'zod';
import { calculationChecksum } from './analytics';
import { cents, mortgagePayment } from './homeowner-finance';
import { saleNetBeforePayoff } from './selling-costs';

/**
 * The homeowner Offer Lab: deterministic arithmetic over offer terms a homeowner enters, for a seller comparing
 * offers received or a buyer comparing offers they might make. It never scores, ranks or predicts: there is no
 * closing probability, buyer reliability score, appraisal outcome, loan approval or legal reading here. Every figure
 * says whether it is an entered term, an assumption or a calculation, and missing terms stay missing.
 *
 * Seller proceeds use the same sale arithmetic as the Home Decision Brief and the homeowner workbench; buyer
 * payments use the workbench's fixed-rate mortgage formula, so the three never disagree about the same inputs.
 */
export const OFFER_LAB_VERSION = 'ascent-offer-lab-1';
export const MAX_OFFERS = 6;
export const offerSides = ['seller', 'buyer'] as const;
export type OfferSide = (typeof offerSides)[number];
export const financingTypes = ['cash', 'conventional', 'fha', 'va', 'usda', 'other', 'unknown'] as const;
export const financingLabels: Record<(typeof financingTypes)[number], string> = {
  cash: 'Cash',
  conventional: 'Conventional loan',
  fha: 'FHA loan',
  va: 'VA loan',
  usda: 'USDA loan',
  other: 'Other financing',
  unknown: 'Not stated',
};
export const contingencyKeys = ['inspection', 'appraisal', 'financing', 'homeSale'] as const;
export type ContingencyKey = (typeof contingencyKeys)[number];
export const contingencyLabels: Record<ContingencyKey, string> = {
  inspection: 'Home inspection',
  appraisal: 'Appraisal',
  financing: 'Financing',
  homeSale: 'Sale of the buyer’s home',
};

const dollars = z.number().min(0).max(100_000_000).nullable();
const percent = (max: number) => z.number().min(0).max(max).nullable();
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(value => Number.isFinite(Date.parse(`${value}T00:00:00Z`)), 'Enter a real date.');
const contingency = z
  .object({
    /** true included, false waived, null not stated in the offer. */
    included: z.boolean().nullable(),
    days: z.number().int().min(0).max(365).nullable(),
  })
  .strict();
export const offerSchema = z
  .object({
    id: z.string().regex(/^offer-[a-z0-9]{1,24}$/),
    label: z.string().trim().min(1).max(60),
    /** Whether the terms were copied from a written offer or are a what-if the homeowner is exploring. */
    basis: z.enum(['written-offer', 'what-if']),
    price: z.number().min(1000).max(100_000_000).nullable(),
    escalationCap: dollars,
    earnestMoney: dollars,
    earnestDueDays: z.number().int().min(0).max(60).nullable(),
    financing: z.enum(financingTypes),
    downPaymentPercent: percent(100),
    interestRate: percent(30),
    loanTermMonths: z.number().int().min(12).max(480).nullable(),
    sellerCredit: dollars,
    sellerPaidCosts: dollars,
    appraisalGapCoverage: dollars,
    contingencies: z
      .object(
        Object.fromEntries(contingencyKeys.map(key => [key, contingency])) as Record<
          ContingencyKey,
          typeof contingency
        >,
      )
      .strict(),
    closingDate: day.nullable(),
    offerExpires: day.nullable(),
    rentBackDays: z.number().int().min(0).max(180).nullable(),
    otherTerms: z.string().max(1500),
  })
  .strict()
  .refine(offer => offer.escalationCap === null || offer.price === null || offer.escalationCap >= offer.price, {
    message: 'An escalation cap cannot be below the offered price.',
    path: ['escalationCap'],
  })
  .refine(offer => offer.price === null || (offer.earnestMoney ?? 0) <= offer.price, {
    message: 'Earnest money cannot exceed the price.',
    path: ['earnestMoney'],
  })
  .refine(offer => offer.financing !== 'cash' || (offer.downPaymentPercent ?? 100) === 100, {
    message: 'A cash offer has no loan; leave the down payment at 100% or blank.',
    path: ['downPaymentPercent'],
  });
export type LabOffer = z.infer<typeof offerSchema>;
export const settingsSchema = z
  .object({
    side: z.enum(offerSides),
    /** The day deadlines and carrying costs are counted from. */
    asOf: day,
    /** The acceptance date the homeowner assumes; contingency periods usually run from acceptance. */
    assumedAcceptance: day.nullable(),
    commissionPercent: percent(25),
    closingPercent: percent(25),
    mortgagePayoff: dollars,
    monthlyCarryingCost: dollars,
    buyerClosingPercent: percent(25),
    monthlyTax: dollars,
    monthlyInsurance: dollars,
    monthlyHoa: dollars,
    cashAvailable: dollars,
  })
  .strict()
  .refine(s => (s.commissionPercent ?? 0) + (s.closingPercent ?? 0) < 100, {
    message: 'Combined sale percentages must be below 100%.',
  });
export type LabSettings = z.infer<typeof settingsSchema>;
export const offerLabSchema = z
  .object({
    version: z.literal(OFFER_LAB_VERSION),
    propertyKey: z.string().max(80),
    settings: settingsSchema,
    offers: z.array(offerSchema).max(MAX_OFFERS),
    referenceOfferId: z.string().max(40).nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict()
  .refine(lab => new Set(lab.offers.map(offer => offer.id)).size === lab.offers.length, {
    message: 'Offer identifiers must be unique.',
  });
export type OfferLab = z.infer<typeof offerLabSchema>;

export function blankOffer(index: number, side: OfferSide): LabOffer {
  return {
    id: `offer-${index.toString(36)}${Date.now().toString(36).slice(-6)}`.slice(0, 30),
    label: side === 'seller' ? `Offer ${String.fromCharCode(65 + (index % 26))}` : `Option ${index + 1}`,
    basis: side === 'seller' ? 'written-offer' : 'what-if',
    price: null,
    escalationCap: null,
    earnestMoney: null,
    earnestDueDays: null,
    financing: 'unknown',
    downPaymentPercent: null,
    interestRate: null,
    loanTermMonths: null,
    sellerCredit: null,
    sellerPaidCosts: null,
    appraisalGapCoverage: null,
    contingencies: {
      inspection: { included: null, days: null },
      appraisal: { included: null, days: null },
      financing: { included: null, days: null },
      homeSale: { included: null, days: null },
    },
    closingDate: null,
    offerExpires: null,
    rentBackDays: null,
    otherTerms: '',
  };
}
/** A new lab starts from the pricing draft's sale costs and payoff, so the lab and the brief share assumptions. */
export function emptyOfferLab(
  propertyKey: string,
  asOf: string,
  side: OfferSide = 'seller',
  draft?: { commissionPercent: number; closingPercent: number; payoff: number },
): OfferLab {
  return {
    version: OFFER_LAB_VERSION,
    propertyKey,
    settings: {
      side,
      asOf,
      assumedAcceptance: null,
      commissionPercent: draft?.commissionPercent ?? null,
      closingPercent: draft?.closingPercent ?? null,
      mortgagePayoff: draft && draft.payoff > 0 ? draft.payoff : null,
      monthlyCarryingCost: null,
      buyerClosingPercent: null,
      monthlyTax: null,
      monthlyInsurance: null,
      monthlyHoa: null,
      cashAvailable: null,
    },
    offers: [],
    referenceOfferId: null,
    updatedAt: `${asOf}T00:00:00.000Z`,
  };
}

export type FigureKind = 'entered' | 'assumption' | 'calculation';
export type OfferFigure = {
  key: string;
  label: string;
  value: number | null;
  text: string;
  kind: FigureKind;
  /** How a calculation was made, in words a homeowner can check with a calculator. */
  formula: string;
};
export type OfferDeadline = {
  key: string;
  label: string;
  date: string | null;
  basis: 'entered' | 'calculated' | 'missing';
  note: string;
};
export type OfferAnalysis = {
  offerId: string;
  label: string;
  basis: LabOffer['basis'];
  /** The side's headline figure can be computed from what was entered. */
  complete: boolean;
  missing: string[];
  figures: OfferFigure[];
  headline: OfferFigure | null;
  deadlines: OfferDeadline[];
  contingencies: {
    key: ContingencyKey;
    label: string;
    status: 'included' | 'waived' | 'not stated';
    days: number | null;
  }[];
  notes: string[];
};

const usd = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
const signedUsd = (value: number) => `${value < 0 ? '−' : '+'}${usd(Math.abs(value))}`;
const DAY_MS = 86_400_000;
const addDays = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
const longDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
const figure = (
  key: string,
  label: string,
  value: number | null,
  kind: FigureKind,
  formula: string,
  text?: string,
): OfferFigure => ({
  key,
  label,
  value: value === null ? null : cents(value),
  text: value === null ? 'Not entered' : (text ?? usd(value)),
  kind,
  formula,
});

/** Days a closing on this date is from the as-of day; null when no closing date was entered. */
const daysToClose = (offer: LabOffer, settings: LabSettings) =>
  offer.closingDate ? Math.max(0, daysBetween(settings.asOf, offer.closingDate)) : null;

function sellerFigures(offer: LabOffer, settings: LabSettings) {
  const missing: string[] = [];
  if (offer.price === null) missing.push('Offered price');
  if (settings.commissionPercent === null) missing.push('Agent commission you pay (%)');
  if (settings.closingPercent === null) missing.push('Your closing costs and transfer taxes (%)');
  const credit = offer.sellerCredit ?? 0;
  const other = offer.sellerPaidCosts ?? 0;
  const figures: OfferFigure[] = [
    figure('price', 'Offered price', offer.price, 'entered', 'As written in the offer.'),
    figure('credit', 'Credit to the buyer', offer.sellerCredit, 'entered', 'Seller credit or concession, as written.'),
    figure(
      'otherCosts',
      'Other costs you agreed to pay',
      offer.sellerPaidCosts,
      'entered',
      'For example a home warranty or the buyer’s agent fee, as written.',
    ),
  ];
  let net: number | null = null;
  if (offer.price !== null && settings.commissionPercent !== null && settings.closingPercent !== null) {
    const costs = {
      commissionPercent: settings.commissionPercent,
      closingPercent: settings.closingPercent,
      concessions: credit + other,
    };
    net = saleNetBeforePayoff(offer.price, costs);
    figures.push(
      figure(
        'commission',
        'Agent commission',
        (offer.price * settings.commissionPercent) / 100,
        'calculation',
        `${settings.commissionPercent}% of the price (your assumption).`,
      ),
      figure(
        'closing',
        'Closing costs and transfer taxes',
        (offer.price * settings.closingPercent) / 100,
        'calculation',
        `${settings.closingPercent}% of the price (your assumption).`,
      ),
      figure(
        'net',
        'Proceeds before paying off your mortgage',
        net,
        'calculation',
        'Price − commission − closing costs − credit − other costs you pay.',
      ),
    );
  }
  const payoff = settings.mortgagePayoff;
  let proceeds: number | null = null;
  if (net !== null) {
    proceeds = net - (payoff ?? 0);
    figures.push(
      figure(
        'proceeds',
        payoff === null
          ? 'Estimated proceeds (no mortgage payoff entered)'
          : 'Estimated proceeds after your mortgage payoff',
        proceeds,
        'calculation',
        payoff === null
          ? 'No payoff was entered, so none is subtracted.'
          : `Proceeds before payoff − ${usd(payoff)} payoff (your assumption).`,
      ),
    );
  }
  const days = daysToClose(offer, settings);
  if (proceeds !== null && settings.monthlyCarryingCost !== null && days !== null) {
    const carrying = (settings.monthlyCarryingCost * days * 12) / 365;
    figures.push(
      figure(
        'carrying',
        `Carrying costs until closing (${days} days)`,
        carrying,
        'calculation',
        `${usd(settings.monthlyCarryingCost)} a month × ${days} days ÷ (365 ÷ 12).`,
      ),
      figure(
        'afterCarrying',
        'Proceeds after carrying costs to closing',
        proceeds - carrying,
        'calculation',
        'Estimated proceeds − carrying costs until the entered closing date.',
      ),
    );
  }
  if (
    offer.escalationCap !== null &&
    net !== null &&
    settings.commissionPercent !== null &&
    settings.closingPercent !== null
  ) {
    const atCap =
      saleNetBeforePayoff(offer.escalationCap, {
        commissionPercent: settings.commissionPercent,
        closingPercent: settings.closingPercent,
        concessions: credit + other,
      }) - (payoff ?? 0);
    figures.push(
      figure(
        'atCap',
        'Proceeds before carrying costs if the price escalated to its cap',
        atCap,
        'calculation',
        `The same arithmetic at the ${usd(offer.escalationCap)} cap. Whether it escalates depends on other offers and the clause’s wording.`,
      ),
    );
  }
  const headline =
    figures.find(item => item.key === 'afterCarrying') ?? figures.find(item => item.key === 'proceeds') ?? null;
  return { figures, missing, headline, net, proceeds };
}

function buyerFigures(offer: LabOffer, settings: LabSettings) {
  const missing: string[] = [];
  if (offer.price === null) missing.push('Offer price');
  const cash = offer.financing === 'cash';
  if (!cash && offer.downPaymentPercent === null) missing.push('Down payment (%)');
  if (settings.buyerClosingPercent === null) missing.push('Your closing costs (%)');
  const figures: OfferFigure[] = [figure('price', 'Offer price', offer.price, 'entered', 'The price in this option.')];
  if (offer.price === null) return { figures, missing, headline: null, cashToClose: null as number | null };
  const downPercent = cash ? 100 : offer.downPaymentPercent;
  const down = downPercent === null ? null : (offer.price * downPercent) / 100;
  const loan = down === null ? null : offer.price - down;
  figures.push(
    figure(
      'down',
      cash ? 'Cash for the price' : `Down payment (${downPercent ?? '?'}%)`,
      down,
      'calculation',
      cash ? 'The whole price, paid in cash.' : 'Price × down payment percentage.',
    ),
  );
  if (!cash) figures.push(figure('loan', 'Loan amount', loan, 'calculation', 'Price − down payment.'));
  let cashToClose: number | null = null;
  if (down !== null && settings.buyerClosingPercent !== null) {
    const closing = (offer.price * settings.buyerClosingPercent) / 100;
    const credit = offer.sellerCredit ?? 0;
    const applied = Math.min(credit, closing);
    cashToClose = down + closing - applied;
    figures.push(
      figure(
        'closing',
        'Your closing costs',
        closing,
        'calculation',
        `${settings.buyerClosingPercent}% of the price (your assumption).`,
      ),
      figure(
        'credit',
        'Seller credit applied',
        applied,
        'calculation',
        credit > closing
          ? `Your ${usd(credit)} credit is limited to your closing costs here; lenders usually do not pay a credit out in cash. Confirm with your lender.`
          : 'The seller credit you are asking for, as entered.',
      ),
      figure(
        'cashToClose',
        'Estimated cash to close',
        cashToClose,
        'calculation',
        'Down payment + closing costs − seller credit applied. Earnest money is part of this, not in addition.',
      ),
    );
    if (settings.cashAvailable !== null)
      figures.push(
        figure(
          'remaining',
          'Cash left after closing',
          settings.cashAvailable - cashToClose,
          'calculation',
          `${usd(settings.cashAvailable)} available (your entry) − estimated cash to close.`,
        ),
      );
  }
  if (!cash && loan !== null && offer.interestRate !== null && offer.loanTermMonths !== null) {
    const payment = mortgagePayment(loan, offer.interestRate, offer.loanTermMonths);
    figures.push(
      figure(
        'payment',
        'Monthly principal and interest',
        payment,
        'calculation',
        `Fixed-rate loan of ${usd(loan)} at ${offer.interestRate}% over ${offer.loanTermMonths} months (your assumptions), the same formula the homeowner workbench uses.`,
      ),
    );
    const extras = [settings.monthlyTax, settings.monthlyInsurance, settings.monthlyHoa];
    if (extras.some(item => item !== null))
      figures.push(
        figure(
          'housing',
          'Monthly housing payment',
          payment + extras.reduce<number>((total, item) => total + (item ?? 0), 0),
          'calculation',
          'Principal and interest + the monthly tax, insurance and dues you entered. Mortgage insurance is not included.',
        ),
      );
  } else if (!cash) missing.push('Interest rate and loan term (for a monthly payment)');
  if (offer.appraisalGapCoverage !== null)
    figures.push(
      figure(
        'gap',
        'Most you agreed to pay above an appraisal',
        offer.appraisalGapCoverage,
        'entered',
        'If an appraisal came in below the price, this is the most of the difference you said you would cover in cash, on top of the cash to close.',
      ),
    );
  const headline = figures.find(item => item.key === 'cashToClose') ?? null;
  return { figures, missing, headline, cashToClose };
}

function deadlinesFor(offer: LabOffer, settings: LabSettings): OfferDeadline[] {
  const accepted = settings.assumedAcceptance ?? settings.asOf;
  const assumedNote = settings.assumedAcceptance
    ? `days counted from the acceptance date you assumed (${longDay(accepted)})`
    : `days counted from ${longDay(accepted)}, because no acceptance date was assumed`;
  const deadlines: OfferDeadline[] = [];
  deadlines.push(
    offer.offerExpires
      ? {
          key: 'expires',
          label: 'Offer expires',
          date: offer.offerExpires,
          basis: 'entered',
          note: 'As written in the offer.',
        }
      : { key: 'expires', label: 'Offer expires', date: null, basis: 'missing', note: 'No expiration was entered.' },
  );
  if (offer.earnestDueDays !== null)
    deadlines.push({
      key: 'earnest',
      label: 'Earnest money due',
      date: addDays(accepted, offer.earnestDueDays),
      basis: 'calculated',
      note: `${offer.earnestDueDays} ${assumedNote}.`,
    });
  for (const key of contingencyKeys) {
    const term = offer.contingencies[key];
    if (term.included && term.days !== null)
      deadlines.push({
        key,
        label: `${contingencyLabels[key]} contingency ends`,
        date: addDays(accepted, term.days),
        basis: 'calculated',
        note: `${term.days} ${assumedNote}.`,
      });
    else if (term.included)
      deadlines.push({
        key,
        label: `${contingencyLabels[key]} contingency ends`,
        date: null,
        basis: 'missing',
        note: 'Included, but no number of days was entered.',
      });
  }
  deadlines.push(
    offer.closingDate
      ? {
          key: 'closing',
          label: 'Closing',
          date: offer.closingDate,
          basis: 'entered',
          note: 'As written in the offer.',
        }
      : { key: 'closing', label: 'Closing', date: null, basis: 'missing', note: 'No closing date was entered.' },
  );
  if (offer.closingDate && offer.rentBackDays)
    deadlines.push({
      key: 'rentBack',
      label: 'Rent-back ends',
      date: addDays(offer.closingDate, offer.rentBackDays),
      basis: 'calculated',
      note: `${offer.rentBackDays} days after the entered closing date.`,
    });
  return deadlines.sort((a, b) =>
    (a.date ?? '9999') < (b.date ?? '9999') ? -1 : (a.date ?? '9999') > (b.date ?? '9999') ? 1 : 0,
  );
}

export function analyzeOffer(offer: LabOffer, settings: LabSettings): OfferAnalysis {
  const side = settings.side === 'seller' ? sellerFigures(offer, settings) : buyerFigures(offer, settings);
  const missing = [...side.missing];
  if (offer.financing === 'unknown') missing.push('Financing type');
  if (offer.earnestMoney === null) missing.push('Earnest money');
  if (!offer.closingDate) missing.push('Closing date');
  for (const key of contingencyKeys)
    if (offer.contingencies[key].included === null)
      missing.push(`Whether there is a ${contingencyLabels[key].toLowerCase()} contingency`);
  const notes: string[] = [];
  if (offer.financing !== 'cash' && offer.financing !== 'unknown')
    notes.push(
      'A financed offer depends on the lender’s approval and appraisal. Ascent does not estimate whether either will happen; ask about the pre-approval and the lender.',
    );
  if (offer.financing === 'cash') notes.push('A cash offer still needs proof of funds. Ascent does not verify it.');
  if (offer.contingencies.inspection.included === false)
    notes.push(
      'The inspection contingency is waived: the buyer would have no contractual right to withdraw over inspection findings.',
    );
  if (offer.contingencies.appraisal.included === false && offer.financing !== 'cash')
    notes.push(
      'The appraisal contingency is waived on a financed offer: if the appraisal is low, the buyer would need to cover the difference in cash.',
    );
  if (offer.contingencies.homeSale.included) notes.push('This offer depends on the buyer selling another home first.');
  if (offer.earnestMoney !== null && offer.price)
    notes.push(
      `Earnest money is ${((offer.earnestMoney / offer.price) * 100).toFixed(1)}% of the price. Whether and when it can be kept depends on the contract.`,
    );
  if (offer.otherTerms.trim())
    notes.push('Other terms were entered in words. Ascent does not interpret them; a licensed agent or attorney can.');
  return {
    offerId: offer.id,
    label: offer.label,
    basis: offer.basis,
    complete: side.headline !== null && side.headline.value !== null,
    missing,
    figures: side.figures,
    headline: side.headline,
    deadlines: deadlinesFor(offer, settings),
    contingencies: contingencyKeys.map(key => ({
      key,
      label: contingencyLabels[key],
      status:
        offer.contingencies[key].included === null
          ? 'not stated'
          : offer.contingencies[key].included
            ? 'included'
            : 'waived',
      days: offer.contingencies[key].days,
    })),
    notes,
  };
}

/** What the brief says about value, carried in as-is. A declined estimate arrives as null and stays null. */
export type ValueContext = { verdict: 'supported' | 'limited' | 'declined'; estimate: number | null; label: string };

export type OfferComparison = {
  version: typeof OFFER_LAB_VERSION;
  side: OfferSide;
  calculationHash: string;
  referenceOfferId: string | null;
  analyses: OfferAnalysis[];
  differences: {
    offerId: string;
    label: string;
    headlineDifference: number | null;
    /** Price change this offer would need to match the reference's headline figure, all else equal. */
    priceToMatch: number | null;
    closingDaysDifference: number | null;
    termDifferences: string[];
  }[];
  sensitivity: {
    offerId: string;
    label: string;
    rows: { scenario: string; value: number | null; change: number | null }[];
  }[];
  estimate: { stated: boolean; text: string; rows: { offerId: string; label: string; difference: number | null }[] };
  explanation: string[];
  missing: string[];
  boundaries: readonly string[];
};
export const OFFER_LAB_BOUNDARIES = [
  'Arithmetic under the terms and assumptions entered, not advice, a forecast or a legal reading of any offer.',
  'No offer is scored or ranked, and nothing here estimates how likely an offer is to close, appraise or be financed.',
  'Taxes on a gain, moving costs, legal fees and the cost of the next home are not included.',
  'Contracts define how days are counted, what happens to earnest money and what each contingency allows; a licensed agent or real estate attorney should review them.',
  'Ascent never sends, accepts or negotiates an offer.',
] as const;

/** The reference's headline under a price change, used for break-evens and sensitivity. */
function headlineAt(
  offer: LabOffer,
  settings: LabSettings,
  patch: Partial<LabOffer>,
  settingsPatch: Partial<LabSettings> = {},
) {
  const analysis = analyzeOffer({ ...offer, ...patch }, { ...settings, ...settingsPatch });
  return analysis.headline?.value ?? null;
}

export function compareOfferLab(lab: OfferLab, value: ValueContext | null): OfferComparison {
  const parsed = offerLabSchema.parse(lab);
  const { settings, offers } = parsed;
  const analyses = offers.map(offer => analyzeOffer(offer, settings));
  const reference =
    offers.find(offer => offer.id === parsed.referenceOfferId) ??
    offers.find((_, i) => analyses[i].complete) ??
    offers[0] ??
    null;
  const referenceAnalysis = reference ? analyses[offers.indexOf(reference)] : null;
  const seller = settings.side === 'seller';
  const differences = offers
    .filter(offer => offer !== reference)
    .map(offer => {
      const analysis = analyses[offers.indexOf(offer)];
      const mine = analysis.headline?.value ?? null;
      const theirs = referenceAnalysis?.headline?.value ?? null;
      const headlineDifference = mine !== null && theirs !== null ? cents(mine - theirs) : null;
      // Seller proceeds rise by (1 − percentage costs) for each dollar of price; buyer cash to close rises by the
      // down payment plus closing percentages.
      const perDollar = seller
        ? 1 - ((settings.commissionPercent ?? 0) + (settings.closingPercent ?? 0)) / 100
        : (offer.financing === 'cash' ? 1 : (offer.downPaymentPercent ?? 0) / 100) +
          (settings.buyerClosingPercent ?? 0) / 100;
      const priceToMatch =
        headlineDifference !== null && perDollar > 0 && offer.price !== null
          ? cents(-headlineDifference / perDollar)
          : null;
      const termDifferences: string[] = [];
      if (reference) {
        for (const key of contingencyKeys) {
          const a = offer.contingencies[key],
            b = reference.contingencies[key];
          if (a.included !== b.included)
            termDifferences.push(
              `${contingencyLabels[key]} contingency: ${a.included === null ? 'not stated' : a.included ? 'included' : 'waived'} here, ${b.included === null ? 'not stated' : b.included ? 'included' : 'waived'} in ${reference.label}.`,
            );
          else if (a.included && a.days !== b.days && a.days !== null && b.days !== null)
            termDifferences.push(
              `${contingencyLabels[key]} contingency: ${a.days} days here, ${b.days} in ${reference.label}.`,
            );
        }
        if (offer.financing !== reference.financing)
          termDifferences.push(
            `Financing type: ${financingLabels[offer.financing]} here, ${financingLabels[reference.financing]} in ${reference.label}.`,
          );
        if ((offer.rentBackDays ?? 0) !== (reference.rentBackDays ?? 0))
          termDifferences.push(
            `Rent-back: ${offer.rentBackDays ?? 0} days here, ${reference.rentBackDays ?? 0} in ${reference.label}.`,
          );
      }
      const closingDaysDifference =
        offer.closingDate && reference?.closingDate ? daysBetween(reference.closingDate, offer.closingDate) : null;
      return {
        offerId: offer.id,
        label: offer.label,
        headlineDifference,
        priceToMatch,
        closingDaysDifference,
        termDifferences,
      };
    });
  const sensitivity = offers.map((offer, i) => {
    const base = analyses[i].headline?.value ?? null;
    const rows: { scenario: string; value: number | null }[] = [];
    if (offer.price !== null) {
      for (const cut of [1, 3, 5])
        rows.push({
          scenario: `Price renegotiated ${cut}% lower (for example after an inspection or a low appraisal)`,
          value: headlineAt(offer, settings, { price: Math.round(offer.price * (1 - cut / 100)), escalationCap: null }),
        });
      rows.push({
        scenario: `Credit to the buyer ${usd(5000)} higher`,
        value: headlineAt(offer, settings, { sellerCredit: (offer.sellerCredit ?? 0) + 5000 }),
      });
      if (seller && settings.commissionPercent !== null)
        rows.push({
          scenario: 'Commission half a percentage point lower',
          value: headlineAt(offer, settings, {}, { commissionPercent: Math.max(0, settings.commissionPercent - 0.5) }),
        });
      if (seller && offer.closingDate && settings.monthlyCarryingCost !== null)
        rows.push({
          scenario: 'Closing 30 days later than entered',
          value: headlineAt(offer, settings, { closingDate: addDays(offer.closingDate, 30) }),
        });
      if (!seller && offer.financing !== 'cash' && offer.interestRate !== null && offer.loanTermMonths !== null) {
        const payment = (patch: Partial<LabOffer>) =>
          analyzeOffer({ ...offer, ...patch }, settings).figures.find(item => item.key === 'payment')?.value ?? null;
        const now = payment({});
        for (const step of [-1, 1])
          rows.push({
            scenario: `Monthly principal and interest at ${(offer.interestRate + step).toFixed(2)}% (now ${now === null ? 'unknown' : usd(now)})`,
            value: offer.interestRate + step >= 0 ? payment({ interestRate: offer.interestRate + step }) : null,
          });
      }
    }
    return {
      offerId: offer.id,
      label: offer.label,
      rows: rows.map(row => ({
        ...row,
        change:
          row.value !== null && base !== null && !row.scenario.startsWith('Monthly') ? cents(row.value - base) : null,
      })),
    };
  });
  const stated = !!value && value.verdict !== 'declined' && value.estimate !== null;
  const estimate = {
    stated,
    text: !value
      ? 'No Home Decision Brief is connected, so offers are not compared with an estimate.'
      : !stated
        ? 'The Home Decision Brief withholds an estimate for this home, so offers are not compared with one. The recorded sales stay open in the brief.'
        : `Compared with the brief’s comparable-supported estimate of ${usd(value.estimate!)} (${value.label}). An estimate is not an appraisal; a lender’s appraiser may conclude differently.`,
    rows: stated
      ? offers.map(offer => ({
          offerId: offer.id,
          label: offer.label,
          difference: offer.price === null ? null : cents(offer.price - value!.estimate!),
        }))
      : [],
  };
  const headlineLabel = seller ? 'estimated proceeds' : 'estimated cash to close';
  const explanation: string[] = [];
  if (!offers.length)
    explanation.push('Add an offer to compare. Enter only what is written in it; leave anything unknown blank.');
  for (const analysis of analyses) {
    if (analysis.headline?.value !== null && analysis.headline)
      explanation.push(`${analysis.label}: ${headlineLabel} ${analysis.headline.text} — ${analysis.headline.formula}`);
    else
      explanation.push(
        `${analysis.label}: ${headlineLabel} cannot be calculated yet; missing ${analysis.missing.slice(0, 3).join(', ').toLowerCase()}.`,
      );
  }
  for (const difference of differences)
    if (difference.headlineDifference !== null && reference)
      explanation.push(
        `${difference.label} is ${signedUsd(difference.headlineDifference)} in ${headlineLabel} compared with ${reference.label}${
          difference.priceToMatch !== null && Math.abs(difference.priceToMatch) >= 1
            ? `; its price would need to change by ${signedUsd(difference.priceToMatch)} to match, all else equal`
            : ''
        }.`,
      );
  const missing = [...new Set(analyses.flatMap(analysis => analysis.missing))];
  const hashInput = { version: OFFER_LAB_VERSION, settings, offers, value: stated ? value : null };
  return {
    version: OFFER_LAB_VERSION,
    side: settings.side,
    calculationHash: calculationChecksum(hashInput),
    referenceOfferId: reference?.id ?? null,
    analyses,
    differences,
    sensitivity,
    estimate,
    explanation,
    missing,
    boundaries: OFFER_LAB_BOUNDARIES,
  };
}

/** A private, reproducible record of the comparison: every entered term, assumption and result. */
export function offerLabRecord(lab: OfferLab, comparison: OfferComparison, address: string) {
  return {
    format: 'ascent-offer-comparison-record-1',
    privacy: 'Private: contains offer terms and your financial assumptions. Downloaded copies cannot be recalled.',
    property: { key: lab.propertyKey, address },
    exportedAt: new Date().toISOString(),
    lab,
    comparison,
  };
}
