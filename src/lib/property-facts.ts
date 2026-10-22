import { z } from 'zod';

/**
 * Recorded facts about a home beyond what the valuation engine reads: assessor characteristics, building permits,
 * condominium building facts and how current the snapshot is. Every fact names its public source. None of it
 * changes an estimate; the validated engine never sees these fields. The Home Decision Brief uses them to say
 * what the records show about condition and renovations, and what they still cannot show.
 */
export const PROPERTY_FACTS_VERSION = 'ascent-property-facts-1';

export const permitKinds = [
  'renovation',
  'addition',
  'new-construction',
  'demolition',
  'systems',
  'exterior',
  'minor',
  'approval',
] as const;
export type PermitKind = (typeof permitKinds)[number];
export const permitKindLabels: Record<PermitKind, string> = {
  renovation: 'Renovation or repair',
  addition: 'Addition',
  'new-construction': 'New construction',
  demolition: 'Demolition',
  systems: 'Electrical, plumbing or mechanical',
  exterior: 'Exterior or site work',
  minor: 'Minor work',
  approval: 'Final approval only',
};
/** Work that can change a home's condition, size or layout. */
export const MAJOR_PERMIT_KINDS: readonly PermitKind[] = ['renovation', 'addition', 'new-construction', 'demolition'];
export const permitStatuses = ['issued', 'completed', 'expired', 'stop-work', 'other'] as const;
export type PermitStatus = (typeof permitStatuses)[number];
/**
 * Major work that the source shows was actually authorized. A record still in review or awaiting issuance (status
 * `other`) is listed with its recorded status but never counted as work on the home.
 */
export const isMajorWork = (record: Pick<PermitRecord, 'kind' | 'status'>) =>
  MAJOR_PERMIT_KINDS.includes(record.kind) && record.status !== 'other';

const text = (max: number) => z.string().max(max);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const sourceSchema = z
  .object({ id: text(80), label: text(300), license: text(1000), collectedAt: z.iso.datetime() })
  .strict();
const permitSchema = z
  .object({
    id: text(40),
    issued: day,
    kind: z.enum(permitKinds),
    work: text(120),
    status: z.enum(permitStatuses),
    statusLabel: text(60),
    finaled: day.nullable(),
    declaredValue: z.number().int().min(0).max(100_000_000).nullable(),
    scope: z.enum(['home', 'building']),
  })
  .strict();
const comparableSchema = z
  .object({
    structure: text(60).optional(),
    building: text(120).optional(),
    permitBeforeSale: z
      .object({ issued: day, kind: z.enum(permitKinds), work: text(120) })
      .strict()
      .optional(),
  })
  .strict();
export const propertyFactsSchema = z
  .object({
    version: z.literal(PROPERTY_FACTS_VERSION),
    sources: z.array(sourceSchema).max(6),
    recorded: z.array(z.object({ label: text(80), value: text(200), source: text(80) }).strict()).max(30),
    years: z
      .object({
        built: z.number().int().nullable(),
        remodeled: z.number().int().nullable(),
        effective: z.number().int().nullable(),
      })
      .strict(),
    permits: z
      .object({
        source: text(80),
        since: day,
        coverage: text(300),
        /** Whether this source reliably records final approval, so an old permit without one is notable. */
        closeOutRecorded: z.boolean(),
        /** What the statuses mean in this source. */
        statusNote: text(400),
        records: z.array(permitSchema).max(400),
      })
      .strict()
      .nullable(),
    /** Why there are no permit records, when `permits` is null. */
    permitGap: text(400).nullable(),
    building: z
      .object({
        name: text(200).nullable(),
        units: z.number().int().min(0).nullable(),
        otherUnits: z.number().int().min(0).nullable(),
        floor: z.union([z.number().int().min(0).max(200), z.literal('penthouse')]).nullable(),
        floorBasis: text(300),
        id: text(40).nullable(),
      })
      .strict()
      .nullable(),
    /** Keyed by candidate sale id; absent entries say nothing. Saved passports omit these to stay small. */
    comparables: z.record(text(80), comparableSchema),
    later: z
      .object({ checkedAt: z.iso.datetime(), sales: z.number().int().min(0), after: day, source: text(300) })
      .strict()
      .nullable(),
  })
  .strict();
