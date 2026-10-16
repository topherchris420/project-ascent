import type { ContractDateIssue, DateTextEvidence, DocumentRecord } from './types';

export type DateCandidate = DocumentRecord['extractedDates'][number];
export const CONTRACT_DATE_VERSION = 'ascent-contract-dates-2026-10-16.2';
export const MAX_CONTRACT_TEXT_CHARS = 250000;
export type ContractTextPage = { page?: number; text: string };

const DAY = 86400000;
const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};
const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  'twenty-one': 21,
  thirty: 30,
  'forty-five': 45,
  sixty: 60,
  forty: 40,
  fifty: 50,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const NUMBER_TOKEN =
  'zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|and';
function periodNumber(value: string): number | undefined {
  if (/^\d+$/.test(value)) return Number(value);
  const normalized = value.toLowerCase().replace(/ +/g, '-');
  if (NUMBER_WORDS[normalized]) return NUMBER_WORDS[normalized];
  const parts = normalized.split('-');
  const tens = NUMBER_WORDS[parts[0]],
    ones = NUMBER_WORDS[parts[1]];
  return parts.length === 2 && tens >= 20 && tens % 10 === 0 && ones >= 1 && ones <= 9 ? tens + ones : undefined;
}
const MONTH =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const PATTERNS: { regex: RegExp; parse: (m: RegExpMatchArray) => [number, number, number] }[] = [
  { regex: /\b(20\d{2})-(\d{2})-(\d{2})\b/g, parse: m => [+m[1], +m[2], +m[3]] },
  {
    regex: /\b(\d{1,2})\/(\d{1,2})\/(20\d{2}|\d{2})\b/g,
    parse: m => [m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1], +m[2]],
  },
  {
    regex: new RegExp(`\\b${MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d{2})\\b`, 'gi'),
    parse: m => [+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]],
  },
  {
    regex: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:day\\s+of\\s+)?${MONTH}\\.?,?\\s+(20\\d{2})\\b`, 'gi'),
    parse: m => [+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]],
  },
];

/** Separate named anchors: execution, acceptance and effectiveness are not silently equated with ratification. */
const LABELS: [RegExp, string, string?][] = [
  [/ratification|ratified/gi, 'Ratification / effective date', 'ratification'],
  [/effective date/gi, 'Ratification / effective date', 'effective date'],
  [
    /date of acceptance|acceptance date|contract acceptance|accepted on/gi,
    'Ratification / effective date',
    'acceptance',
  ],
  [/executed|execution/gi, 'Ratification / effective date', 'execution'],
  [/home inspection|inspection/gi, 'Inspection contingency ends'],
  [/apprais/gi, 'Appraisal deadline'],
  [/financ|loan (?:approval|commitment)|mortgage commitment|lender/gi, 'Financing contingency ends'],
  [/earnest money|deposit/gi, 'Earnest money deposit due'],
  [/walk.?through/gi, 'Final walk-through'],
  [/hoa|condominium|condo docs|association documents|resale (?:package|certificate)/gi, 'HOA / condo document review'],
  [/title/gi, 'Title review'],
  [/settlement/gi, 'Settlement / closing', 'settlement'],
  [/closing/gi, 'Settlement / closing', 'closing'],
  [/close of escrow/gi, 'Settlement / closing', 'close of escrow'],
  [/possession/gi, 'Possession'],
  [/expir|respond by|offer is valid/gi, 'Offer expiration'],
];

const iso = (y: number, m: number, d: number) => {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? date.toISOString().slice(0, 10)
    : null;
};
const contextAt = (text: string, index: number, length: number) =>
  text.slice(Math.max(0, index - 70), index + length + 90).trim();

/** The label whose keyword sits closest before the match, or just after it when nothing precedes. */
function eventFor(text: string, index: number, length: number): { label: string; kind?: string } | undefined {
  const prefix = text.slice(Math.max(0, index - 110), index);
  const lines = prefix.split('\n');
  let before = lines.at(-1) || '';
  // A heading and its value may occupy separate extracted lines; unrelated previous lines are not labels.
  if (!before.trim() && /:\s*$/.test(lines.at(-2) || '')) before = lines.at(-2)!;
  before = before.split(/[;!?]/).at(-1) || '';
  const after = text.slice(index + length, index + length + 45).split(/[\n;!?]/)[0];
  let best: { label: string; kind?: string; distance: number } | undefined;
  for (const [pattern, label, kind] of LABELS)
    for (const match of before.matchAll(pattern)) {
      const distance = before.length - match.index!;
      // A completed sentence cannot donate its label to a later unrelated date.
      if (/[.!?]\s+\S/.test(before.slice(match.index! + match[0].length))) continue;
      if (!best || distance < best.distance) best = { label, kind, distance };
    }
  if (best) return best;
  for (const [pattern, label, kind] of LABELS) {
    const match = [...after.matchAll(pattern)][0];
    if (match && /^\s*(?:is\s+(?:the\s+)?)?(?:[-–—:]\s*)?$/i.test(after.slice(0, match.index))) return { label, kind };
  }
  return undefined;
}
export function labelFor(text: string, index: number, length: number): string | undefined {
  return eventFor(text, index, length)?.label;
}

function addDays(start: string, days: number, business: boolean, direction: 1 | -1): string {
  let time = Date.parse(`${start}T12:00:00.000Z`);
  if (!business) return new Date(time + direction * days * DAY).toISOString().slice(0, 10);
  let remaining = days;
  while (remaining > 0) {
    time += direction * DAY;
    const weekday = new Date(time).getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining--;
  }
  return new Date(time).toISOString().slice(0, 10);
}

/**
 * Proposes contract dates for professional review: explicit dates in common US formats, plus dates computed from
 * "N days after ratification" or "N days before settlement" when that anchor date is itself stated in the text.
 */
export function analyzeContractDates(content: string | ContractTextPage[], options: { complete?: boolean } = {}) {
  const supplied: ContractTextPage[] = typeof content === 'string' ? [{ text: content }] : content;
  const issues: ContractDateIssue[] = [],
    candidates: DateCandidate[] = [];
  const issue = (value: ContractDateIssue) => {
    if (issues.length < 50) issues.push(value);
  };
  let remaining = MAX_CONTRACT_TEXT_CHARS;
  const pages = supplied.slice(0, 100).map(page => {
    const text = page.text
      .slice(0, remaining)
      .replace(/\r\n?/g, '\n')
      .replace(/[^\S\n]+/g, ' ');
    remaining -= Math.min(page.text.length, remaining);
    return { page: page.page, text };
  });
  const incomplete =
    options.complete === false ||
    supplied.length > 100 ||
    supplied.reduce((count, page) => count + page.text.length, 0) > MAX_CONTRACT_TEXT_CHARS;
  if (incomplete)
    issue({
      code: 'analysis-limit',
      message:
        'Text extraction is incomplete or exceeds 100 pages / 250,000 characters. Relative calculations are withheld because later text may change an anchor.',
    });
  const evidence = (page: ContractTextPage, index: number, length: number): DateTextEvidence => ({
    page: page.page,
    start: index,
    end: index + length,
    quote: page.text.slice(index, index + length),
    offsetBasis: 'normalized-page-text',
  });
  const stated: { candidate: DateCandidate; kind?: string; pageIndex: number; index: number }[] = [];
  for (const [pageIndex, page] of pages.entries())
    for (const { regex, parse } of PATTERNS) {
      for (const match of page.text.matchAll(regex)) {
        if (stated.length >= 100) {
          issue({
            code: 'analysis-limit',
            message: 'The 100-candidate limit was reached; additional dates require manual review.',
          });
          break;
        }
        const date = iso(...parse(match)),
          source = evidence(page, match.index!, match[0].length);
        if (!date) {
          issue({
            code: 'invalid-date',
            message: 'A date-shaped value is not a valid calendar date; no deadline was proposed.',
            evidence: source,
          });
          continue;
        }
        if (stated.some(item => item.pageIndex === pageIndex && item.index === match.index)) continue;
        const event = eventFor(page.text, match.index!, match[0].length);
        stated.push({
          candidate: {
            date,
            context: contextAt(page.text, match.index!, match[0].length),
            approved: false,
            label: event?.label,
            basis: 'stated',
            evidence: source,
          },
          kind: event?.kind,
          pageIndex,
          index: match.index!,
        });
      }
    }
  stated.sort((a, b) => a.pageIndex - b.pageIndex || a.index - b.index);
  candidates.push(...stated.map(item => item.candidate));
  if (incomplete || stated.length >= 100) return { candidates, issues, version: CONTRACT_DATE_VERSION };
  const relative = new RegExp(
    `(?<![\\w.,-])(\\d+|(?:${NUMBER_TOKEN})(?:[- ](?:${NUMBER_TOKEN})){0,5})\\s*(?:\\((\\d+)\\)\\s*)?(calendar\\s+|business\\s+|banking\\s+)?days?\\s+(after|following|from|of|before|prior to)\\s+(?:the\\s+)?(?:date\\s+of\\s+)?(?:final\\s+)?(ratification|contract acceptance|acceptance|effective date|execution|settlement|closing|close of escrow)\\b`,
    'gi',
  );
  for (const page of pages)
    for (const match of page.text.matchAll(relative)) {
      const source = evidence(page, match.index!, match[0].length);
      const amount = periodNumber(match[1]);
      const kind = match[5].toLowerCase().replace('contract acceptance', 'acceptance');
      if (!amount || amount > 365) {
        issue({
          code: 'unsupported-period',
          message:
            'Unsupported day count. Use professional review; this calculator accepts numeric 1–365 or recognized written 1–99 day counts.',
          evidence: source,
        });
        continue;
      }
      if (match[2] && Number(match[2]) !== amount) {
        issue({
          code: 'conflicting-period',
          message:
            'Written and parenthetical day counts disagree. Resolve the contract wording before computing a date.',
          evidence: source,
        });
        continue;
      }
      if (/^(from|of)$/i.test(match[4])) {
        issue({
          code: 'ambiguous-direction',
          message:
            '“From/of” does not establish the counting convention. Confirm direction and whether the anchor day counts; no date was guessed.',
          evidence: source,
        });
        continue;
      }
      const anchors = stated.filter(item => item.kind === kind);
      const dates = new Set(anchors.map(item => item.candidate.date));
      if (dates.size !== 1) {
        issue({
          code: dates.size ? 'conflicting-anchors' : 'missing-anchor',
          message: dates.size
            ? `Multiple stated ${kind} dates conflict. No first-date assumption was made.`
            : `No uniquely stated ${kind} date was found. Other event dates are not treated as equivalent.`,
          evidence: source,
          anchors: anchors.map(item => ({ date: item.candidate.date, kind, evidence: item.candidate.evidence! })),
        });
        continue;
      }
      if (candidates.length >= 100) {
        issue({
          code: 'analysis-limit',
          message: 'The 100-candidate limit was reached; additional relative terms require manual review.',
        });
        break;
      }
      const base = anchors[0].candidate,
        business = /business|banking/i.test(match[3] || ''),
        backwards = /before|prior/i.test(match[4]);
      const warnings = [
        'Arithmetic excludes the named anchor day. Verify the executed contract, applicability and any deadline-extension rules.',
      ];
      if (!match[3])
        warnings.push('“Days” was not qualified: calendar-day arithmetic is an explicit assumption for review.');
      if (business)
        warnings.push(
          'Weekdays-only estimate: no jurisdiction, bank or holiday calendar was applied. The contractual deadline may differ.',
        );
      candidates.push({
        date: addDays(base.date, amount, business, backwards ? -1 : 1),
        context: contextAt(page.text, match.index!, match[0].length),
        approved: false,
        label: labelFor(page.text, match.index!, 0),
        basis: 'computed',
        rule: `${amount} ${business ? 'business' : 'calendar'} day${amount === 1 ? '' : 's'} ${backwards ? 'before' : 'after'} ${kind} (${base.date})${business ? '; weekends skipped, holidays not considered' : ''}`,
        evidence: source,
        anchor: { kind, date: base.date, evidence: base.evidence! },
        warnings,
      });
    }
  return { candidates, issues, version: CONTRACT_DATE_VERSION };
}
export function extractContractDates(content: string): DateCandidate[] {
  return analyzeContractDates(content).candidates;
}
