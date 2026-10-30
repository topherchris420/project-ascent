/**
 * Homebuyer programs to check: published DC, Montgomery County and Prince George's County assistance programs, each
 * rule quoted from the administrator's own page or PDF with the date it was read. The screener compares what a buyer
 * enters with those posted rules. It never says a buyer qualifies: administrators, lenders and funding decide that,
 * and rules change. A rule Ascent could not confirm is shown as something to ask, never filled in.
 */
export const PROGRAMS_CHECKED_ON = '2026-10-30';
export const programAreas = ['dc', 'montgomery', 'prince-georges'] as const;
export type ProgramArea = (typeof programAreas)[number];
export const areaLabels: Record<ProgramArea, string> = {
  dc: 'Washington, DC',
  montgomery: 'Montgomery County, MD',
  'prince-georges': 'Prince George’s County, MD',
};
export const lastOwnedOptions = ['never', 'over-5', '3-to-5', 'within-3', 'unsure'] as const;
export type LastOwned = (typeof lastOwnedOptions)[number];
export const lastOwnedLabels: Record<LastOwned, string> = {
  never: 'I have never owned a home',
  'over-5': 'More than 5 years ago',
  '3-to-5': 'Between 3 and 5 years ago',
  'within-3': 'Within the last 3 years, or I own one now',
  unsure: 'Not sure',
};
export type Answer = 'yes' | 'no' | 'unsure';
export type BuyerProfile = {
  area: ProgramArea;
  householdSize: number | null;
  householdIncome: number | null;
  /** Income of the people on the loan, when it differs from the household's. */
  borrowerIncome: number | null;
  lastOwned: LastOwned;
  primaryResidence: Answer;
  veteran: Answer;
  dcResident: Answer;
  dcGovernmentEmployee: Answer;
  creditScore: number | null;
  price: number | null;
};
export const blankProfile = (area: ProgramArea = 'dc'): BuyerProfile => ({
  area,
  householdSize: null,
  householdIncome: null,
  borrowerIncome: null,
  lastOwned: 'unsure',
  primaryResidence: 'yes',
  veteran: 'unsure',
  dcResident: 'unsure',
  dcGovernmentEmployee: 'no',
  creditScore: null,
  price: null,
});

export type RuleCheck = { rule: string; outcome: 'meets' | 'fails' | 'unknown'; detail: string };
export type ProgramVerdict = 'worth-checking' | 'ask' | 'does-not-fit';
export type ProgramResult = {
  id: string;
  name: string;
  administrator: string;
  url: string;
  provides: string;
  /** The amount the posted rules name for this buyer, when the rules and the entries determine one. */
  amount: string | null;
  verdict: ProgramVerdict;
  checks: RuleCheck[];
  /** Posted requirements Ascent cannot check from these answers. */
  alsoRequired: string[];
  status: string;
  source: string;
};

const usd = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

