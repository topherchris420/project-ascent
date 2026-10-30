/**
 * Published transfer and recordation taxes on a home sale in the District of Columbia, Montgomery County and Prince
 * George's County. Every rate is quoted from the statute, county code or tax office form named beside it. Ascent
 * applies them to a price; it does not see exemptions other than the ones asked about, the contract's allocation of
 * costs or the settlement statement, so the figures are a starting point to confirm with the title or settlement
 * company.
 */
export const CLOSING_TAXES_CHECKED_ON = '2026-10-30';
export type TaxJurisdiction = 'dc' | 'montgomery' | 'prince-georges';
export const jurisdictionLabels: Record<TaxJurisdiction, string> = {
  dc: 'District of Columbia',
  montgomery: 'Montgomery County, MD',
  'prince-georges': 'Prince George’s County, MD',
};

/** `dc:` and `dc-condos:` homes are in the District; Maryland account IDs start with the county code (16, 17). */
export function jurisdictionFor(propertyKey: string): TaxJurisdiction | null {
  const [market, parcel = ''] = propertyKey.split(':');
  if (market === 'dc' || market === 'dc-condos') return 'dc';
  if (market === 'maryland' && parcel.startsWith('16')) return 'montgomery';
  if (market === 'maryland' && parcel.startsWith('17')) return 'prince-georges';
  return null;
}

export type TaxOptions = {
  /** Maryland: every buyer on the deed is a first-time Maryland homebuyer. Applies only with principalResidence. */
  firstTimeBuyer: boolean;
  /** The buyer will live in the home as a principal residence (Maryland first-time rates, Montgomery exemption). */
  principalResidence: boolean;
};
export type TaxLine = {
  name: string;
  amount: number;
  rate: string;
  /** The seller's share where the law sets one, or null when the contract decides. */
  sellerShare: number | null;
  payer: string;
  source: string;
  url: string;
};
export type ClosingTaxes = {
  jurisdiction: TaxJurisdiction;
  label: string;
  price: number;
  lines: TaxLine[];
  total: number;
  /** Sum of the shares the law assigns to the seller; lines left to the contract are excluded. */
  sellerTotal: number;
  sellerPercent: number;
  notes: string[];
};

const DC_CODE_TRANSFER = 'https://code.dccouncil.gov/us/dc/council/code/sections/47-903';
const DC_CODE_RECORDATION = 'https://code.dccouncil.gov/us/dc/council/code/sections/42-1103';
const MD_STATE_TRANSFER =
  'https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=gtp&section=13-203&enactments=false';
const MD_WHO_PAYS =
  'https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=grp&section=14-104&enactments=false';
const MC_RECORDATION = 'https://codelibrary.amlegal.com/codes/montgomerycounty/latest/montgomeryco_md/0-0-0-150655';
const MC_TRANSFER = 'https://codelibrary.amlegal.com/codes/montgomerycounty/latest/montgomeryco_md/0-0-0-150900';
const PG_AFFIDAVIT =
  'https://www.princegeorgescountymd.gov/sites/default/files/media-document/dcv24302_instructions-for-finance-affidavit-pdf.pdf';

const cents = (value: number) => Math.round(value * 100) / 100;
/** Maryland recordation tax is charged "for each $500 or fraction of $500". */
const per500 = (amount: number) => Math.ceil(amount / 500);

/** Montgomery County Code §52-16B, effective October 1, 2023: $4.45 per $500, plus a premium in each band over $500,000. */
export const MONTGOMERY_RECORDATION_BANDS = [
  { above: 0, perFiveHundred: 4.45 },
  { above: 500_000, perFiveHundred: 6.75 },
  { above: 600_000, perFiveHundred: 10.2 },
  { above: 750_000, perFiveHundred: 10.78 },
  { above: 1_000_000, perFiveHundred: 11.35 },
] as const;