export type PropertyFacts = z.infer<typeof propertyFactsSchema>;
export type PermitRecord = z.infer<typeof permitSchema>;
export type ComparableFacts = z.infer<typeof comparableSchema>;
export type FactSource = z.infer<typeof sourceSchema>;

const titleCase = (value: string) =>
  value
    .toLowerCase()
    .replace(/\b([a-z])/g, letter => letter.toUpperCase())
    .replace(/(?!^)\b(And|Or|Of|The|At|On)\b/g, word => word.toLowerCase());
/** "ALTERATION AND REPAIR" → "Alteration and repair". */
export const sentenceCase = (value: string) => {
  const lower = value.trim().toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};
export const displayName = (value: string) => titleCase(value.trim().replace(/\s+/g, ' '));

/** Plain names for District permit subtypes; others are shown as recorded, in sentence case. */
const DC_WORK: Record<string, string> = {
  'SUPPLEMENTAL/ELECTRICAL': 'Electrical work',
  'SUPPLEMENTAL/PLUMBING AND GAS': 'Plumbing and gas work',
  'SUPPLEMENTAL/MECHANICAL': 'Heating, cooling or ventilation work',
  'SUPPLEMENTAL/BOILER': 'Boiler work',
  'POST CARD/BUILDING': 'Minor building work (postcard permit)',
  'POST CARD/PLUMBING': 'Minor plumbing work (postcard permit)',
  'POST CARD/MECHANICAL': 'Minor heating or cooling work (postcard permit)',
  'POST CARD/GAS FITTING': 'Gas fitting (postcard permit)',
  'POST CARD/ELECTRICAL - GENERAL': 'Minor electrical work (postcard permit)',
  'POST CARD/ELECTRICAL - HEAVY UP': 'Electrical service upgrade (postcard permit)',
  'CONSTRUCTION/ADDITION ALTERATION REPAIR': 'Addition, alteration and repair',
  'CONSTRUCTION/FOUNDATION ONLY': 'Foundation',
  'CONSTRUCTION/MISCELLANEOUS': 'Miscellaneous construction',
};
/** District Department of Buildings permits, by type and subtype. */
export function classifyDcPermit(type: string, subtype: string): { kind: PermitKind; work: string } {
  const work = DC_WORK[`${type}/${subtype}`] ?? sentenceCase(subtype || type);
  if (type === 'SUPPLEMENTAL') return { kind: 'systems', work };
  if (type === 'POST CARD') return { kind: subtype === 'BUILDING' ? 'minor' : 'systems', work };
  if (subtype === 'ALTERATION AND REPAIR') return { kind: 'renovation', work };
  if (subtype === 'ADDITION ALTERATION REPAIR' || subtype === 'ADDITION') return { kind: 'addition', work };
  if (subtype === 'NEW BUILDING' || subtype === 'FOUNDATION ONLY') return { kind: 'new-construction', work };
  if (subtype === 'DEMOLITION' || subtype === 'RAZE') return { kind: 'demolition', work };
  if (subtype === 'MISCELLANEOUS') return { kind: 'minor', work };
  return { kind: 'exterior', work };
}
export function dcPermitStatus(label: string): PermitStatus {
  const status = label.toUpperCase();
  if (status === 'COMPLETED' || status.startsWith('RAZE FINAL APPROVED')) return 'completed';
  if (status.startsWith('PERMIT ISSUED') || status === 'PERMIT RENEWED' || status === 'PERMIT REVISED') return 'issued';
  if (status === 'EXPIRED') return 'expired';
  // In review, awaiting issuance or not issued: listed as recorded, never counted as authorized work.
  return 'other';
}