/** DC DHCD, "HPAP Homebuyer Assistance Table, Effective for HPAP Loans Closed After October 1, 2026". */
export const HPAP_TABLE = {
  effective: 'loans closed after October 1, 2026',
  url: 'https://dhcd.dc.gov/sites/default/files/dc/sites/dhcd/documents/FY26%20HPAP%20Homebuyer%20Assistance%20Table%2010.6.26.pdf',
  closingCostAssistance: 4_000,
  bands: [
    {
      label: 'up to 50% of median family income',
      assistance: 202_000,
      limits: [58_150, 66_450, 74_750, 83_050, 89_700, 96_350, 103_000, 109_650],
    },
    {
      label: '51–80% of median family income',
      assistance: 161_600,
      limits: [74_500, 85_150, 95_800, 106_450, 113_100, 119_750, 126_400, 133_050],
    },
    {
      label: '51–80% of median family income',
      assistance: 141_400,
      limits: [79_850, 91_300, 102_700, 114_100, 121_250, 128_350, 135_500, 142_650],
    },
    {
      label: '51–80% of median family income',
      assistance: 101_000,
      limits: [93_000, 106_300, 119_600, 132_900, 141_200, 149_500, 157_800, 166_150],
    },
    {
      label: '81–110% of median family income',
      assistance: 80_800,
      limits: [113_950, 130_200, 146_500, 162_750, 172_900, 172_900, 172_900, 172_900],
    },
    {
      label: '81–110% of median family income',
      assistance: 70_000,
      limits: [127_900, 146_150, 164_450, 182_700, 194_100, 194_100, 194_100, 194_100],
    },
  ],
} as const;
/** Maryland CDA, "Attachment III, Maryland Mortgage Program Limits, Effective June 24, 2026". */
export const MMP_LIMITS = {
  effective: 'June 24, 2026',
  url: 'https://mmp.maryland.gov/Lenders/Documents/income-and-purchase-limits.pdf',
  // Montgomery and Prince George's carry the same values, targeted and non-targeted.
  incomeOneOrTwo: 199_320,
  incomeThreePlus: 232_540,
  acquisitionNonTargeted: 1_306_974,
  acquisitionTargeted: 1_597_413,
  maxLoan: 832_750,
} as const;
/** Prince George's County release of July 1, 2026: Pathway to Purchase limits at 80% of area median income. */
export const PG_PATHWAY_LIMITS = [93_050, 106_350, 119_650, 132_900, 143_550, 154_200, 164_800, 175_450] as const;
/** Montgomery County DHCA, MPDU purchase income limits effective May 1, 2026 (household sizes 1–6 posted). */
export const MPDU_LIMITS = { minimum: 40_000, maximum: [81_500, 93_000, 104_500, 116_500, 125_500, 135_000] } as const;
export const DC_OPEN_DOORS_MAX_INCOME = 275_400;
export const MIN_CREDIT_640 = 640;

function verdictOf(checks: RuleCheck[]): ProgramVerdict {
  if (checks.some(check => check.outcome === 'fails')) return 'does-not-fit';
  return checks.every(check => check.outcome === 'meets') ? 'worth-checking' : 'ask';
}
const unknown = (rule: string, detail: string): RuleCheck => ({ rule, outcome: 'unknown', detail });

function ownership(profile: BuyerProfile, years: 3 | 5, rule: string): RuleCheck {
  const recent = years === 3 ? profile.lastOwned === 'within-3' : ['within-3', '3-to-5'].includes(profile.lastOwned);
  if (profile.lastOwned === 'unsure') return unknown(rule, 'Answer when you last owned a home.');
  return recent
    ? { rule, outcome: 'fails', detail: `You said you owned a home within the last ${years} years.` }
    : { rule, outcome: 'meets', detail: `You said you have not owned a home in the last ${years} years.` };
}
function residence(profile: BuyerProfile): RuleCheck {
  const rule = 'The home must be your primary residence';
  if (profile.primaryResidence === 'unsure') return unknown(rule, 'Say whether you will live in the home.');
  return profile.primaryResidence === 'yes'
    ? { rule, outcome: 'meets', detail: 'You said you will live in the home.' }
    : { rule, outcome: 'fails', detail: 'You said the home will not be your primary residence.' };
}
function credit(profile: BuyerProfile, minimum: number, rule: string): RuleCheck {
  if (profile.creditScore === null) return unknown(rule, 'Enter a credit score to compare it.');
  return profile.creditScore >= minimum
    ? { rule, outcome: 'meets', detail: `Your entered score of ${profile.creditScore} is at least ${minimum}.` }
    : { rule, outcome: 'fails', detail: `Your entered score of ${profile.creditScore} is below ${minimum}.` };
}
/** Why no limit applies: no household size yet, or a size the posted table does not cover. */
const noLimit = (profile: BuyerProfile, tableSize: number, administrator: string) =>
  profile.householdSize === null
    ? 'Enter your household size to find the limit that applies.'
    : `Limits are posted for households of 1 to ${tableSize} people; ask ${administrator} about a household of ${profile.householdSize}.`;