/** Bands stay at the real price; the principal-residence exemption removes the first $100,000 from the lowest band. */
export function montgomeryRecordationTax(price: number, principalResidence: boolean) {
  const consideration = per500(price) * 500;
  const exempt = principalResidence ? 100_000 : 0;
  let tax = 0;
  MONTGOMERY_RECORDATION_BANDS.forEach((band, index) => {
    const next = MONTGOMERY_RECORDATION_BANDS[index + 1]?.above ?? Infinity;
    const from = Math.max(band.above, exempt);
    const taxed = Math.max(0, Math.min(consideration, next) - from);
    tax += (taxed / 500) * band.perFiveHundred;
  });
  return cents(tax);
}

function dcTaxes(price: number): Omit<ClosingTaxes, 'total' | 'sellerTotal' | 'sellerPercent'> {
  const rate = price < 400_000 ? 0.011 : 0.0145;
  const rateText =
    price < 400_000 ? '1.1% of the price (under $400,000)' : '1.45% of the whole price ($400,000 or more)';
  const amount = cents(price * rate);
  return {
    jurisdiction: 'dc',
    label: jurisdictionLabels.dc,
    price,
    lines: [
      {
        name: 'DC deed transfer tax',
        amount,
        rate: rateText,
        sellerShare: amount,
        payer: 'Seller, by law',
        source: 'D.C. Code §47-903: the transferor is responsible for the transfer tax.',
        url: DC_CODE_TRANSFER,
      },
      {
        name: 'DC deed recordation tax',
        amount,
        rate: rateText,
        sellerShare: null,
        payer: 'Set by the contract; buyer and seller are both liable to the District',
        source: 'D.C. Code §42-1103: the parties to the deed are jointly and severally liable.',
        url: DC_CODE_RECORDATION,
      },
    ],
    notes: [
      'Who pays the recordation tax is negotiated in the contract, so it is not counted in the seller’s share here.',
      'A qualifying first-time DC homebuyer pays recordation tax at 0.725% instead: a purchase price up to $794,000 and household income limits effective October 1, 2026 (Form ROD 11, revised October 2026). The whole benefit must go to the buyer, and the seller still pays the full transfer tax. DC updates these limits each October 1.',
    ],
  };
}

