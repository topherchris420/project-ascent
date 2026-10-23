import { calculationChecksum } from './analytics';

/**
 * The MLS Bridge: the permission model Ascent would use to show MLS listing data, and nothing more. No MLS agreement
 * is on file, so the bridge is disabled and every authorization fails closed. MLS data reaches a consumer only
 * through a participating broker under the MLS's rules, and the rules differ by arrangement:
 *
 *  - IDX (Internet Data Exchange) lets a participant display other brokers' active listings to the public, with
 *    field restrictions, required attribution and refresh rules, and no bulk export.
 *  - VOW (Virtual Office Website) lets a participant show more fields, sometimes including sold data, to consumers
 *    who register, accept terms of use and have a broker-consumer relationship.
 *  - A broker back-office feed serves the participant's own staff and cannot be shown to consumers.
 *  - A data license is a separate written agreement with its own permitted uses.
 *
 * The fixtures below are synthetic, carry a synthetic flag in every record and cannot pass the display guard.
 * Recorded public transactions are never presented as MLS inventory, and MLS data never enters a valuation here.
 */
export const MLS_BRIDGE_VERSION = 'ascent-mls-bridge-1';
export const mlsArrangements = ['idx', 'vow', 'broker-back-office', 'data-license'] as const;
export type MlsArrangement = (typeof mlsArrangements)[number];
export const mlsUses = [
  'public-display',
  'registered-display',
  'monitoring',
  'valuation',
  'export',
  'model-inference',
] as const;
export type MlsUse = (typeof mlsUses)[number];

export type MlsAgreement = {
  id: string;
  arrangement: MlsArrangement;
  mls: string;
  /** The participating broker whose membership the feed is licensed through. */
  participant: string;
  signedOn: string;
  expiresOn: string;
  uses: Record<MlsUse, boolean>;
  fields: { allowed: readonly string[]; registeredOnly: readonly string[] };
  retentionDays: number;
  refreshHours: number;
  attribution: string;
  evidence: string;
};

/** Agreements actually on file. None exists; adding one requires the signed agreement as evidence. */
export const MLS_AGREEMENTS: readonly MlsAgreement[] = [];

export const ARRANGEMENT_RULES: Record<
  MlsArrangement,
  { label: string; consumer: string; typicalUses: MlsUse[]; requires: string }
> = {
  idx: {
    label: 'IDX display',
    consumer: 'Any visitor, without registering.',
    typicalUses: ['public-display'],
    requires:
      'MLS membership of a participating broker, the MLS’s IDX rules and attribution of each listing broker. No export, valuation or bulk download.',
  },
  vow: {
    label: 'VOW display',
    consumer: 'Registered visitors who accept terms of use and have a relationship with the broker.',
    typicalUses: ['public-display', 'registered-display'],
    requires:
      'A participating broker’s VOW, registration with verified email, accepted terms of use, the MLS’s VOW field rules and periodic re-consent.',
  },
  'broker-back-office': {
    label: 'Broker back office',
    consumer: 'The participant’s licensed staff only.',
    typicalUses: [],
    requires: 'Internal broker use only. Never shown to homeowners or the public.',
  },
  'data-license': {
    label: 'Data license',
    consumer: 'As the written license states.',
    typicalUses: [],
    requires: 'A separate written license naming each permitted use, field, retention period and audit term.',
  },
};

export type MlsViewer = { registered: boolean; acceptedVowTerms: boolean; brokerRelationship: boolean };
export type MlsDecision = { allowed: boolean; reasons: string[]; fields: string[] };

