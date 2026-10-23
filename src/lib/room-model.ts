import { z } from 'zod';

/** The Transaction Room's content model, shared by the server and the browser. See rooms.ts for access rules. */
export const ROOM_VERSION = 'ascent-transaction-room-1';
export const roomSections = [
  'milestones',
  'tasks',
  'deadlines',
  'documents',
  'quotes',
  'inspection',
  'financing',
  'settlement',
  'notes',
  'decisions',
  'references',
] as const;
export type RoomSection = (typeof roomSections)[number];
export const roomSectionLabels: Record<RoomSection, string> = {
  milestones: 'Milestones',
  tasks: 'Tasks',
  deadlines: 'Deadlines',
  documents: 'Documents',
  quotes: 'Quotes',
  inspection: 'Inspection items',
  financing: 'Financing checklist',
  settlement: 'Settlement checklist',
  notes: 'Notes',
  decisions: 'Decisions',
  references: 'Briefs and passports',
};
export const roomStages = ['preparing', 'on-market', 'under-contract', 'closing', 'closed', 'archived'] as const;
export const collaboratorRoles = ['agent', 'attorney', 'lender', 'inspector', 'settlement', 'family', 'other'] as const;
export const ROOM_LIMITS = {
  activeGrants: 20,
  documents: 100,
  maxAccessDays: 365,
  inviteDays: 7,
  minRetentionDays: 30,
  maxRetentionDays: 3650,
} as const;

const itemId = z.string().regex(/^[a-z0-9-]{6,40}$/);
const text = (max: number) => z.string().trim().max(max);
export const required = (max: number) => z.string().trim().min(1).max(max);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const iso = z.iso.datetime();
const checklist = z.object({ id: itemId, label: required(160), done: z.boolean(), note: text(300) }).strict();
export const sectionSchemas = {
  milestones: z
    .array(
      z
        .object({
          id: itemId,
          title: required(120),
          due: day.nullable(),
          status: z.enum(['planned', 'in-progress', 'done', 'blocked']),
        })
        .strict(),
    )
    .max(60),
  tasks: z
    .array(
      z
        .object({ id: itemId, title: required(160), assignee: text(80), due: day.nullable(), done: z.boolean() })
        .strict(),
    )
    .max(200),
  deadlines: z
    .array(
      z
        .object({
          id: itemId,
          label: required(160),
          date: day,
          basis: z.enum(['entered', 'offer-lab', 'contract']),
          note: text(300),
        })
        .strict(),
    )
    .max(60),
  quotes: z
    .array(
      z
        .object({
          id: itemId,
          vendor: required(120),
          scope: text(300),
          amount: z.number().min(0).max(10_000_000).nullable(),
          receivedOn: day.nullable(),
        })
        .strict(),
    )
    .max(60),
  inspection: z
    .array(
      z
        .object({
          id: itemId,
          item: required(200),
          severity: z.enum(['safety', 'major', 'minor', 'information']),
          status: z.enum(['open', 'repair-requested', 'credit-requested', 'accepted-as-is', 'resolved']),
          note: text(500),
        })
        .strict(),
    )
    .max(200),
  financing: z.array(checklist).max(60),
  settlement: z.array(checklist).max(60),
  decisions: z
    .array(
      z.object({ id: itemId, at: iso, title: required(160), decision: required(1000), rationale: text(2000) }).strict(),
    )
    .max(200),
  references: z
    .array(
      z
        .object({
          id: itemId,
          kind: z.enum(['home-decision-brief', 'evidence-passport', 'offer-comparison', 'evidence-timeline']),
          label: required(160),
          calculationHash: text(80),
          savedAt: iso,
        })
        .strict(),
    )
    .max(60),
} as const;
export type EditableSection = keyof typeof sectionSchemas;
const noteSchema = z
  .object({
    id: itemId,
    at: iso,
    authorId: z.string().max(60),
    authorName: text(150),
    text: required(2000),
    shared: z.boolean(),
  })
  .strict();
const documentSchema = z
  .object({
    id: z.uuid(),
    name: required(180),
    mime: z.enum(['application/pdf', 'text/plain']),
    size: z.number().int().positive(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    section: z.enum(roomSections),
    uploadedAt: iso,
    uploadedBy: z.string().max(60),
    deleteAfter: iso,
  })
  .strict();
export type RoomDocument = z.infer<typeof documentSchema>;
export const roomDataSchema = z
  .object({
    version: z.literal(ROOM_VERSION),
    stage: z.enum(roomStages),
    stageHistory: z
      .array(
        z
          .object({ at: iso, from: z.enum(roomStages).nullable(), to: z.enum(roomStages), actorId: z.string() })
          .strict(),
      )
      .max(200),
    retentionDays: z.number().int().min(ROOM_LIMITS.minRetentionDays).max(ROOM_LIMITS.maxRetentionDays),
    ...sectionSchemas,
    notes: z.array(noteSchema).max(500),
    documents: z.array(documentSchema).max(ROOM_LIMITS.documents),
  })
  .strict();
export type RoomData = z.infer<typeof roomDataSchema>;

export const permissionsSchema = z
  .object({
    sections: z.array(z.enum(roomSections)).min(1).max(roomSections.length),
    /** 'all' covers every document in the shared sections; otherwise only the listed documents. */
    documents: z.union([z.literal('all'), z.array(z.uuid()).max(ROOM_LIMITS.documents)]),
    download: z.boolean(),
    addNotes: z.boolean(),
  })
  .strict();
export type RoomPermissions = z.infer<typeof permissionsSchema>;
export const grantInputSchema = z
  .object({
    email: z.email().max(254),
    role: z.enum(collaboratorRoles),
    permissions: permissionsSchema,
    accessDays: z.number().int().min(1).max(ROOM_LIMITS.maxAccessDays),
  })
  .strict();
