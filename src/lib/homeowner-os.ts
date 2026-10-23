import { calculationChecksum } from './analytics';
import type { HomeDecisionBrief } from './home-decision-brief';
import type { HomeSnapshot } from './homeowner-passport';
import type { EvidenceTimeline } from './evidence-timeline';
import { OFFER_LAB_BOUNDARIES, type OfferComparison, type OfferLab, type ValueContext } from './offer-lab';
import type { WatchEvent, WatchStatus } from './watchtower';

/**
 * The Homeowner OS layer over the Home Decision Brief. It changes nothing in the brief: it gathers the brief, the
 * evidence timeline, the Offer Lab, the Watchtower and the Transaction Room into the four things a homeowner should
 * always be able to see (what we know, how we know it, what is missing, what to do next) and answers questions
 * deterministically from those same records. A value the brief withholds is withheld here too: no figure derived from
 * the estimate appears when the verdict is declined, and earlier saved estimates are never shown as numbers.
 */
export const OS_BRIEF_VERSION = 'ascent-homeowner-os-brief-1';

/** The only path by which an estimate reaches the Offer Lab. A declined verdict yields no estimate. */
export function valueContext(brief: HomeDecisionBrief): ValueContext {
  const stated = brief.value.verdict !== 'declined' && !!brief.value.estimate;
  return {
    verdict: brief.value.verdict,
    estimate: stated ? brief.value.estimate!.value : null,
    label: brief.value.label,
  };
}

export type RoomSummary = {
  stage: string;
  milestones: { id: string; title: string; due: string | null; status: string }[];
  tasks: { id: string; title: string; due: string | null; done: boolean }[];
  deadlines: { id: string; label: string; date: string; note: string }[];
  inspection: { id: string; item: string; severity: string; status: string }[];
  financing: { id: string; label: string; done: boolean }[];
  settlement: { id: string; label: string; done: boolean }[];
  documents: { id: string; name: string; section: string }[];
};
export type OsInput = {
  brief: HomeDecisionBrief;
  timeline: EvidenceTimeline | null;
  lab: OfferLab | null;
  offers: OfferComparison | null;
  watch: { status: WatchStatus; events: WatchEvent[] } | null;
  room: RoomSummary | null;
  /** The homeowner's latest saved version of this home, from My Home. */
  saved: HomeSnapshot | null;
  current: { valuationHash: string | null; financeHash: string | null; salesSha256: string | null };
  now: number;
};
export type OsItem = { text: string; refs: string[] };
export type OsBrief = {
  version: typeof OS_BRIEF_VERSION;
  property: HomeDecisionBrief['property'];
  value: { verdict: HomeDecisionBrief['value']['verdict']; label: string; answer: string };
  know: OsItem[];
  how: OsItem[];
  missing: OsItem[];
  next: OsItem[];
  changes: OsItem[];
  records: OsItem[];
  finance: OsItem[];
  offers: OsItem[];
  milestones: OsItem[];
  documents: { item: string; section: string; present: boolean }[];
  questions: OsItem[];
  limits: string[];
  checksum: string;
};

const day = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
const usd = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

/** Documents commonly gathered at each stage. A common list, not a legal requirement or a complete one. */
export const STAGE_DOCUMENTS: Record<string, { item: string; section: string }[]> = {
  preparing: [
    { item: 'Mortgage statement or payoff estimate', section: 'financing' },
    { item: 'Deed or title policy from your purchase', section: 'settlement' },
    { item: 'Permits and receipts for work you did', section: 'documents' },
  ],
  'on-market': [
    { item: 'Listing agreement', section: 'documents' },
    { item: 'Seller disclosure', section: 'documents' },
    { item: 'Mortgage payoff estimate', section: 'financing' },
  ],
  'under-contract': [
    { item: 'Signed purchase contract and addenda', section: 'documents' },
    { item: 'Home inspection report', section: 'inspection' },
    { item: 'Repair or credit agreement', section: 'inspection' },
    { item: 'Appraisal report', section: 'financing' },
  ],
  closing: [
    { item: 'Title commitment', section: 'settlement' },
    { item: 'Closing disclosure or settlement statement', section: 'settlement' },
    { item: 'Final payoff statement', section: 'financing' },
  ],
  closed: [
    { item: 'Final settlement statement', section: 'settlement' },
    { item: 'Recorded deed', section: 'settlement' },
  ],
  archived: [],
};