function incomeAtMost(
  profile: BuyerProfile,
  limit: number | null,
  rule: string,
  missingLimit = 'Enter your household size to find the limit that applies.',
): RuleCheck {
  if (profile.householdIncome === null) return unknown(rule, 'Enter your yearly household income before taxes.');
  if (limit === null) return unknown(rule, missingLimit);
  return profile.householdIncome <= limit
    ? {
        rule,
        outcome: 'meets',
        detail: `Your entered household income of ${usd(profile.householdIncome)} is at or under ${usd(limit)}.`,
      }
    : {
        rule,
        outcome: 'fails',
        detail: `Your entered household income of ${usd(profile.householdIncome)} is over ${usd(limit)}.`,
      };
}
/** The table column for a whole household size from 1 to the table's length, or null. */
const sizeIndex = (profile: BuyerProfile, max: number) =>
  profile.householdSize !== null &&
  Number.isInteger(profile.householdSize) &&
  profile.householdSize >= 1 &&
  profile.householdSize <= max
    ? profile.householdSize - 1
    : null;
const HPAP_SIZES = HPAP_TABLE.bands[0].limits.length;

function mmpChecks(profile: BuyerProfile): RuleCheck[] {
  const firstTimeRule = 'First-time buyer: no home owned in the last 3 years (veterans and targeted areas are exempt)';
  const firstTime =
    profile.lastOwned === 'within-3' && profile.veteran === 'yes'
      ? { rule: firstTimeRule, outcome: 'meets' as const, detail: 'Veterans are exempt from the first-time rule.' }
      : profile.lastOwned === 'within-3'
        ? unknown(
            firstTimeRule,
            'You owned a home within 3 years. That rules this out unless you are a veteran or buy in a targeted area; ask an MMP lender.',
          )
        : ownership(profile, 3, firstTimeRule);
  const limit =
    profile.householdSize === null
      ? null
      : profile.householdSize <= 2
        ? MMP_LIMITS.incomeOneOrTwo
        : MMP_LIMITS.incomeThreePlus;
  const priceRule = `Purchase price at most ${usd(MMP_LIMITS.acquisitionNonTargeted)} (${usd(MMP_LIMITS.acquisitionTargeted)} in targeted areas)`;
  const price: RuleCheck =
    profile.price === null
      ? unknown(priceRule, 'Enter a purchase price to compare it.')
      : profile.price <= MMP_LIMITS.acquisitionNonTargeted
        ? { rule: priceRule, outcome: 'meets', detail: `${usd(profile.price)} is within the limit.` }
        : profile.price <= MMP_LIMITS.acquisitionTargeted
          ? unknown(priceRule, `${usd(profile.price)} is only within the limit in a targeted area.`)
          : { rule: priceRule, outcome: 'fails', detail: `${usd(profile.price)} is over both limits.` };
  return [
    firstTime,
    incomeAtMost(
      profile,
      limit,
      `Household income at most ${usd(MMP_LIMITS.incomeOneOrTwo)} (1–2 people) or ${usd(MMP_LIMITS.incomeThreePlus)} (3 or more)`,
    ),
    price,
    credit(profile, MIN_CREDIT_640, 'Credit score of at least 640'),
    residence(profile),
  ];
}

