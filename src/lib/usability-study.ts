import { z } from 'zod';
import { buildHomeDecisionBrief } from './home-decision-brief';
import { defaultDemoState, sampleEvidence, type StudioState } from './demo-studio';
import { financeBreakEvens, financeSensitivity } from './finance-sensitivity';
import { exampleFinance, type FinanceInputs } from './homeowner-finance';
import { evidencePassport, createHomeSnapshot, emptyOwnerNotes } from './homeowner-passport';
import { sparseStudyEvidence, studyStatePath, type StudyState } from './study-states';
import { digestOf } from './valuation-validation';

/**
 * The Home Decision Brief comprehension study as code. The protocol below is the registered one: its digest is
 * recorded in evidence/usability/registration.json before any session, and analysis refuses results gathered
 * under any other protocol. Changing a task, criterion or threshold means declaring a new protocol id.
 */
export const USABILITY_PROTOCOL_ID = 'ascent-usability-brief-1';

const task = (
  id: string,
  name: string,
  state: StudyState,
  prompt: string,
  criterion: string,
  accept: string,
  reject: string,
) => ({ id, name, state, prompt, criterion, accept, reject });

export const usabilityProtocol = {
  id: USABILITY_PROTOCOL_ID,
  question:
    'Can homeowners who are not real estate professionals correctly interpret what the brief says, and what it does not say, well enough to decide what to do next?',
  participants: {
    min: 12,
    max: 16,
    eligibility:
      'Adults who own a home, or expect to sell one within two years, in a covered market (DC or Montgomery / Prince George’s, Maryland).',
    excluded: 'Licensed real estate agents, appraisers and lenders.',
    consent:
      'Informed consent, the right to stop at any time, and modest compensation set before recruitment. Participant identities and recordings are never published.',
    finances:
      'Participants never enter their real mortgage or finances. Scored tasks use the prepared fictional states; afterwards a participant may explore a public-record address of their choice, unscored.',
    targets: [
      { id: 'phone', label: 'At least half of participants use a phone', minShare: 0.5 },
      { id: 'assistive', label: 'At least two participants use a screen reader or magnification', minCount: 2 },
      { id: 'housing', label: 'Both house and condo owners take part', minCount: 1 },
      { id: 'age', label: 'Participants come from more than one age band', minCount: 2 },
    ],
  },
  procedure:
    'Tasks run in order T1–T9. Each starts from a fresh page at its prepared state. The facilitator reads the prompt verbatim and does not explain the interface; a hint, if one is given, is recorded and the task is not unaided.',
  tasks: [
    task(
      'T1',
      'Value',
      'value',
      'What does Ascent say this home is worth, and how sure is it?',
      'States the estimate and that it is an estimate with stated limits; does not call the observed range a confidence interval or guarantee',
      'Gives the estimate (approximately is fine) and says it is an estimate with limits, such as a practice figure from fictional sales or one that needs care.',
      'Treats the figure as a sale price, appraisal or guarantee, or calls the range of adjusted sales a confidence interval.',
    ),
    task(
      'T2',
      'Abstention',
      'abstention',
      'What does Ascent say this home is worth?',
      'States that Ascent does not give a value for this home and names the reason (too few sales)',
      'Says no value is stated, and that only two eligible recorded sales were found or that there were too few sales.',
      'Gives a number as the value, or says no value is stated without the reason.',
    ),
    task(
      'T3',
      'Evidence',
      'value',
      'Which recorded sale influences the estimate most, and why?',
      'Names the highest-weight sale and one reason (weight, distance, similarity or adjustment)',
      'Names the leading sale in the answer key and one reason: its weight, closeness, recency, similar size or its adjustments.',
      'Names another sale, or a reason unrelated to the arithmetic, such as the highest price.',
    ),
    task(
      'T4',
      'Ranges',
      'value',
      'Is the home certain to sell within the range shown?',
      'Says no: the range is the spread of adjusted sales, not a promise',
      'Says no, and that the range is the spread of the adjusted sales rather than a promise or prediction.',
      'Says yes or probably, or describes the range as a probability or confidence interval.',
    ),
    task(
      'T5',
      'Missing facts',
      'value',
      'What would you need to find out before relying on this?',
      'Names at least two missing facts from the brief',
      'Names two or more facts listed under the brief’s missing facts, in their own words.',
      'Names fewer than two, or only facts the brief does not list.',
    ),
    task(
      'T6',
      'Choices',
      'finance',
      'What would you have after selling now, and how does renting compare?',
      'States the net proceeds after selling costs, and that the choices are not ranked or equivalent housing',
      'Gives the net proceeds from selling now in the answer key and compares renting without treating either as recommended, ranked or equivalent housing.',
      'Gives the sale price as the proceeds, or states that one choice is the better or recommended one.',
    ),
    task(
      'T7',
      'Sensitivity',
      'finance',
      "Which of your inputs changes the 'Continue owning' result most?",
      'Names the top driver from the Compare panel',
      'Names the top driver for Continue owning in the answer key.',
      'Names another input.',
    ),
    task(
      'T8',
      'Break-even',
      'finance',
      'Below what sale price does selling leave you worse off than continuing to own, under these inputs?',
      'States the break-even sale price and that it depends on the entered assumptions',
      'Gives the break-even sale price in the answer key and says it depends on the entered inputs.',
      'Gives another figure, or treats the threshold as a forecast or a recommended price.',
    ),
    task(
      'T9',
      'Sharing',
      'finance',
      'Export something you could send to a relative without including your mortgage.',
      'Produces the default (public) export and confirms it omits the mortgage',
      'Downloads the sharing passport with private details left out and says the mortgage is not included.',
      'Includes private details, or cannot produce or describe the export.',
    ),
  ],
  successShare: 0.8,
  measures: [
    'Whether each criterion was met',
    'Time on task',
    'Completion without assistance',
    'Errors',
    'Every misinterpretation, verbatim',
    'System Usability Scale score',
    'Accessibility barriers observed with assistive technology',
  ],
  analysis: [
    'A criterion is met when at least 80% of participants meet it. A participant who did not attempt a task counts as not meeting it.',
    'Each criterion is reported as a count with a 95% Wilson interval; small samples are counts, not population rates.',
    'Every misinterpretation and accessibility barrier is reported.',
    'Interface changes made in response are listed with the finding that prompted them and re-tested with new participants, never the same ones.',
    'Results, including failed criteria, are published with the date, the commit tested and the facilitators’ notes.',
  ],
} as const;
export type UsabilityTask = (typeof usabilityProtocol.tasks)[number];
export const usabilityProtocolDigest = () => digestOf(usabilityProtocol);
const taskIds = usabilityProtocol.tasks.map(item => item.id) as [string, ...string[]];