/** Fails closed: any missing, expired or non-matching condition denies the request. */
export function authorizeMlsUse(
  agreement: MlsAgreement | null,
  request: { use: MlsUse; fields: readonly string[]; viewer: MlsViewer | null },
  now: Date,
): MlsDecision {
  const reasons: string[] = [];
  if (!agreement)
    return {
      allowed: false,
      reasons: ['No MLS agreement is on file. MLS listing data is not available in Ascent.'],
      fields: [],
    };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(agreement.expiresOn) || agreement.expiresOn < now.toISOString().slice(0, 10))
    reasons.push(`The ${agreement.mls} agreement expired on ${agreement.expiresOn}.`);
  if (agreement.signedOn > now.toISOString().slice(0, 10)) reasons.push('The agreement is not in effect yet.');
  if (!agreement.uses[request.use]) reasons.push(`The agreement does not permit ${request.use}.`);
  if (agreement.arrangement === 'broker-back-office' && request.use !== 'monitoring')
    reasons.push('A back-office feed cannot be shown to consumers.');
  if (request.use === 'valuation' || request.use === 'model-inference')
    reasons.push(
      'Ascent does not use MLS data in a valuation or model; its estimates come from validated public records.',
    );
  const registeredUse = request.use === 'registered-display';
  if (registeredUse && agreement.arrangement === 'vow') {
    if (!request.viewer?.registered) reasons.push('VOW data needs a registered viewer.');
    if (!request.viewer?.acceptedVowTerms) reasons.push('VOW data needs the viewer to accept the terms of use.');
    if (!request.viewer?.brokerRelationship) reasons.push('VOW data needs a broker-consumer relationship.');
  }
  const permitted = new Set([
    ...agreement.fields.allowed,
    ...(registeredUse && request.viewer?.registered && request.viewer.acceptedVowTerms
      ? agreement.fields.registeredOnly
      : []),
  ]);
  const denied = request.fields.filter(field => !permitted.has(field));
  if (denied.length) reasons.push(`Fields not permitted for this use: ${denied.join(', ')}.`);
  return reasons.length
    ? { allowed: false, reasons, fields: [] }
    : { allowed: true, reasons: [], fields: request.fields.filter(field => permitted.has(field)) };
}

/** A cached MLS record may be kept only for the agreement's retention period. */
export function mlsRecordExpired(agreement: MlsAgreement, fetchedAt: string, now: Date) {
  return now.getTime() - Date.parse(fetchedAt) > agreement.retentionDays * 86_400_000;
}

export type MlsAuditEntry = {
  sequence: number;
  at: string;
  agreementId: string | null;
  use: MlsUse;
  allowed: boolean;
  reasons: string[];
  previous: string;
  hash: string;
};
/** Every authorization is appended to a hash-linked log, so a removed or edited entry is detectable. */
export function appendMlsAudit(
  log: readonly MlsAuditEntry[],
  entry: { at: string; agreementId: string | null; use: MlsUse; decision: MlsDecision },
): MlsAuditEntry[] {
  const previous = log.at(-1)?.hash ?? 'genesis';
  const body = {
    sequence: log.length + 1,
    at: entry.at,
    agreementId: entry.agreementId,
    use: entry.use,
    allowed: entry.decision.allowed,
    reasons: entry.decision.reasons,
    previous,
  };
  return [...log, { ...body, hash: calculationChecksum(body) }];
}
export function verifyMlsAudit(log: readonly MlsAuditEntry[]) {
  return log.every((entry, index) => {
    const { hash, ...body } = entry;
    return (
      entry.sequence === index + 1 &&
      entry.previous === (index ? log[index - 1].hash : 'genesis') &&
      calculationChecksum(body) === hash
    );
  });
}

/** Synthetic records for tests and interface development only. Every one is marked and fails the display guard. */
export const MOCK_MLS_FIXTURES = [
  {
    synthetic: true,
    notice: 'FICTIONAL TEST FIXTURE. Not a real listing, property, broker or price.',
    listingId: 'TEST-0001',
    status: 'Active',
    address: '100 Example Lane, Testville',
    listPrice: 500000,
    listingBroker: 'Example Test Brokerage',
    remarks: 'Synthetic record.',
  },
  {
    synthetic: true,
    notice: 'FICTIONAL TEST FIXTURE. Not a real listing, property, broker or price.',
    listingId: 'TEST-0002',
    status: 'Pending',
    address: '200 Sample Court, Testville',
    listPrice: 650000,
    listingBroker: 'Example Test Brokerage',
    remarks: 'Synthetic record.',
  },
] as const;

/** Refuses any synthetic record, so a fixture can never be presented to a homeowner as real. */
export function assertDisplayableListing(record: { synthetic?: boolean }) {
  if (record.synthetic !== false)
    throw new Error('Only a record from an authorized MLS feed can be displayed; this one is synthetic or unmarked.');
}

export function mlsBridgeStatus(now: Date) {
  const active = MLS_AGREEMENTS.filter(agreement => agreement.expiresOn >= now.toISOString().slice(0, 10));
  return {
    version: MLS_BRIDGE_VERSION,
    enabled: active.length > 0,
    agreements: active.map(({ id, arrangement, mls, expiresOn }) => ({ id, arrangement, mls, expiresOn })),
    reason: active.length
      ? null
      : 'Disabled: no MLS agreement is on file. Ascent shows recorded public transactions, which are not listings, and never presents them as live inventory.',
    requiredPermission:
      'A written IDX, VOW or data-license agreement through a participating broker, naming the permitted uses, fields, retention and audit terms.',
    arrangements: mlsArrangements.map(kind => ({ kind, ...ARRANGEMENT_RULES[kind] })),
  };
}