function dcPrograms(profile: BuyerProfile): ProgramResult[] {
  const results: ProgramResult[] = [];
  const index = sizeIndex(profile, HPAP_SIZES);
  const band =
    index === null || profile.householdIncome === null
      ? null
      : (HPAP_TABLE.bands.find(item => profile.householdIncome! <= item.limits[index]) ?? null);
  const top = index === null ? null : HPAP_TABLE.bands[HPAP_TABLE.bands.length - 1].limits[index];
  const hpapIncome: RuleCheck =
    profile.householdIncome === null
      ? unknown('Household income within the HPAP table', 'Enter your yearly household income before taxes.')
      : index === null
        ? unknown('Household income within the HPAP table', noLimit(profile, HPAP_SIZES, 'DHCD'))
        : band
          ? {
              rule: 'Household income within the HPAP table',
              outcome: 'meets',
              detail: `${usd(profile.householdIncome)} for ${profile.householdSize} ${profile.householdSize === 1 ? 'person' : 'people'} is at or under ${usd(band.limits[index])}, a row for households ${band.label}.`,
            }
          : {
              rule: 'Household income within the HPAP table',
              outcome: 'fails',
              detail: `${usd(profile.householdIncome)} is over the table’s highest limit of ${usd(top!)} for ${profile.householdSize} ${profile.householdSize === 1 ? 'person' : 'people'}.`,
            };
  const hpapChecks = [
    ownership(profile, 3, 'First-time buyer: no ownership interest in any home in the 3 years before applying'),
    residence(profile),
    hpapIncome,
  ];
  results.push({
    id: 'dc-hpap',
    name: 'Home Purchase Assistance Program (HPAP)',
    administrator: 'DC Department of Housing and Community Development',
    url: 'https://dhcd.dc.gov/page/hpap-eligibility-how-apply-and-program-details',
    provides:
      'Interest-free gap financing and closing cost assistance for a home in the District, behind a private first mortgage. Below 80% of median family income repayment is deferred until the home is sold; from 80% to 110% payments are deferred for five years.',
    amount: band
      ? `Up to ${usd(band.assistance)} in gap financing plus up to ${usd(HPAP_TABLE.closingCostAssistance)} for closing costs, from the table for ${HPAP_TABLE.effective}.`
      : null,
    verdict: verdictOf(hpapChecks),
    checks: hpapChecks,
    alsoRequired: [
      'A good credit rating (no minimum score is posted).',
      'You contribute $500 or 50% of liquid assets over $3,000, whichever is greater.',
      'A single-family house, condominium or cooperative unit in the District.',
      ...(profile.dcResident === 'no'
        ? [
            'District residents are always the priority; others are processed only when no resident applications are pending.',
          ]
        : []),
      'HPAP does not accept seller-backed mortgage financing.',
    ],
    status:
      'First come, first served from the fiscal year 2027 funds. After a Notice to Proceed, buyers must close by August 1, 2027.',
    source: `DHCD HPAP table effective for ${HPAP_TABLE.effective}; program page read ${PROGRAMS_CHECKED_ON}.`,
  });

  const borrowerRule = `Borrower income at most ${usd(DC_OPEN_DOORS_MAX_INCOME)} (170% of area median income)`;
  const borrowerIncome = profile.borrowerIncome ?? null;
  const openIncome: RuleCheck =
    borrowerIncome !== null
      ? borrowerIncome <= DC_OPEN_DOORS_MAX_INCOME
        ? { rule: borrowerRule, outcome: 'meets', detail: `${usd(borrowerIncome)} is within the limit.` }
        : { rule: borrowerRule, outcome: 'fails', detail: `${usd(borrowerIncome)} is over the limit.` }
      : profile.householdIncome !== null && profile.householdIncome <= DC_OPEN_DOORS_MAX_INCOME
        ? {
            rule: borrowerRule,
            outcome: 'meets',
            detail: 'Your household income is within the limit, so the borrowers’ income is too.',
          }
        : unknown(
            borrowerRule,
            'The page counts the borrowers’ income only, not the household’s. Enter the income of the people on the loan.',
          );
  const openChecks = [openIncome, credit(profile, MIN_CREDIT_640, 'Credit score of at least 640'), residence(profile)];
  results.push({
    id: 'dc-open-doors',
    name: 'DC Open Doors',
    administrator: 'DC Housing Finance Agency',
    url: 'https://www.dchfa.org/homebuyers/dc-open-doors/',
    provides:
      'A first mortgage through a participating lender, with an optional 0% deferred loan for the full required minimum down payment, due in 30 years or on sale, transfer, refinance or move-out. First-time and repeat buyers; residents and non-residents of DC.',
    amount: 'The full amount of your required minimum down payment.',
    verdict: verdictOf(openChecks),
    checks: openChecks,
    alsoRequired: [
      'A first mortgage of at most $1,249,125 through a participating lender; there is no maximum sales price.',
      'A debt-to-income ratio of at most 50% (45% for an FHA loan).',
    ],
    status: 'The page says requirements are subject to change without notice; no funding status is posted.',
    source: `DCHFA program page read ${PROGRAMS_CHECKED_ON}.`,
  });

  if (profile.dcGovernmentEmployee === 'yes') {
    const checks = [residence(profile)];
    results.push({
      id: 'dc-eahp',
      name: 'Employer Assisted Housing Program (EAHP)',
      administrator: 'DC Department of Housing and Community Development',
      url: 'https://dhcd.dc.gov/eahp',
      provides:
        'For District government employees: a deferred 0% loan and a matching-funds grant. No income cap and no cash contribution requirement.',
      amount:
        'A loan of up to $20,000 and a matching grant of up to $5,000 (up to $15,000 for first responders and educators).',
      verdict: verdictOf(checks),
      checks,
      alsoRequired: ['You keep the home as your principal residence for five years.'],
      status:
        'Subject to funding availability. The posted terms date from fiscal year 2018, with educators added in 2022.',
      source: `DHCD program page read ${PROGRAMS_CHECKED_ON}.`,
    });
  }
  return results;
}