const MONTGOMERY_WORK: Record<string, string> = {
  ALTER: 'Alteration',
  ADD: 'Addition',
  CONSTRUCT: 'New construction',
  'RESTORE AND / OR REPAIR': 'Restoration or repair',
  'BUILD FOUNDATION': 'Foundation',
  'FINAL ONLY AP': 'Final approval',
};
/** Montgomery County residential permits: the work type and the structure it applies to. */
export function classifyMontgomeryPermit(workType: string, use: string): { kind: PermitKind; work: string } {
  const type = workType.toUpperCase().trim();
  const structure = use.toUpperCase();
  const dwelling = /DWELLING|TOWNHOUSE|DUPLEX|VILLAS|MODULAR|HOUSE/.test(structure);
  const label = MONTGOMERY_WORK[type] ?? sentenceCase(workType);
  // "Alteration (single family dwelling)"; accessory structures lead with the structure: "Deck (new construction)".
  const work = dwelling ? `${label} (${use.trim().toLowerCase()})` : `${sentenceCase(use)} (${label.toLowerCase()})`;
  if (!dwelling) return { kind: 'exterior', work };
  // An application for the final inspection of work done under an earlier permit; it authorizes no new work.
  if (type === 'FINAL ONLY AP') return { kind: 'approval', work };
  if (type === 'ADD') return { kind: 'addition', work };
  if (type === 'CONSTRUCT' || type === 'BUILD FOUNDATION') return { kind: 'new-construction', work };
  return { kind: 'renovation', work };
}
export function montgomeryPermitStatus(label: string): PermitStatus {
  const status = label.toLowerCase();
  if (status === 'finaled') return 'completed';
  if (status === 'issued' || status === 'open') return 'issued';
  if (status === 'stop work') return 'stop-work';
  return 'other';
}

/**
 * The floor a condominium unit number usually implies: 3–4 digit numbers carry the floor in their leading digits
 * (616 → 6, 1203 → 12), and PH units are penthouses. Anything else stays unknown. This is an inference from the
 * unit label, never a recorded fact, and is always shown as one.
 */
export function inferFloor(address: string): { floor: number | 'penthouse' | null; basis: string } {
  const unit = /\bUnit\s+([A-Za-z0-9-]+)\s*$/i.exec(address)?.[1] ?? '';
  if (/^PH/i.test(unit))
    return { floor: 'penthouse', basis: `Inferred from unit ${unit}; penthouse labels are not verified floors.` };
  if (/^\d{3,4}$/.test(unit) && Number(unit) >= 100)
    return {
      floor: Math.floor(Number(unit) / 100),
      basis: `Inferred from unit number ${unit}; building numbering can differ, so verify it.`,
    };
  return { floor: null, basis: unit ? `Unit ${unit} does not indicate a floor.` : 'No unit number to infer a floor.' };
}

const DAY = 86_400_000;
const yearOf = (iso: string) => Number(iso.slice(0, 4));
/**
 * What the permit record says about condition and renovations, against the years the valuation records give.
 * `sinceRecord`: major work issued after the last recorded remodel (or build) year, which the assessor's grade may
 * not reflect. `unresolved`: only where the source reliably records final approval, major work whose record shows
 * it expired or stopped, or that was issued over two years before the data date and still has no final approval.
 * District records leave most finished work as expired or issued, so there status alone flags nothing.
 */
export function renovationSignals(facts: PropertyFacts | undefined, asOf: string) {
  // Building-wide permits on a condominium's lot are the association's; the signals concern the home itself.
  const major = (facts?.permits?.records ?? []).filter(record => isMajorWork(record) && record.scope === 'home');
  const recordYear = facts?.years.remodeled || facts?.years.built || null;
  const sinceRecord = recordYear ? major.filter(record => yearOf(record.issued) > recordYear) : [];
  const unresolved = major.filter(
    record =>
      !!facts?.permits?.closeOutRecorded &&
      !record.finaled &&
      (record.status === 'expired' ||
        record.status === 'stop-work' ||
        (record.status === 'issued' && Date.parse(asOf) - Date.parse(`${record.issued}T00:00:00Z`) > 730 * DAY)),
  );
  return { recordYear, sinceRecord, unresolved, major };
}