/** System Usability Scale items (Brooke, 1996), answered 1 (strongly disagree) to 5 (strongly agree). */
export const susItems = [
  'I think that I would like to use this system frequently.',
  'I found the system unnecessarily complex.',
  'I thought the system was easy to use.',
  'I think that I would need the support of a technical person to be able to use this system.',
  'I found the various functions in this system were well integrated.',
  'I thought there was too much inconsistency in this system.',
  'I would imagine that most people would learn to use this system very quickly.',
  'I found the system very cumbersome to use.',
  'I felt very confident using the system.',
  'I needed to learn a lot of things before I could get going with this system.',
] as const;
/** Odd items score answer − 1, even items 5 − answer; the sum times 2.5 gives 0–100. */
export function susScore(answers: readonly number[]) {
  if (answers.length !== 10 || answers.some(value => !Number.isInteger(value) || value < 1 || value > 5))
    throw new Error('SUS needs ten answers from 1 to 5.');
  return answers.reduce((sum, value, i) => sum + (i % 2 === 0 ? value - 1 : 5 - value), 0) * 2.5;
}

/** Wilson score interval for a binomial proportion; z = 1.96 for 95%. */
export function wilsonInterval(successes: number, n: number, z = 1.959963984540054): [number, number] {
  if (!n) return [0, 1];
  const p = successes / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator;
  // At 0 or n successes the bounds are exactly 0 or 1; the formula leaves floating-point residue there.
  return [successes === 0 ? 0 : Math.max(0, centre - half), successes === n ? 1 : Math.min(1, centre + half)];
}