function marylandPrograms(profile: BuyerProfile): ProgramResult[] {
  const results: ProgramResult[] = [];
  const mmp = mmpChecks(profile);
  results.push({
    id: 'md-mmp',
    name: 'Maryland Mortgage Program: 1st Time Advantage',
    administrator: 'Maryland DHCD, Community Development Administration',
    url: 'https://mmp.maryland.gov/Pages/1stTimeAdvantage.aspx',
    provides:
      'A state first mortgage through an approved lender, with down payment help such as a $6,000 loan (1st Time Advantage 6000) or a 0% deferred loan of 3%, 4% or 5% of the first mortgage.',
    amount: null,
    verdict: verdictOf(mmp),
    checks: mmp,
    alsoRequired: [
      'Homebuyer education for every borrower.',
      `A loan of at most ${usd(MMP_LIMITS.maxLoan)}, including financed insurance or guarantee fees.`,
      'The 640 minimum credit score is from an MMP fact sheet dated January 3, 2024; confirm it with the lender.',
    ],
    status: `Limits effective ${MMP_LIMITS.effective}. Funding status is not posted for these products.`,
    source: `MMP limits effective ${MMP_LIMITS.effective}; product page read ${PROGRAMS_CHECKED_ON}.`,
  });

  if (profile.area === 'montgomery') {
    const checks = mmpChecks(profile);
    results.push({
      id: 'mc-homeownership',
      name: 'Montgomery Homeownership Program',
      administrator: 'Montgomery County with the Maryland Mortgage Program',
      url: 'https://mmp.maryland.gov/media/30',
      provides:
        'A 0% deferred second loan for down payment and closing costs, paired with the MMP first mortgage. It cannot be combined with other MMP down payment products.',
      amount:
        profile.householdIncome === null
          ? 'Up to $50,000, but not more than 40% of household income.'
          : `Up to ${usd(Math.min(50_000, profile.householdIncome * 0.4))}: $50,000 or 40% of your entered household income, whichever is less.`,
      verdict: verdictOf(checks),
      checks,
      alsoRequired: ['The MMP first mortgage and its homebuyer education.'],
      status: 'Open: reservations are accepted until the funds are fully committed (MMP directive of July 21, 2026).',
      source: `MMP fact sheet dated April 8, 2026; read ${PROGRAMS_CHECKED_ON}.`,
    });

    const hocChecks = [
      credit(profile, MIN_CREDIT_640, 'Credit score no lower than 640'),
      residence(profile),
      unknown(
        'HOC income and sales-price limits',
        'HOC’s posted limits are dated April 5, 2023, so Ascent does not compare them. Ask HOC for the current limits.',
      ),
    ];
    results.push({
      id: 'mc-hoc',
      name: 'HOC Mortgage Purchase Program',
      administrator: 'Housing Opportunities Commission of Montgomery County',
      url: 'https://www.hocmc.org/housing-opportunities/homeownership/the-mortgage-purchase-program/',
      provides:
        'Below-market first mortgages for homes in Montgomery County, with down payment help: a 0% deferred loan of 3% of the sales price, or McHAF assistance of up to $25,000 as a 0% deferred loan.',
      amount: profile.price === null ? null : `3% of ${usd(profile.price)} is ${usd(profile.price * 0.03)}.`,
      verdict: verdictOf(hocChecks),
      checks: hocChecks,
      alsoRequired: ['A first-time homebuyer education class.'],
      status: 'The page says there is no waiting list. Funding status is not posted.',
      source: `HOC program page read ${PROGRAMS_CHECKED_ON}.`,
    });

    const index = sizeIndex(profile, MPDU_LIMITS.maximum.length);
    const mpduIncome: RuleCheck =
      profile.householdIncome === null
        ? unknown('Household income within the MPDU limits', 'Enter your yearly household income before taxes.')
        : profile.householdIncome < MPDU_LIMITS.minimum
          ? {
              rule: 'Household income within the MPDU limits',
              outcome: 'fails',
              detail: `${usd(profile.householdIncome)} is under the ${usd(MPDU_LIMITS.minimum)} minimum.`,
            }
          : index === null
            ? unknown('Household income within the MPDU limits', noLimit(profile, MPDU_LIMITS.maximum.length, 'DHCA'))
            : incomeAtMost(profile, MPDU_LIMITS.maximum[index], 'Household income within the MPDU limits');
    const mpduChecks = [
      ownership(profile, 5, 'No one in the household has owned a home in the last 5 years'),
      mpduIncome,
      residence(profile),
    ];
    results.push({
      id: 'mc-mpdu',
      name: 'Moderately Priced Dwelling Units (MPDU) purchase program',
      administrator: 'Montgomery County Department of Housing and Community Affairs',
      url: 'https://www.montgomerycountymd.gov/department-housing-community-affairs/moderately-priced-dwelling-units-mpdus/mpdu-purchase-applicants',
      provides:
        'The chance to buy a price-controlled home. Certificate holders enter random drawings, grouped by priority points for living or working in the county.',
      amount: null,
      verdict: verdictOf(mpduChecks),
      checks: mpduChecks,
      alsoRequired: [
        'A mortgage pre-qualification letter for at least $150,000 from a licensed lender, issued within 3 months.',
        'Three classes in order: MPDU Orientation, First-Time Homebuyer Class and Application Tutorial, each passed with 80% or more.',
      ],
      status: 'This is a lottery for specific homes, not a loan. Income limits effective May 1, 2026.',
      source: `DHCA applicant page read ${PROGRAMS_CHECKED_ON}.`,
    });
  }

  if (profile.area === 'prince-georges') {
    const index = sizeIndex(profile, PG_PATHWAY_LIMITS.length);
    const pathwayChecks = [
      ownership(profile, 3, 'First-time buyer'),
      incomeAtMost(
        profile,
        index === null ? null : PG_PATHWAY_LIMITS[index],
        'Household income at or below 80% of area median income',
        noLimit(profile, PG_PATHWAY_LIMITS.length, 'the county'),
      ),
      residence(profile),
      unknown(
        'Maximum purchase price',
        'A December 2025 county release named $448,000 for resale and $485,000 for new homes. Ascent could not confirm the July 2026 guidelines; ask the county.',
      ),
    ];
    results.push({
      id: 'pg-pathway',
      name: 'Pathway to Purchase',
      administrator: 'Prince George’s County Department of Housing and Community Development',
      url: 'https://www.princegeorgescountymd.gov/business/redevelopment-authority/first-time-home-buyer-assistance-programs/pathway-to-purchase',
      provides: 'A 0% deferred loan for down payment and closing costs, forgiven after sustained occupancy.',
      amount: 'Up to $50,000.',
      verdict: verdictOf(pathwayChecks),
      checks: pathwayChecks,
      alsoRequired: [
        'An MMP first mortgage (1st Time Advantage Direct or 6000 with CPIP), per the MMP lender flyer revised January 15, 2026.',
        'A homebuyer class with a HUD-certified counseling agency.',
      ],
      status: 'The county’s July 1, 2026 release says the program continues for this fiscal year.',
      source: `County release of July 1, 2026; read ${PROGRAMS_CHECKED_ON}.`,
    });
    const ami120 = unknown(
      'Household income at or below 120% of area median income',
      'The county has not posted the 120% dollar limits where Ascent could read them; ask the county.',
    );
    results.push({
      id: 'pg-equity',
      name: 'Homeownership Equity Program',
      administrator: 'Prince George’s County Department of Housing and Community Development',
      url: 'https://content.govdelivery.com/accounts/MDPGC/bulletins/41e8602',
      provides: 'A 0% loan for down payment and closing costs, forgiven at 20% a year over five years.',
      amount: 'Up to $30,000 per buyer.',
      verdict: verdictOf([ami120, residence(profile)]),
      checks: [ami120, residence(profile)],
      alsoRequired: [],
      status: 'Announced July 1, 2026.',
      source: `County release of July 1, 2026; read ${PROGRAMS_CHECKED_ON}.`,
    });
    const workforce = [
      ami120,
      unknown('Works in a critical workforce role', 'Ask the county which jobs qualify.'),
      residence(profile),
    ];
    results.push({
      id: 'pg-workforce',
      name: 'Critical Workforce Housing Assistance Program',
      administrator: 'Prince George’s County Department of Housing and Community Development',
      url: 'https://content.govdelivery.com/accounts/MDPGC/bulletins/41e8602',
      provides: 'A 0% deferred loan, forgiven at 10% a year over 10 years.',
      amount:
        profile.price === null
          ? 'Up to $50,000 or 25% of the purchase price, whichever is less.'
          : `Up to ${usd(Math.min(50_000, profile.price * 0.25))}: $50,000 or 25% of ${usd(profile.price)}, whichever is less.`,
      verdict: verdictOf(workforce),
      checks: workforce,
      alsoRequired: [],
      status: 'Announced July 1, 2026.',
      source: `County release of July 1, 2026; read ${PROGRAMS_CHECKED_ON}.`,
    });
  }
  return results;
}

const verdictOrder: Record<ProgramVerdict, number> = { 'worth-checking': 0, ask: 1, 'does-not-fit': 2 };

/** Every published program for the area, ordered: worth checking, then questions to ask, then poor fits. */
export function screenPrograms(profile: BuyerProfile): ProgramResult[] {
  const results = profile.area === 'dc' ? dcPrograms(profile) : marylandPrograms(profile);
  // Array sort is stable, so programs keep their listed order within each verdict.
  return results.sort((a, b) => verdictOrder[a.verdict] - verdictOrder[b.verdict]);
}

export const PROGRAM_BOUNDARIES = [
  `Rules were read from each administrator’s own page or PDF on ${PROGRAMS_CHECKED_ON}. Programs change limits, pause when funds run out and add requirements; the administrator’s current rules decide.`,
  '“Worth checking” means your answers fit the rules Ascent could read. It is not approval, a reservation or a promise of funds.',
  'Your answers stay in this browser tab. Nothing is saved or sent.',
  'Mortgage rates are not shown. Freddie Mac publishes a weekly national average at freddiemac.com/pmms; a lender quote is what applies to you.',
] as const;