function upcoming(input: OsInput) {
  const today = new Date(input.now).toISOString().slice(0, 10);
  const items: { date: string; text: string; ref: string }[] = [];
  const reference = input.offers?.analyses.find(item => item.offerId === input.offers?.referenceOfferId);
  for (const analysis of input.offers?.analyses ?? [])
    for (const deadline of analysis.deadlines)
      if (deadline.date && deadline.date >= today && (analysis === reference || deadline.key === 'expires'))
        items.push({
          date: deadline.date,
          text: `${deadline.label} for ${analysis.label} (${deadline.basis === 'entered' ? 'as entered' : deadline.note})`,
          ref: `offer ${analysis.offerId}`,
        });
  for (const deadline of input.room?.deadlines ?? [])
    if (deadline.date >= today)
      items.push({ date: deadline.date, text: deadline.label, ref: `room deadline ${deadline.id}` });
  for (const milestone of input.room?.milestones ?? [])
    if (milestone.due && milestone.due >= today && milestone.status !== 'done')
      items.push({ date: milestone.due, text: `Milestone: ${milestone.title}`, ref: `room milestone ${milestone.id}` });
  for (const task of input.room?.tasks ?? [])
    if (task.due && !task.done && task.due >= today)
      items.push({ date: task.due, text: `Task: ${task.title}`, ref: `room task ${task.id}` });
  return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function questionsFor(input: OsInput): OsItem[] {
  const { brief, offers, lab, timeline } = input;
  const questions: OsItem[] = [];
  if (brief.value.verdict === 'declined')
    questions.push({
      text: 'Ascent withholds an estimate for this home. Ask a licensed agent or appraiser for a price opinion, and show them the recorded sales in the brief.',
      refs: ['brief value'],
    });
  else if (brief.value.verdict === 'limited')
    questions.push({
      text: `The estimate is limited (${brief.value.reasons[0] ?? 'see the brief'}). Ask an agent or appraiser whether the recorded sales reflect your home.`,
      refs: ['brief value'],
    });
  for (const fact of brief.missingFacts.slice(0, 2))
    questions.push({ text: `${fact.fact}: ${fact.obtain}`, refs: ['brief missing facts'] });
  if (lab?.settings.side === 'seller' && lab.settings.mortgagePayoff === null && lab.offers.length)
    questions.push({
      text: 'Ask your lender for a payoff statement; proceeds are shown without one.',
      refs: ['offer lab settings'],
    });
  for (const offer of lab?.offers ?? []) {
    const waived = (['inspection', 'appraisal', 'financing'] as const).filter(
      key => offer.contingencies[key].included === false,
    );
    if (waived.length && offer.financing !== 'cash')
      questions.push({
        text: `${offer.label} waives the ${waived.join(', ')} contingenc${waived.length === 1 ? 'y' : 'ies'} on a financed offer. Ask your agent or attorney what happens if the loan or appraisal falls short.`,
        refs: [`offer ${offer.id}`],
      });
    if (offer.escalationCap !== null)
      questions.push({
        text: `${offer.label} has an escalation clause up to ${usd(offer.escalationCap)}. Ask how it is triggered and what proof of the competing offer it requires.`,
        refs: [`offer ${offer.id}`],
      });
    if (offer.otherTerms.trim())
      questions.push({
        text: `${offer.label} has other written terms. Ask a licensed agent or attorney to read them.`,
        refs: [`offer ${offer.id}`],
      });
  }
  if (offers?.analyses.some(analysis => analysis.deadlines.some(deadline => deadline.basis === 'calculated')))
    questions.push({
      text: 'Some deadlines are counted from an assumed acceptance date. Ask how your contract counts days (calendar or business days, and from which event).',
      refs: ['offer lab deadlines'],
    });
  const flood = timeline?.events.find(
    event => event.category === 'risk' && /special flood hazard area/.test(event.title),
  );
  if (flood)
    questions.push({
      text: 'The home is in a mapped special flood hazard area. Ask your insurer and lender about flood insurance.',
      refs: [`record ${flood.id}`],
    });
  const open =
    timeline?.events.filter(
      event =>
        event.category === 'permit' &&
        /issued|in review|applied/i.test(event.values.find(value => value.label === 'Status')?.value ?? ''),
    ) ?? [];
  if (open.length)
    questions.push({
      text: `${open.length} permit${open.length === 1 ? ' is' : 's are'} recorded without a final approval. Ask whether the work was finished and inspected.`,
      refs: open.slice(0, 3).map(event => `record ${event.id}`),
    });
  for (const item of (input.room?.inspection ?? []).filter(
    entry => entry.severity === 'safety' && entry.status === 'open',
  ))
    questions.push({
      text: `Inspection item “${item.item}” is marked safety and still open. Ask a licensed contractor to assess it.`,
      refs: [`room inspection ${item.id}`],
    });
  return questions;
}

export function buildOsBrief(input: OsInput): OsBrief {
  const { brief, timeline, offers, room, watch, saved, current } = input;
  const stated = brief.value.verdict !== 'declined' && !!brief.value.estimate;
  const know: OsItem[] = [
    { text: brief.value.answer, refs: ['brief value'] },
    { text: brief.comparables.answer, refs: ['brief comparables'] },
  ];
  if (brief.recorded) know.push({ text: brief.recorded.answer, refs: ['brief recorded facts'] });
  if (timeline)
    know.push({
      text: `${timeline.counts.transfers} recorded transfer${timeline.counts.transfers === 1 ? '' : 's'} and ${timeline.counts.permits} permit${timeline.counts.permits === 1 ? '' : 's'} are on this home’s evidence timeline${timeline.live ? `, checked against the public sources on ${day(timeline.live.checkedAt)}` : ''}.`,
      refs: ['timeline'],
    });
  const how: OsItem[] = brief.reliability.sources.map(source => ({
    text: `${source.label}, ${source.license}, observed ${day(source.observedAt)}.`,
    refs: [`source ${source.label}`],
  }));
  for (const source of timeline?.sources ?? [])
    how.push({ text: `${source.label}: ${source.status}, ${source.detail}.`, refs: [`source ${source.sourceId}`] });
  how.push({ text: brief.reliability.answer, refs: ['brief reliability'] });
  const missing: OsItem[] = [
    ...brief.missingFacts.map(item => ({ text: `${item.fact} — ${item.why}`, refs: ['brief missing facts'] })),
    ...(timeline?.gaps ?? []).map(text => ({ text, refs: ['timeline gaps'] })),
    ...(offers?.missing ?? [])
      .slice(0, 8)
      .map(text => ({ text: `Offer term not entered: ${text}.`, refs: ['offer lab'] })),
  ];
  const stageDocuments = (STAGE_DOCUMENTS[room?.stage ?? 'preparing'] ?? []).map(entry => ({
    ...entry,
    present: !!room?.documents.some(document => document.section === entry.section),
  }));
  for (const entry of stageDocuments.filter(item => !item.present))
    missing.push({ text: `Not in your Transaction Room yet: ${entry.item.toLowerCase()}.`, refs: ['room documents'] });
  const due = upcoming(input);
  const next: OsItem[] = [
    ...due.slice(0, 5).map(item => ({ text: `${day(item.date)}: ${item.text}.`, refs: [item.ref] })),
    ...brief.nextSteps.slice(0, 4).map(step => ({ text: `${step.item} ${step.why}`, refs: ['brief next steps'] })),
  ];
  const changes: OsItem[] = [];
  if (saved) {
    changes.push({
      text: `Compared with the version you saved on ${day(saved.savedAt)}.`,
      refs: [`saved ${saved.id}`],
    });
    if ((saved.evidence.snapshot?.salesSha256 ?? null) !== current.salesSha256)
      changes.push({ text: 'The bundled public-records snapshot has been replaced since then.', refs: ['snapshot'] });
    if (saved.calculation.valuationHash !== current.valuationHash)
      changes.push({
        text: 'The valuation calculation differs from your saved version: its inputs, settings or snapshot changed. Open the brief for the current result; earlier figures are kept in your saved version.',
        refs: [`valuation ${current.valuationHash ?? 'none'}`],
      });
    if (saved.calculation.financeHash !== current.financeHash)
      changes.push({
        text: 'Your financial inputs differ from the saved version.',
        refs: [`finance ${current.financeHash ?? 'none'}`],
      });
    for (const event of (watch?.events ?? []).filter(item => item.detectedAt > saved.savedAt).slice(0, 8))
      changes.push({ text: event.title, refs: [`watch ${event.id}`] });
  } else
    changes.push({
      text: 'No saved version of this home yet. Save one in My Decisions to track changes over time.',
      refs: [],
    });
  for (const event of (timeline?.events ?? []).filter(item => item.newSinceSnapshot))
    changes.push({
      text: `${event.title}, dated ${event.date ? day(event.date) : 'unknown'}, is newer than the bundled snapshot and is not in the estimate.`,
      refs: [`record ${event.id}`],
    });
  const records: OsItem[] = (timeline?.events ?? [])
    .filter(event => event.category === 'permit' || event.category === 'assessment' || event.category === 'tax')
    .slice(0, 12)
    .map(event => ({
      text: `${event.title}${event.date ? ` (${event.dateLabel.toLowerCase()} ${event.precision === 'year' ? event.date : day(event.date)})` : ''}.`,
      refs: [`record ${event.id}`],
    }));
  const finance: OsItem[] = [
    { text: brief.financial.answer, refs: [`finance ${brief.references.financeHash ?? 'none'}`] },
  ];
  for (const analysis of offers?.analyses ?? [])
    if (analysis.headline?.value !== null && analysis.headline)
      finance.push({
        text: `${analysis.label}: ${analysis.headline.label.toLowerCase()} ${analysis.headline.text}.`,
        refs: [`offer ${analysis.offerId}`, `calculation ${offers!.calculationHash}`],
      });
  const offerItems: OsItem[] = offers
    ? [
        ...offers.explanation.map(text => ({ text, refs: [`calculation ${offers.calculationHash}`] })),
        { text: offers.estimate.text, refs: stated ? ['brief value'] : [] },
      ]
    : [
        {
          text: 'No offers entered. Compare Offers works out proceeds or cash to close from the terms you enter.',
          refs: [],
        },
      ];
  const milestones: OsItem[] = room
    ? [
        { text: `Transaction stage: ${room.stage.replace('-', ' ')}.`, refs: ['room stage'] },
        ...room.milestones.map(item => ({
          text: `${item.title} — ${item.status}${item.due ? `, due ${day(item.due)}` : ''}.`,
          refs: [`room milestone ${item.id}`],
        })),
        {
          text: `${room.tasks.filter(task => !task.done).length} open task(s); financing checklist ${room.financing.filter(item => item.done).length}/${room.financing.length}; settlement checklist ${room.settlement.filter(item => item.done).length}/${room.settlement.length}.`,
          refs: ['room checklists'],
        },
      ]
    : [
        {
          text: 'No Transaction Room. Open one when you have an account to keep milestones, documents and collaborators together.',
          refs: [],
        },
      ];
  const body = {
    version: OS_BRIEF_VERSION as typeof OS_BRIEF_VERSION,
    property: brief.property,
    value: { verdict: brief.value.verdict, label: brief.value.label, answer: brief.value.answer },
    know,
    how,
    missing,
    next,
    changes,
    records,
    finance,
    offers: offerItems,
    milestones,
    documents: stageDocuments,
    questions: questionsFor(input),
    limits: [...brief.limits, ...OFFER_LAB_BOUNDARIES.slice(0, 2)],
  };
  return { ...body, checksum: calculationChecksum({ ...body, brief: brief.checksum }) };
}

export const osQuestions = ['offers', 'next', 'checklist', 'records', 'finance', 'missing', 'professional'] as const;
export type OsQuestion = (typeof osQuestions)[number];
export type OsAnswer = { label: string; text: string; refs: string[] };

/**
 * Ask Ascent for the Homeowner OS. Every answer is assembled from the records above; no model is called, nothing
 * is predicted, and no offer is recommended. A question the records cannot answer says so.
 */
export function osAnswers(input: OsInput, os: OsBrief = buildOsBrief(input)): Record<OsQuestion, OsAnswer> {
  const { offers, room } = input;
  const join = (items: OsItem[], empty: string, limit = 6) =>
    items.length
      ? items
          .slice(0, limit)
          .map(item => item.text)
          .join(' ')
      : empty;
  const refs = (items: OsItem[], limit = 6) => [...new Set(items.slice(0, limit).flatMap(item => item.refs))];
  const complete = offers?.analyses.filter(analysis => analysis.complete) ?? [];
  const label = offers?.side === 'buyer' ? 'estimated cash to close' : 'estimated proceeds';
  const offerText =
    !offers || !offers.analyses.length
      ? 'No offers are entered yet. Add the terms from each written offer in Compare Offers.'
      : `${complete.length} of ${offers.analyses.length} offers have enough terms to calculate ${label}. ${offers.explanation.join(' ')} The larger figure is arithmetic only: contingencies, financing and timing differ (${
          offers.differences
            .flatMap(item => item.termDifferences)
            .slice(0, 3)
            .join(' ') || 'no term differences entered'
        }), and Ascent does not say which offer to accept.`;
  const openTasks = (room?.tasks ?? []).filter(task => !task.done);
  const unchecked = [...(room?.financing ?? []), ...(room?.settlement ?? [])].filter(item => !item.done);
  const openInspection = (room?.inspection ?? []).filter(
    item => item.status !== 'resolved' && item.status !== 'accepted-as-is',
  );
  return {
    offers: {
      label: 'How do my offers compare?',
      text: offerText,
      refs: offers ? [`calculation ${offers.calculationHash}`] : [],
    },
    next: {
      label: 'What is due next?',
      text: join(
        os.next,
        'Nothing is scheduled. Add offer dates in Compare Offers or deadlines in your Transaction Room.',
        4,
      ),
      refs: refs(os.next, 4),
    },
    checklist: {
      label: 'What is left on my checklist?',
      text: room
        ? `${openTasks.length} open task(s)${
            openTasks.length
              ? `: ${openTasks
                  .slice(0, 4)
                  .map(task => task.title)
                  .join('; ')}`
              : ''
          }. ${unchecked.length} checklist step(s) not done${unchecked.length ? `, next: ${unchecked[0].label}` : ''}. ${openInspection.length} inspection item(s) unresolved. The checklists are common steps; your contract and settlement agent define the actual ones.`
        : 'Open a Transaction Room to keep a checklist. It needs an account; everything else here works without one.',
      refs: room ? ['room tasks', 'room checklists'] : [],
    },
    records: {
      label: 'What has changed in the public records?',
      text: join(os.changes, 'Nothing has been compared yet.'),
      refs: refs(os.changes),
    },
    finance: {
      label: 'How does this affect my finances?',
      text: join(os.finance, 'Enter your financial inputs in My Decisions.'),
      refs: refs(os.finance),
    },
    missing: {
      label: 'What is missing?',
      text: join(os.missing, 'Nothing listed as missing.', 5),
      refs: refs(os.missing, 5),
    },
    professional: {
      label: 'What should I ask a professional?',
      text: join(
        os.questions,
        'No specific questions arise from the records entered so far. A licensed agent or attorney can still review any contract.',
        5,
      ),
      refs: refs(os.questions, 5),
    },
  };
}