const verbatim = z.string().trim().min(1).max(1000);
export const usabilityResultsSchema = z
  .object({
    schema: z.literal('ascent-usability-results-1'),
    protocolId: z.literal(USABILITY_PROTOCOL_ID),
    protocolDigest: z.string().regex(/^sha256-[0-9a-f]{64}$/),
    studyId: z.string().regex(/^[a-z0-9][a-z0-9-]{2,60}$/),
    /** The exact build participants used. */
    commit: z.string().regex(/^[0-9a-f]{40}$/),
    /** A retest names the earlier study whose findings prompted the interface changes being tested. */
    retestOf: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{2,60}$/)
      .nullable(),
    facilitators: z.array(z.string().trim().min(2).max(200)).min(1).max(10),
    facilitatorNotes: z.string().max(20000),
    sessions: z
      .array(
        z
          .object({
            /** A code such as P01, never a name. */
            participant: z.string().regex(/^P\d{2}$/),
            date: z.iso.date(),
            device: z.enum(['phone', 'tablet', 'desktop']),
            assistiveTechnology: z.enum(['none', 'screen-reader', 'magnification', 'other']),
            housing: z.enum(['house', 'condo']),
            ageBand: z.enum(['18-34', '35-49', '50-64', '65+']),
            tasks: z
              .array(
                z
                  .object({
                    task: z.enum(taskIds),
                    outcome: z.enum(['met', 'not-met', 'not-attempted']),
                    unaided: z.boolean(),
                    seconds: z.number().int().min(0).max(3600).nullable(),
                    errors: z.number().int().min(0).max(50),
                    misinterpretations: z.array(verbatim).max(20),
                    notes: z.string().max(2000),
                  })
                  .strict(),
              )
              .length(usabilityProtocol.tasks.length),
            sus: z.array(z.number().int().min(1).max(5)).length(10).nullable(),
            barriers: z.array(z.object({ task: z.enum(taskIds).nullable(), description: verbatim }).strict()).max(50),
          })
          .strict(),
      )
      .min(1)
      .max(40),
  })
  .strict()
  .refine(
    results =>
      new Set(results.sessions.map(session => session.participant)).size === results.sessions.length &&
      results.sessions.every(session => session.tasks.every((entry, i) => entry.task === taskIds[i])),
    { message: 'Each participant appears once, with tasks T1–T9 in order.' },
  );
export type UsabilityResults = z.infer<typeof usabilityResultsSchema>;

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const round = (value: number, digits = 4) => Number(value.toFixed(digits));

