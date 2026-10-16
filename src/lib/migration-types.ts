export type MigrationKind = 'contacts' | 'preferences' | 'searches' | 'milestones' | 'notes' | 'documentRefs';
export type MigrationEntity = 'client' | 'search' | 'milestone' | 'note' | 'documentRef';
export type MigrationRow = { row: number; status: 'create' | 'update' | 'skip' | 'conflict' | 'invalid'; entity: MigrationEntity; targetId?: string; parentId?: string; proposed: Record<string, unknown>; conflictFields?: string[]; message?: string };
export type MigrationPreview = { id: string; kind: MigrationKind; sourceName: string; createdAt: string; expiresAt: string; baseHash: string; rows: MigrationRow[]; summary: Record<string, number>; committedId?: string };
export type MigrationOperation = { entity: MigrationEntity; targetId: string; parentId?: string; created: boolean; before: Record<string, unknown>; after: Record<string, unknown> };
export type MigrationCommit = { id: string; previewId: string; kind: MigrationKind; createdAt: string; createdBy: string; rollbackUntil: string; status: 'committed' | 'rolled-back'; operations: MigrationOperation[]; created: number; updated: number; skipped: number; rolledBackAt?: string; rollbackResult?: { rolledBack: number; preserved: number } };
export type MigrationDocumentRef = { id: string; documentId: string; label: string; importId: string };
export type MigrationState = { version: 1; previews: MigrationPreview[]; commits: MigrationCommit[]; documentRefs: MigrationDocumentRef[] };
