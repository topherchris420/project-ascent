import { z } from 'zod';
import { calculationChecksum } from './analytics';
import { saleNetBeforePayoff } from './selling-costs';

export const FINANCE_VERSION = 'ascent-homeowner-finance-2';
const dollars = z.number().min(0).max(100_000_000).nullable();
const percent = (max = 50, min = 0) => z.number().min(min).max(max).nullable();
const months = (max = 600) => z.number().int().min(1).max(max).nullable();
export const financeSchema = z
  .object({
    propertyValue: dollars,
    salePrice: dollars,
    mortgageBalance: dollars,
    mortgageRate: percent(),
    mortgageMonths: months(),
    commissionPercent: percent(25),
    closingPercent: percent(25),
    concessions: dollars,
    sellingMonths: z.number().int().min(0).max(60),
    monthlyTax: dollars,
    monthlyInsurance: dollars,
    monthlyHoa: dollars,
    monthlyMaintenance: dollars,
    monthlyCapex: dollars,
    monthlyRent: dollars,
    vacancyPercent: percent(100),
    managementPercent: percent(100),
    renovationCost: dollars,
    renovatedSalePrice: dollars,
    renovationMonths: z.number().int().min(0).max(60).nullable(),
    refinanceRate: percent(),
    refinanceMonths: months(),
    refinanceCosts: dollars,
    cashOut: dollars,
    purchasePrice: dollars,
    downPercent: percent(100),
    purchaseRate: percent(),
    purchaseMonths: months(),
    purchaseClosingCosts: dollars,
    purchaseMonthlyCosts: dollars,
    cashReserves: dollars,
    appreciationPercent: percent(50, -50),
    opportunityPercent: percent(50, -50),
    horizonMonths: z.number().int().min(1).max(360),
  })
  .strict()
  .refine(a => (a.commissionPercent ?? 0) + (a.closingPercent ?? 0) < 100, {
    message: 'Combined sale percentages must be below 100%.',
  });