/** Everything the protocol says to report, computed from validated results only. */
export function analyzeUsability(input: unknown) {
  const results = usabilityResultsSchema.parse(input);
  if (results.protocolDigest !== usabilityProtocolDigest())
    throw new Error('These results were gathered under a different protocol digest.');
  const sessions = results.sessions;
  const n = sessions.length;
  const count = <T extends string>(values: T[]) =>
    values.reduce<Record<string, number>>((tally, value) => ({ ...tally, [value]: (tally[value] ?? 0) + 1 }), {});
  const devices = count(sessions.map(s => s.device));
  const assistive = sessions.filter(
    s => s.assistiveTechnology === 'screen-reader' || s.assistiveTechnology === 'magnification',
  ).length;
  const housing = count(sessions.map(s => s.housing));
  const ages = count(sessions.map(s => s.ageBand));
  const targets = usabilityProtocol.participants.targets.map(target => {
    const met =
      target.id === 'phone'
        ? (devices.phone ?? 0) / n >= target.minShare
        : target.id === 'assistive'
          ? assistive >= target.minCount
          : target.id === 'housing'
            ? (housing.house ?? 0) >= target.minCount && (housing.condo ?? 0) >= target.minCount
            : Object.keys(ages).length >= target.minCount;
    const detail =
      target.id === 'phone'
        ? `${devices.phone ?? 0} of ${n} on a phone`
        : target.id === 'assistive'
          ? `${assistive} used a screen reader or magnification`
          : target.id === 'housing'
            ? `${housing.house ?? 0} house, ${housing.condo ?? 0} condo`
            : `${Object.keys(ages).length} age band${Object.keys(ages).length === 1 ? '' : 's'}`;
    return { id: target.id, label: target.label, met, detail };
  });
  const tasks = usabilityProtocol.tasks.map((definition, i) => {
    const entries = sessions.map(session => ({ participant: session.participant, ...session.tasks[i] }));
    const met = entries.filter(entry => entry.outcome === 'met').length;
    const [low, high] = wilsonInterval(met, n);
    return {
      id: definition.id,
      name: definition.name,
      criterion: definition.criterion,
      met,
      notMet: entries.filter(entry => entry.outcome === 'not-met').length,
      notAttempted: entries.filter(entry => entry.outcome === 'not-attempted').length,
      n,
      share: round(met / n),
      wilson95: [round(low), round(high)] as [number, number],
      criterionMet: met / n >= usabilityProtocol.successShare,
      unaided: entries.filter(entry => entry.unaided && entry.outcome !== 'not-attempted').length,
      medianSeconds: median(entries.flatMap(entry => (entry.seconds === null ? [] : [entry.seconds]))),
      errors: entries.reduce((sum, entry) => sum + entry.errors, 0),
      misinterpretations: entries.flatMap(entry =>
        entry.misinterpretations.map(text => ({ participant: entry.participant, text })),
      ),
    };
  });
  const sus = sessions.flatMap(session =>
    session.sus ? [{ participant: session.participant, score: susScore(session.sus) }] : [],
  );
  const report = {
    schema: 'ascent-usability-report-1' as const,
    protocolId: results.protocolId,
    protocolDigest: results.protocolDigest,
    studyId: results.studyId,
    commit: results.commit,
    retestOf: results.retestOf,
    resultsDigest: digestOf(results),
    dates: {
      from: sessions.map(s => s.date).sort()[0],
      to: sessions
        .map(s => s.date)
        .sort()
        .at(-1)!,
    },
    participants: {
      n,
      withinPlan: n >= usabilityProtocol.participants.min && n <= usabilityProtocol.participants.max,
      devices,
      assistive,
      housing,
      ageBands: ages,
    },
    targets,
    tasks,
    criteriaMet: tasks.filter(item => item.criterionMet).length,
    sus: {
      n: sus.length,
      mean: sus.length ? round(sus.reduce((sum, item) => sum + item.score, 0) / sus.length, 1) : null,
      median: median(sus.map(item => item.score)),
      scores: sus,
    },
    barriers: sessions.flatMap(session =>
      session.barriers.map(barrier => ({ participant: session.participant, ...barrier })),
    ),
    facilitators: results.facilitators,
    facilitatorNotes: results.facilitatorNotes,
  };
  return { ...report, reportDigest: digestOf(report) };
}
export type UsabilityReport = ReturnType<typeof analyzeUsability>;