const monthYear = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
export const permitStatusText = (record: PermitRecord) =>
  record.status === 'completed'
    ? `completed${record.finaled ? ` ${monthYear(record.finaled)}` : ''}`
    : record.status === 'issued'
      ? 'issued, not shown as completed'
      : record.status === 'expired'
        ? 'expired'
        : record.status === 'stop-work'
          ? `stop-work order${record.finaled ? `, though a final approval (${monthYear(record.finaled)}) is also recorded` : ''}`
          : record.statusLabel.toLowerCase();
/** "Alteration and repair, issued Mar 2023, completed" */
export const permitText = (record: PermitRecord) =>
  `${record.work}, issued ${monthYear(record.issued)}, ${permitStatusText(record)}${
    record.declaredValue ? `, declared cost $${record.declaredValue.toLocaleString('en-US')}` : ''
  }${record.scope === 'building' ? ' (building)' : ''}`;
export { monthYear };

/** A bundled DC permit row (`dc-*-permits.csv.gz`) as a displayable record. */
export function dcPermitRecord(row: Record<string, string>, scope: 'home' | 'building'): PermitRecord {
  const { kind, work } = classifyDcPermit(row.type, row.subtype);
  return {
    id: row.permit_id,
    issued: row.issued,
    kind,
    work,
    status: dcPermitStatus(row.status),
    statusLabel: sentenceCase(row.status),
    finaled: null,
    declaredValue: null,
    scope,
  };
}
/** A bundled Montgomery County permit row (`montgomery-permits.csv.gz`) as a displayable record. */
export function montgomeryPermitRecord(row: Record<string, string>): PermitRecord {
  const { kind, work } = classifyMontgomeryPermit(row.work_type, row.use);
  return {
    id: row.permit_id,
    issued: row.issued,
    kind,
    work,
    status: montgomeryPermitStatus(row.status),
    statusLabel: row.status,
    finaled: /^\d{4}-\d{2}-\d{2}$/.test(row.finaled) ? row.finaled : null,
    declaredValue: row.declared_value === '' ? null : Number(row.declared_value),
    scope: 'home',
  };
}
/** Newest first, so a long history shows its recent work. */
export const newestFirst = (a: PermitRecord, b: PermitRecord) =>
  b.issued.localeCompare(a.issued) || a.id.localeCompare(b.id);

/**
 * The most recent major permitted work on a comparable in the three years before its sale. A sale that follows
 * renovation may reflect better condition than its recorded characteristics show.
 */
export function permitBeforeSale(
  records: readonly PermitRecord[],
  soldOn: string,
): ComparableFacts['permitBeforeSale'] {
  const sold = soldOn.slice(0, 10);
  const from = `${Number(sold.slice(0, 4)) - 3}${sold.slice(4)}`;
  const match = records
    .filter(record => isMajorWork(record) && record.issued >= from && record.issued < sold)
    .sort(newestFirst)[0];
  return match ? { issued: match.issued, kind: match.kind, work: match.work } : undefined;
}

/** Assessor structure descriptions in plain words, so a home and its comparables compare on the same terms. */
const STRUCTURE_LABELS: Record<string, string> = {
  'Row Inside': 'Rowhouse, inside',
  'Row End': 'Rowhouse, end',
  'Semi-Detached': 'Semi-detached',
  Single: 'Detached',
  'Town Inside': 'Townhouse, inside',
  'Town End': 'Townhouse, end',
  Multi: 'Multi-unit building',
  'Standard Unit': 'Standard dwelling',
  'Center Unit': 'Townhouse, center unit',
  'End Unit': 'Townhouse, end unit',
};
export const structureLabel = (value: string) => STRUCTURE_LABELS[value.trim()] ?? sentenceCase(value);

export const DC_PERMIT_STATUS_NOTE =
  'District records often leave finished work as expired or issued because no final inspection was recorded, so a status alone does not show whether work was done or inspected.';
export const MONTGOMERY_PERMIT_STATUS_NOTE =
  'Montgomery County records a final approval when it accepts completed work; a permit without one may not have been closed out.';