function marylandTaxes(
  jurisdiction: 'montgomery' | 'prince-georges',
  price: number,
  { firstTimeBuyer: firstTimeAnswer, principalResidence }: TaxOptions,
): Omit<ClosingTaxes, 'total' | 'sellerTotal' | 'sellerPercent'> {
  // Tax-Property §13-203(b) and Real Property §14-104(c) give the first-time rules only to a buyer who will occupy the
  // home as a principal residence.
  const firstTimeBuyer = firstTimeAnswer && principalResidence;
  const half = (amount: number) => cents(amount / 2);
  // Real Property §14-104: costs are shared equally unless the contract says otherwise; for a first-time buyer the
  // seller pays them all (the state transfer tax without exception).
  const share = (amount: number) => (firstTimeBuyer ? amount : half(amount));
  const sharedPayer = firstTimeBuyer
    ? 'Seller, by Maryland law for a first-time buyer, unless the contract expressly says otherwise'
    : 'Split equally by Maryland law unless the contract says otherwise';
  const stateAmount = cents(price * (firstTimeBuyer ? 0.0025 : 0.005));
  const state: TaxLine = {
    name: 'Maryland state transfer tax',
    amount: stateAmount,
    rate: firstTimeBuyer ? '0.25% (first-time Maryland homebuyer who will live in the home)' : '0.5% of the price',
    sellerShare: share(stateAmount),
    payer: firstTimeBuyer
      ? 'Seller, by Maryland law for a first-time buyer'
      : 'Split equally by Maryland law unless the contract says otherwise',
    source: 'Maryland Tax-Property §13-203 and Real Property §14-104.',
    url: MD_STATE_TRANSFER,
  };
  if (jurisdiction === 'montgomery') {
    const recordation = montgomeryRecordationTax(price, principalResidence);
    const transfer = cents(price * (price >= 70_000 ? 0.01 : price >= 40_000 ? 0.005 : 0.0025));
    return {
      jurisdiction,
      label: jurisdictionLabels[jurisdiction],
      price,
      lines: [
        state,
        {
          name: 'Montgomery County transfer tax',
          amount: transfer,
          rate: price >= 70_000 ? '1% of the price ($70,000 or more)' : 'Under $70,000: 0.25% to 0.5%',
          sellerShare: share(transfer),
          payer: sharedPayer,
          source: 'Montgomery County Code §52-31.',
          url: MC_TRANSFER,
        },
        {
          name: 'Montgomery County recordation tax',
          amount: recordation,
          rate: `$4.45 to $11.35 per $500 by price band${principalResidence ? ', first $100,000 exempt for a principal residence' : ''}`,
          sellerShare: share(recordation),
          payer: sharedPayer,
          source: 'Montgomery County Code §52-16B, rates effective October 1, 2023.',
          url: MC_RECORDATION,
        },
      ],
      notes: [
        'Maryland law splits these taxes equally between buyer and seller unless the contract says otherwise; for a first-time Maryland homebuyer the seller pays them.',
        'The first-time rules need every buyer on the deed to be a first-time Maryland homebuyer who will live in the home (a co-signer who will not live there may join), each stating so under oath (Real Property §14-104(c)(4)–(5)).',
        'The first $100,000 is exempt from Montgomery recordation tax only when the buyer is an individual who will live in the home as a principal residence.',
        'Ascent found no Montgomery first-time-buyer exemption from the county transfer tax in §52-31 or §52-34.',
      ],
    };
  }
  const recordation = cents(per500(price) * 2.75);
  const transfer = cents(price * 0.014);
  return {
    jurisdiction,
    label: jurisdictionLabels[jurisdiction],
    price,
    lines: [
      state,
      {
        name: 'Prince George’s County transfer tax',
        amount: transfer,
        rate: '1.4% of the price',
        sellerShare: share(transfer),
        payer: sharedPayer,
        source: 'Prince George’s County Finance Affidavit instructions: “the current tax rate is 1.4%”.',
        url: PG_AFFIDAVIT,
      },
      {
        name: 'Prince George’s County recordation tax',
        amount: recordation,
        rate: '$2.75 per $500, rounded up to the next $500',
        sellerShare: share(recordation),
        payer: sharedPayer,
        source: 'Prince George’s County Finance Affidavit instructions; Maryland DLS county tax rate table for FY2026.',
        url: PG_AFFIDAVIT,
      },
    ],
    notes: [
      'Maryland law splits these taxes equally between buyer and seller unless the contract says otherwise; for a first-time Maryland homebuyer the seller pays them.',
      'The first-time rules need every buyer on the deed to be a first-time Maryland homebuyer who will live in the home (a co-signer who will not live there may join), each stating so under oath (Real Property §14-104(c)(4)–(5)).',
      'Ascent could not confirm whether Prince George’s County offers its own first-time-buyer exemption, so none is applied.',
    ],
  };
}

export function closingTaxes(
  jurisdiction: TaxJurisdiction,
  price: number,
  options: TaxOptions = { firstTimeBuyer: false, principalResidence: true },
): ClosingTaxes {
  const base = jurisdiction === 'dc' ? dcTaxes(price) : marylandTaxes(jurisdiction, price, options);
  const total = cents(base.lines.reduce((sum, line) => sum + line.amount, 0));
  const sellerTotal = cents(base.lines.reduce((sum, line) => sum + (line.sellerShare ?? 0), 0));
  return { ...base, total, sellerTotal, sellerPercent: price > 0 ? (sellerTotal / price) * 100 : 0 };
}

/** The seller's share as a percent of the price, rounded up to 0.01% after trimming float noise (1.45% stays 1.45%). */
export const sellerPercentRoundedUp = (taxes: Pick<ClosingTaxes, 'sellerPercent'>) =>
  Math.ceil(Number((taxes.sellerPercent * 100).toFixed(6))) / 100;

export const CLOSING_TAX_BOUNDARIES = [
  `Rates checked against the statutes, county codes and tax office forms on ${CLOSING_TAXES_CHECKED_ON}; governments change them, usually on July 1 (Maryland) or October 1 (DC).`,
  'Exemptions Ascent does not ask about (transfers between relatives, nonprofits, some government programs) are not applied.',
  'The contract decides who pays where the law allows it. The settlement statement from the title or settlement company is the final word.',
  'Settlement, title, lender and other fees are not included.',
] as const;