const pct = (value: number) => `${Math.round(value * 100)}%`;
/** The published Markdown: every count, interval, misinterpretation and barrier, failures first-class. */
export function usabilityReportMarkdown(report: UsabilityReport) {
  const lines = [
    `# Comprehension study results · ${report.studyId}`,
    '',
    `Protocol \`${report.protocolId}\` (${report.protocolDigest}), sessions ${report.dates.from} to ${report.dates.to}, build \`${report.commit}\`${report.retestOf ? `, retest of ${report.retestOf}` : ''}.`,
    '',
    `**${report.criteriaMet} of ${report.tasks.length} criteria met** by at least ${pct(usabilityProtocol.successShare)} of ${report.participants.n} participants${report.participants.withinPlan ? '' : ` (the protocol plans ${usabilityProtocol.participants.min}–${usabilityProtocol.participants.max})`}. Counts are reported with 95% Wilson intervals; with this few participants they are not population rates.`,
    '',
    '| Task | Criterion | Met | Wilson 95% | Not attempted | Unaided | Median seconds | Verdict |',
    '| --- | --- | ---: | --- | ---: | ---: | ---: | --- |',
    ...report.tasks.map(
      item =>
        `| ${item.id} · ${item.name} | ${item.criterion} | ${item.met} of ${item.n} | ${pct(item.wilson95[0])}–${pct(item.wilson95[1])} | ${item.notAttempted} | ${item.unaided} | ${item.medianSeconds ?? '—'} | ${item.criterionMet ? 'Met' : '**Not met**'} |`,
    ),
    '',
    '## Participants',
    '',
    ...report.targets.map(target => `- ${target.met ? 'Met' : '**Not met**'}: ${target.label} (${target.detail}).`),
    '',
    `System Usability Scale: ${report.sus.n ? `mean ${report.sus.mean}, median ${report.sus.median} (${report.sus.n} participants)` : 'not collected'}.`,
    '',
    '## Every misinterpretation, verbatim',
    '',
    ...report.tasks.flatMap(item =>
      item.misinterpretations.length
        ? [
            `**${item.id} · ${item.name}**`,
            '',
            ...item.misinterpretations.map(entry => `- ${entry.participant}: “${entry.text}”`),
            '',
          ]
        : [],
    ),
    report.tasks.some(item => item.misinterpretations.length) ? '' : 'None recorded.',
    '',
    '## Accessibility barriers',
    '',
    ...(report.barriers.length
      ? report.barriers.map(
          barrier => `- ${barrier.participant}${barrier.task ? ` (${barrier.task})` : ''}: ${barrier.description}`,
        )
      : ['None recorded.']),
    '',
    '## Facilitator notes',
    '',
    report.facilitatorNotes || 'None.',
    '',
    `Facilitators: ${report.facilitators.join(', ')}. Report digest \`${report.reportDigest}\`; results digest \`${report.resultsDigest}\`.`,
    '',
  ];
  return lines.join('\n');
}

/** The finance state's inputs, exactly as the workbench applies the illustrative example to the sample. */
export function illustrativeStudyInputs(): { state: StudioState; finance: FinanceInputs } {
  const finance = exampleFinance();
  return {
    state: {
      ...structuredClone(defaultDemoState),
      listPrice: finance.salePrice,
      commissionPercent: finance.commissionPercent!,
      closingPercent: finance.closingPercent!,
      concessions: finance.concessions!,
      payoff: finance.mortgageBalance!,
    },
    finance,
  };
}

/**
 * The correct answers on this build, computed with the same engines the prepared states run. Facilitators score
 * against these; docs/usability/answer-key.md must equal `answerKeyMarkdown()` for the commit being tested.
 */
