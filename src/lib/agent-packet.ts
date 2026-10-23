import { calculationChecksum } from './analytics';
import type { EvidenceTimeline } from './evidence-timeline';
import type { HomeDecisionBrief } from './home-decision-brief';
import type { OsBrief, OsItem, RoomSummary } from './homeowner-os';
import { offerLabRecord, type OfferComparison, type OfferLab } from './offer-lab';

export const AGENT_PACKET_VERSION = 'ascent-agent-packet-1';
/**
 * What a homeowner can choose to hand an agent. The packet is built in the browser and downloaded; Ascent sends it
 * nowhere. Private parts (offer terms, finances, the transaction) are off until the homeowner turns them on.
 */
export const packetParts = ['estimate', 'records', 'questions', 'offers', 'finance', 'transaction'] as const;
export type PacketPart = (typeof packetParts)[number];
export const packetPartLabels: Record<PacketPart, { label: string; detail: string; private: boolean }> = {
  estimate: {
    label: 'Estimate and comparable sales',
    detail: 'The verdict, the estimate if Ascent states one, the leading recorded sales and the sources.',
    private: false,
  },
  records: {
    label: 'Public-record timeline',
    detail: 'Recorded sales, permits, assessments and flood mapping, each with its dates and source.',
    private: false,
  },
  questions: {
    label: 'Questions for a professional',
    detail: 'The questions the records raise. Questions about your offers or finances are added only with them.',
    private: false,
  },
  offers: {
    label: 'Offer terms and comparison',
    detail: 'Every offer’s terms, your selling or buying assumptions and the calculated figures.',
    private: true,
  },
  finance: {
    label: 'Your finances',
    detail: 'Your financial summary from My Decisions, including payoff and proceeds figures.',
    private: true,
  },
  transaction: {
    label: 'Transaction milestones and deadlines',
    detail: 'Stage, milestones, deadlines, open tasks and inspection items from your Transaction Room.',
    private: true,
  },
};
export const DEFAULT_PACKET_PARTS: readonly PacketPart[] = ['estimate', 'records', 'questions'];

export type AgentPacketInput = {
  os: OsBrief;
  brief: HomeDecisionBrief;
  timeline: EvidenceTimeline | null;
  lab: OfferLab | null;
  offers: OfferComparison | null;
  room: RoomSummary | null;
  include: readonly PacketPart[];
  createdAt: string;
};
const PRIVATE_REF = /^(offer|calculation|finance|room|saved)\b/;
/** Drops any item that cites a part the homeowner left out, so a public part cannot carry private figures. */
const publicOnly = (items: OsItem[], include: ReadonlySet<PacketPart>) =>
  items.filter(item =>
    item.refs.every(ref => {
      if (!PRIVATE_REF.test(ref)) return true;
      if (/^(offer|calculation)\b/.test(ref)) return include.has('offers');
      if (/^finance\b/.test(ref)) return include.has('finance');
      if (/^room\b/.test(ref)) return include.has('transaction');
      return false;
    }),
  );

export function agentPacket(input: AgentPacketInput) {
  const include = new Set(input.include.filter(part => packetParts.includes(part)));
  const { os, brief, timeline } = input;
  const body = {
    version: AGENT_PACKET_VERSION,
    createdAt: input.createdAt,
    preparedBy: 'The homeowner, with Ascent. Ascent did not send this packet to anyone.',
    property: { address: os.property.address, market: os.property.marketLabel, asOf: os.property.asOf },
    included: packetParts.filter(part => include.has(part)),
    excluded: [
      ...packetParts.filter(part => !include.has(part)).map(part => packetPartLabels[part].label),
      'Documents, notes, saved versions and account details (never included; share documents through a Transaction Room invitation)',
    ],
    estimate: include.has('estimate')
      ? {
          verdict: os.value.verdict,
          label: os.value.label,
          answer: os.value.answer,
          // A withheld estimate stays withheld: no figure leaves with a declined verdict.
          estimate: brief.value.verdict === 'declined' ? null : (brief.value.estimate?.value ?? null),
          range: brief.value.verdict === 'declined' ? null : (brief.value.range?.text ?? null),
          reasons: brief.value.reasons,
          comparables: brief.comparables.leading.map(item => ({
            address: item.address,
            soldPrice: item.soldPrice?.value ?? null,
            adjustedPrice: brief.value.verdict === 'declined' ? null : item.adjustedPrice.value,
            weightPercent: brief.value.verdict === 'declined' ? null : item.weightPercent,
            distanceMiles: item.distanceMiles,
            enteredByHomeowner: item.entered,
          })),
          sources: brief.reliability.sources.map(source => ({
            label: source.label,
            license: source.license,
            observedAt: source.observedAt,
          })),
          missingFacts: brief.missingFacts.map(item => item.fact),
        }
      : null,
    records:
      include.has('records') && timeline
        ? {
            checkedLive: timeline.live?.checkedAt ?? null,
            events: timeline.events
              .filter(event => event.category !== 'source')
              .map(event => ({
                date: event.date,
                dateLabel: event.dateLabel,
                title: event.title,
                values: event.values,
                conflict: event.conflict,
                sources: event.sources.map(source => source.label),
              })),
            gaps: timeline.gaps,
          }
        : null,
    questions: include.has('questions') ? publicOnly(os.questions, include).map(item => item.text) : null,
    offers:
      include.has('offers') && input.lab && input.offers
        ? { ...offerLabRecord(input.lab, input.offers, os.property.address), exportedAt: input.createdAt }
        : null,
    finance: include.has('finance') ? publicOnly(os.finance, include).map(item => item.text) : null,
    transaction:
      include.has('transaction') && input.room
        ? {
            stage: input.room.stage,
            milestones: input.room.milestones,
            deadlines: input.room.deadlines,
            openTasks: input.room.tasks.filter(task => !task.done),
            inspection: input.room.inspection,
          }
        : null,
    limits: os.limits,
  };
  return { ...body, checksum: calculationChecksum(body) };
}
export type AgentPacket = ReturnType<typeof agentPacket>;