export type FinanceInputs = z.infer<typeof financeSchema>;
export type FinanceKey = keyof FinanceInputs;
export const financeLabels: Record<FinanceKey, string> = {
  propertyValue: 'Property value assumption ($)',
  salePrice: 'Sale price assumption ($)',
  mortgageBalance: 'Mortgage balance / payoff assumption ($)',
  mortgageRate: 'Existing interest rate (%)',
  mortgageMonths: 'Remaining mortgage months',
  commissionPercent: 'Negotiable commission (%)',
  closingPercent: 'Other selling costs (%)',
  concessions: 'Seller concessions ($)',
  sellingMonths: 'Months until sale',
  monthlyTax: 'Monthly property tax ($)',
  monthlyInsurance: 'Monthly homeowners insurance ($)',
  monthlyHoa: 'Monthly HOA dues ($)',
  monthlyMaintenance: 'Monthly maintenance ($)',
  monthlyCapex: 'Monthly capital reserve ($)',
  monthlyRent: 'Monthly gross rent ($)',
  vacancyPercent: 'Vacancy (%)',
  managementPercent: 'Management fee on collected rent (%)',
  renovationCost: 'Renovation budget ($)',
  renovatedSalePrice: 'Post-renovation sale price assumption ($)',
  renovationMonths: 'Additional renovation months',
  refinanceRate: 'Refinance interest rate (%)',
  refinanceMonths: 'New mortgage term (months)',
  refinanceCosts: 'Refinance costs paid in cash ($)',
  cashOut: 'Refinance cash out ($)',
  purchasePrice: 'Next home price ($)',
  downPercent: 'Next home down payment (%)',
  purchaseRate: 'Next home interest rate (%)',
  purchaseMonths: 'Next home mortgage term (months)',
  purchaseClosingCosts: 'Next home closing costs ($)',
  purchaseMonthlyCosts: 'Next home monthly tax, insurance, HOA and upkeep ($)',
  cashReserves: 'Available cash reserves ($)',
  appreciationPercent: 'Hypothetical annual property change (%)',
  opportunityPercent: 'Hypothetical annual cash return (%)',
  horizonMonths: 'Comparison horizon (months)',
};
export function emptyFinance(): FinanceInputs {
  return Object.fromEntries(
    Object.keys(financeLabels).map(key => [key, key === 'horizonMonths' ? 60 : key === 'sellingMonths' ? 0 : null]),
  ) as FinanceInputs;
}
/** Illustrative practice only. Never loaded silently for a real property. */
export function exampleFinance(): FinanceInputs {
  return {
    propertyValue: 600000,
    salePrice: 600000,
    mortgageBalance: 300000,
    mortgageRate: 4,
    mortgageMonths: 240,
    commissionPercent: 3,
    closingPercent: 1,
    concessions: 0,
    sellingMonths: 0,
    monthlyTax: 500,
    monthlyInsurance: 150,
    monthlyHoa: 0,
    monthlyMaintenance: 200,
    monthlyCapex: 150,
    monthlyRent: 3500,
    vacancyPercent: 5,
    managementPercent: 8,
    renovationCost: 30000,
    renovatedSalePrice: 650000,
    renovationMonths: 3,
    refinanceRate: 3.5,
    refinanceMonths: 240,
    refinanceCosts: 5000,
    cashOut: 0,
    purchasePrice: 500000,
    downPercent: 20,
    purchaseRate: 6,
    purchaseMonths: 360,
    purchaseClosingCosts: 10000,
    purchaseMonthlyCosts: 900,
    cashReserves: 150000,
    appreciationPercent: 0,
    opportunityPercent: 0,
    horizonMonths: 60,
  };
}
export const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
/** Fixed-rate fully amortizing loan, monthly payments, no escrow, fees or prepayment penalty. */
export function mortgagePayment(principal: number, annualRate: number, termMonths: number) {
  if (
    !Number.isFinite(principal) ||
    principal < 0 ||
    !Number.isFinite(annualRate) ||
    annualRate < 0 ||
    annualRate > 50 ||
    !Number.isInteger(termMonths) ||
    termMonths < 1 ||
    termMonths > 600
  )
    throw new Error('Invalid fixed-rate mortgage inputs.');
  const r = annualRate / 1200;
  return r === 0 ? principal / termMonths : (principal * r) / -Math.expm1(-termMonths * Math.log1p(r));
}
export function amortize(principal: number, annualRate: number, termMonths: number, count: number) {
  const payment = mortgagePayment(principal, annualRate, termMonths);
  if (!Number.isInteger(count) || count < 0 || count > 360) throw new Error('Invalid amortization horizon.');
  let balance = principal,
    interest = 0,
    paid = 0;
  const rows: { balance: number; interest: number; payment: number }[] = [];
  for (let i = 0; i < count; i++) {
    const charge = (balance * annualRate) / 1200;
    const actual = Math.min(payment, balance + charge);
    balance = Math.max(0, balance + charge - actual);
    if (balance < 1e-7) balance = 0;
    interest += charge;
    paid += actual;
    rows.push({ balance, interest: charge, payment: actual });
  }
  return { payment, balance, interest, paid, rows };
}
export const decisionKinds = ['sell', 'hold', 'rent', 'renovate', 'refinance', 'buy-retain'] as const;
export type DecisionKind = (typeof decisionKinds)[number];
export const decisionLabels: Record<DecisionKind, string> = {
  sell: 'Sell the property',
  hold: 'Continue owning',
  rent: 'Rent the property',
  renovate: 'Renovate then sell',
  refinance: 'Refinance',
  'buy-retain': 'Buy and retain as rental',
};
export type DecisionResult = {
  kind: DecisionKind;
  missing: FinanceKey[];
  available: boolean;
  netProceeds: number | null;
  monthlyCashFlow: number | null;
  ownershipCosts: number | null;
  terminalEquity: number | null;
  equityChange: number | null;
  netPosition: number | null;
  upfrontCash: number | null;
  cashRequired: number | null;
  reserveShortfall: number | null;
  breakEven: { value: number; unit: 'monthly rent' | 'sale price' | 'months'; explanation: string } | null;
  trajectory: { month: number; equity: number; cashFlow: number; netPosition: number }[];
};
export const FINANCE_LIMITS = [
  'Deterministic, pre-tax scenarios; property changes and cash returns are hypothetical, not forecasts or market evidence.',
  'Net position = modeled cash flows compounded at the assumed cash return + end equity less hypothetical selling costs. Starting reserves are excluded from this incremental comparison.',
  'Replacement housing, rent paid elsewhere, housing utility, income/capital-gains taxes, tax benefits, liens, payoff fees, rent/cost inflation and loan qualification are not modeled. Choices do not provide equivalent housing.',
  'Fixed-rate monthly amortization only; lender payoff statements and actual payment rounding may differ. Capital reserves are treated as cash outflows; unused reserves are not added back.',
  'Buy and retain assumes the current home is rented and the next home is owner-occupied. Renovations and fees are paid in cash, without a construction loan.',
];
const operatingKeys: FinanceKey[] = [
  'monthlyTax',
  'monthlyInsurance',
  'monthlyHoa',
  'monthlyMaintenance',
  'monthlyCapex',
];
const rentalKeys: FinanceKey[] = ['monthlyRent', 'vacancyPercent', 'managementPercent'];
const sellingKeys: FinanceKey[] = [
  'salePrice',
  'commissionPercent',
  'closingPercent',
  'concessions',
  'mortgageBalance',
];
function required(a: FinanceInputs, kind: DecisionKind): FinanceKey[] {
  const sells = kind === 'sell' || kind === 'renovate';
  const delay = kind === 'renovate' ? a.sellingMonths + (a.renovationMonths ?? 0) : a.sellingMonths;
  const keys: FinanceKey[] = [...sellingKeys, 'opportunityPercent'];
  if (!sells || delay > 0) {
    keys.push(...operatingKeys);
    if (a.mortgageBalance !== 0) keys.push('mortgageRate', 'mortgageMonths');
  }
  if (!sells) keys.push('propertyValue', 'appreciationPercent');
  if (kind === 'rent' || kind === 'buy-retain') keys.push(...rentalKeys);
  if (kind === 'renovate') keys.push('renovationCost', 'renovatedSalePrice', 'renovationMonths');
  if (kind === 'refinance') keys.push('refinanceRate', 'refinanceMonths', 'refinanceCosts', 'cashOut');
  if (kind === 'buy-retain') {
    keys.push('purchasePrice', 'downPercent', 'purchaseClosingCosts', 'purchaseMonthlyCosts');
    if (a.downPercent !== 100) keys.push('purchaseRate', 'purchaseMonths');
  }
  return [...new Set(keys)];
}
function decision(a: FinanceInputs, kind: DecisionKind): DecisionResult {
  const missing = required(a, kind).filter(key => a[key] === null);
  const blank: DecisionResult = {
    kind,
    missing,
    available: false,
    netProceeds: null,
    monthlyCashFlow: null,
    ownershipCosts: null,
    terminalEquity: null,
    equityChange: null,
    netPosition: null,
    upfrontCash: null,
    cashRequired: null,
    reserveShortfall: null,
    breakEven: null,
    trajectory: [],
  };
  if (missing.length) {
    // A horizon comparison may be unavailable even when immediate sale arithmetic is known.
    if (kind === 'sell' && a.sellingMonths === 0 && sellingKeys.every(key => a[key] !== null)) {
      blank.netProceeds = cents(
        saleNetBeforePayoff(a.salePrice!, {
          commissionPercent: a.commissionPercent!,
          closingPercent: a.closingPercent!,
          concessions: a.concessions!,
        }) - a.mortgageBalance!,
      );
    }
    return blank;
  }
  const H = a.horizonMonths,
    sells = kind === 'sell' || kind === 'renovate';
  const delay = kind === 'renovate' ? a.sellingMonths + a.renovationMonths! : a.sellingMonths;
  // A sale outside the chosen horizon cannot be compared as if its proceeds had arrived.
  if (sells && delay > H) return { ...blank, missing: [kind === 'renovate' ? 'renovationMonths' : 'sellingMonths'] };
  const fees = {
    commissionPercent: a.commissionPercent!,
    closingPercent: a.closingPercent!,
    concessions: a.concessions!,
  };
  const balance = a.mortgageBalance!;
  const loan = amortize(balance, a.mortgageRate ?? 0, a.mortgageMonths ?? 1, H);
  const refi = kind === 'refinance';
  const activeLoan = refi ? amortize(balance + a.cashOut!, a.refinanceRate!, a.refinanceMonths!, H) : loan;
  const operating = operatingKeys.reduce((sum, key) => sum + (a[key] ?? 0), 0);
  const rental = kind === 'rent' || kind === 'buy-retain';
  const collectedRent = rental ? a.monthlyRent! * (1 - a.vacancyPercent! / 100) : 0;
  const managementCost = (collectedRent * (a.managementPercent ?? 0)) / 100;
  const rent = collectedRent * (1 - (a.managementPercent ?? 0) / 100);
  const buying = kind === 'buy-retain';
  const down = buying ? (a.purchasePrice! * a.downPercent!) / 100 : 0;
  const newPrincipal = buying ? a.purchasePrice! - down : 0;
  const nextLoan = amortize(newPrincipal, a.purchaseRate ?? 0, a.purchaseMonths ?? 1, H);
  const upfront =
    kind === 'renovate' ? a.renovationCost! : refi ? a.refinanceCosts! : buying ? down + a.purchaseClosingCosts! : 0;
  const initialCash = -upfront + (refi ? a.cashOut! : 0);
  const rm = Math.pow(1 + a.opportunityPercent! / 100, 1 / 12) - 1;
  const growth = Math.pow(1 + (a.appreciationPercent ?? 0) / 100, 1 / 12);
  let cash = initialCash,
    costs = buying ? a.purchaseClosingCosts! : upfront,
    netProceeds: number | null = null;
  const initialEquity = (a.propertyValue ?? a.salePrice!) - balance;
  const rows: DecisionResult['trajectory'] = [];
  const salePrice = kind === 'renovate' ? a.renovatedSalePrice! : a.salePrice!;
  const closeNet = (debt: number) => saleNetBeforePayoff(salePrice, fees) - debt;
  if (sells && delay === 0) {
    netProceeds = closeNet(balance);
    cash += netProceeds;
    costs += salePrice - saleNetBeforePayoff(salePrice, fees);
  }
  let liquidCash = initialCash + (sells && delay === 0 ? netProceeds! : 0),
    lowestCash = Math.min(0, liquidCash);
  const row = (month: number, cf: number) => {
    const currentBalance = month ? activeLoan.rows[month - 1].balance : refi ? balance + a.cashOut! : balance;
    const nextBalance = month ? nextLoan.rows[month - 1].balance : newPrincipal;
    const value = a.propertyValue! * growth ** month;
    const nextValue = buying ? a.purchasePrice! * growth ** month : 0;
    const held = !sells || month < delay;
    // A hypothetical completed renovation cannot increase the asset's value before the entered completion month.
    const heldValue =
      kind === 'renovate' && month < a.renovationMonths!
        ? (a.propertyValue ?? a.salePrice!)
        : sells
          ? salePrice
          : value;
    const equity = held ? heldValue - currentBalance + nextValue - nextBalance : 0;
    const exit = held
      ? saleNetBeforePayoff(heldValue, fees) -
        currentBalance +
        (buying ? saleNetBeforePayoff(nextValue, { ...fees, concessions: 0 }) - nextBalance : 0)
      : 0;
    rows.push({ month, equity: cents(equity), cashFlow: cents(cf), netPosition: cents(cash + exit) });
  };
  row(0, initialCash + (delay === 0 && sells ? netProceeds! : 0));
  for (let month = 1; month <= H; month++) {
    const owns = !sells || month <= delay;
    const payment = owns ? activeLoan.rows[month - 1].payment : 0;
    let cf = owns
      ? rent - operating - payment - (buying ? nextLoan.rows[month - 1].payment + a.purchaseMonthlyCosts! : 0)
      : 0;
    costs += owns
      ? operating +
        managementCost +
        activeLoan.rows[month - 1].interest +
        (buying ? nextLoan.rows[month - 1].interest + a.purchaseMonthlyCosts! : 0)
      : 0;
    if (sells && month === delay) {
      netProceeds = closeNet(activeLoan.rows[month - 1].balance);
      cf += netProceeds;
      costs += salePrice - saleNetBeforePayoff(salePrice, fees);
    }
    cash = cash * (1 + rm) + cf;
    liquidCash += cf;
    lowestCash = Math.min(lowestCash, liquidCash);
    row(month, cf);
  }
  const ending = rows[H];
  let breakEven: DecisionResult['breakEven'] = null;
  const collected = (1 - (a.vacancyPercent ?? 0) / 100) * (1 - (a.managementPercent ?? 0) / 100);
  if (rental && collected > 0)
    breakEven = {
      value: cents((operating + activeLoan.payment) / collected),
      unit: 'monthly rent',
      explanation:
        'Gross rent to cover the current property’s payment, vacancy, management, operating costs and capital reserve; excludes the next home.',
    };
  const savings = loan.payment - activeLoan.payment;
  if (refi && savings > 0)
    breakEven = {
      value: Math.ceil(a.refinanceCosts! / savings),
      unit: 'months',
      explanation:
        'Cash fees ÷ initial monthly payment savings, rounded up. Payment break-even ignores differences in loan term, equity, cash out and time value; inspect net position too.',
    };
  if (kind === 'renovate') {
    // Match the no-renovation sale at its own entered sale time, including amortization, carrying costs and time value.
    const base = decision(a, 'sell');
    const targetAtClose = base.netPosition! / (1 + rm) ** (H - delay);
    const preProceedsAtClose = (ending.netPosition! - netProceeds! * (1 + rm) ** (H - delay)) / (1 + rm) ** (H - delay);
    const debtAtClose = delay === 0 ? balance : activeLoan.rows[delay - 1].balance;
    breakEven = {
      value: cents(
        (targetAtClose - preProceedsAtClose + debtAtClose + fees.concessions) /
          (1 - (fees.commissionPercent + fees.closingPercent) / 100),
      ),
      unit: 'sale price',
      explanation:
        'Renovated sale price needed to match the sell scenario’s horizon net position, including entered delay, carrying costs, debt and hypothetical cash return.',
    };
    if (delay === 0)
      breakEven.value = cents(
        a.salePrice! + a.renovationCost! / (1 - (fees.commissionPercent + fees.closingPercent) / 100),
      );
  }
  const monthlyCashFlow = sells
    ? null
    : rent - operating - activeLoan.payment - (buying ? nextLoan.payment + a.purchaseMonthlyCosts! : 0);
  return {
    ...blank,
    available: true,
    netProceeds: netProceeds === null ? null : cents(netProceeds),
    monthlyCashFlow: monthlyCashFlow === null ? null : cents(monthlyCashFlow),
    ownershipCosts: cents(costs),
    terminalEquity: ending.equity,
    equityChange: cents(ending.equity - initialEquity),
    netPosition: ending.netPosition,
    upfrontCash: cents(Math.max(0, -initialCash)),
    cashRequired: cents(-lowestCash),
    reserveShortfall: a.cashReserves === null ? null : cents(Math.max(0, -lowestCash - a.cashReserves)),
    breakEven,
    trajectory: rows,
  };
}
export function compareDecisions(raw: FinanceInputs) {
  const inputs = financeSchema.parse(raw);
  const results = decisionKinds.map(kind => decision(inputs, kind));
  return {
    version: FINANCE_VERSION,
    inputs,
    results,
    limits: FINANCE_LIMITS,
    calculationHash: calculationChecksum({ version: FINANCE_VERSION, inputs, results }),
  };
}
export function saleSensitivity(raw: FinanceInputs, reduction = 25000) {
  const inputs = financeSchema.parse(raw);
  if (!Number.isFinite(reduction) || reduction < 0 || inputs.salePrice === null || inputs.salePrice < reduction)
    return null;
  const before = decision(inputs, 'sell');
  const after = decision({ ...inputs, salePrice: inputs.salePrice - reduction }, 'sell');
  return before.available && after.available
    ? { reduction, netDifference: cents(after.netPosition! - before.netPosition!) }
    : null;
}