export function usabilityAnswerKey() {
  const value = buildHomeDecisionBrief({ evidence: sampleEvidence, state: defaultDemoState });
  const sparse = buildHomeDecisionBrief({ evidence: sparseStudyEvidence, state: defaultDemoState });
  const { state, finance } = illustrativeStudyInputs();
  const money = buildHomeDecisionBrief({ evidence: sampleEvidence, state, finance });
  const lead = value.comparables.leading[0];
  const sell = money.financial.choices.find(choice => choice.kind === 'sell')!;
  const rent = money.financial.choices.find(choice => choice.kind === 'rent')!;
  const figure = (choice: typeof sell, label: string) => choice.figures.find(item => item.label === label)?.text ?? '—';
  const hold = financeSensitivity(finance).byChoice.find(choice => choice.kind === 'hold')!.drivers[0];
  const breakEven = financeBreakEvens(finance).find(item => item.id === 'sale-price-vs-hold')!;
  const sharing = evidencePassport(
    createHomeSnapshot(sampleEvidence, state, finance, emptyOwnerNotes(), '2026-10-15T12:00:00.000Z'),
    false,
  );
  return {
    T1: { estimate: value.value.estimate!.text, label: value.value.label, range: value.value.range!.text },
    T2: { label: sparse.value.label, reason: sparse.value.reasons[0] },
    T3: {
      sale: lead.address,
      weightPercent: lead.weightPercent,
      distanceMiles: lead.distanceMiles,
      ageDays: lead.ageDays,
      largestAdjustment: lead.largestAdjustment,
    },
    T4: { range: value.value.range!.text },
    T5: { facts: value.missingFacts.map(item => item.fact) },
    T6: {
      sellNetProceeds: figure(sell, 'Net proceeds at closing'),
      sellNetPosition: figure(sell, 'Net position at horizon'),
      rentMonthlyCashFlow: figure(rent, 'Initial monthly cash flow'),
      rentNetPosition: figure(rent, 'Net position at horizon'),
      horizonMonths: money.financial.horizonMonths,
    },
    T7: { topDriver: hold.label, step: hold.step },
    T8: { breakEven: breakEven.value, status: breakEven.status },
    T9: { mortgageInSharingExport: /"(mortgageBalance|payoff|finance)"/.test(JSON.stringify(sharing)) },
  };
}

const usd = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
export function answerKeyMarkdown() {
  const key = usabilityAnswerKey();
  const stateFor = (state: StudyState) => `\`${studyStatePath(state)}\``;
  const answers: Record<string, string> = {
    T1: `${key.T1.estimate}, labeled “${key.T1.label}”. The adjusted sales span ${key.T1.range}, which the brief says is not a confidence interval.`,
    T2: `“${key.T2.label}”. Reason shown: ${key.T2.reason}`,
    T3: `${key.T3.sale}: ${key.T3.weightPercent}% of the weight, ${key.T3.distanceMiles} miles away, closed ${key.T3.ageDays} days before the data date${key.T3.largestAdjustment ? `; largest adjustment ${key.T3.largestAdjustment}` : ''}.`,
    T4: `No. ${key.T4.range} is the spread of the adjusted sales, not a promise.`,
    T5: `Any two of: ${key.T5.facts.join('; ')}.`,
    T6: `Selling now: net proceeds ${key.T6.sellNetProceeds}, net position ${key.T6.sellNetPosition} at month ${key.T6.horizonMonths}. Renting: initial monthly cash flow ${key.T6.rentMonthlyCashFlow}, net position ${key.T6.rentNetPosition}. The brief does not rank them.`,
    T7: `${key.T7.topDriver} (moved ${key.T7.step}).`,
    T8:
      key.T8.status === 'found' && key.T8.breakEven !== null
        ? `${usd(key.T8.breakEven)}, under the entered inputs.`
        : 'Not found under these inputs.',
    T9: `Reports & History, leave private details out, download the sharing passport. Its mortgage balance is ${key.T9.mortgageInSharingExport ? '**included (a defect)**' : 'omitted'}.`,
  };
  return [
    '# Answer key for `ascent-usability-brief-1`',
    '',
    'Generated by `npm run usability:answer-key` from the prepared states on this commit. It is not shown to participants. Score each answer against the task’s criterion; the figures below are what the page shows.',
    '',
    '| Task | Prepared state | Correct answer on this build |',
    '| --- | --- | --- |',
    ...usabilityProtocol.tasks.map(
      item => `| ${item.id} · ${item.name} | ${stateFor(item.state)} | ${answers[item.id]} |`,
    ),
    '',
  ].join('\n');
}
