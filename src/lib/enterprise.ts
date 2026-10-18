import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { rateLimit } from './api';
import { digest, HttpError } from './auth';
import { getWorkspace, mutateWorkspace, transaction, type DbTransaction } from './db';
import { scopeWorkspaceForAccess } from './fabric';
import { effectivePlan, requireOwner, reserveUsage } from './platform';
import { appendAudit } from './service';
import type { Actor, Workspace } from './types';

export const integrationScopes = ['properties:read', 'cmas:read'] as const;
export type IntegrationScope = (typeof integrationScopes)[number];
export type ApiKeyMetadata = {
  id: string;
  name: string;
  scopes: IntegrationScope[];
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
};
type ApiKeyRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  name: string;
  scopes: string;
  created_at: string | Date;
  expires_at: string | Date;
  revoked_at: string | Date | null;
};
const iso = (value: string | Date) => new Date(value).toISOString();
const keyMetadata = (row: ApiKeyRow): ApiKeyMetadata => ({
  id: row.id,
  name: row.name,
  scopes: z.array(z.enum(integrationScopes)).parse(JSON.parse(row.scopes)),
  createdAt: iso(row.created_at),
  expiresAt: iso(row.expires_at),
  revokedAt: row.revoked_at ? iso(row.revoked_at) : null,
});
const metadataColumns = 'id,tenant_id,user_id,name,scopes,created_at,expires_at,revoked_at';

export const apiKeyActionSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('create'),
    name: z
      .string()
      .trim()
      .min(2)
      .max(100)
      .refine(value => !/[\u0000-\u001f\u007f]/.test(value), 'Use printable text.'),
    scopes: z.array(z.enum(integrationScopes)).min(1).max(2),
    expiresInDays: z.number().int().min(1).max(90).default(30),
  }),
  z.strictObject({ action: z.literal('revoke'), id: z.uuid() }),
]);
export type ApiKeyAction = z.infer<typeof apiKeyActionSchema>;

function requireEnterprise(workspace: Workspace) {
  if (effectivePlan(workspace) !== 'enterprise')
    throw new HttpError(
      403,
      'An active, configured Enterprise subscription is required for integration keys. Payment does not grant source-data rights.',
    );
}
async function workspaceInTransaction(tx: DbTransaction, tenantId: string): Promise<Workspace> {
  const rows = await tx.query<{ data: string | Workspace }>('SELECT data FROM workspaces WHERE tenant_id=$1', [
    tenantId,
  ]);
  if (!rows[0]) throw new HttpError(401, 'Integration workspace is unavailable.');
  return typeof rows[0].data === 'string' ? (JSON.parse(rows[0].data) as Workspace) : rows[0].data;
}

export async function listApiKeys(actor: Actor) {
  requireOwner(actor);
  return transaction(actor.tenantId, async tx => {
    const rows = await tx.query<ApiKeyRow>(
      `SELECT ${metadataColumns} FROM api_keys WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100`,
      [actor.tenantId],
    );
    return { keys: rows.map(keyMetadata) };
  });
}

export async function manageApiKey(actor: Actor, raw: unknown) {
  requireOwner(actor);
  const input = apiKeyActionSchema.parse(raw);
  if (input.action === 'revoke') {
    await mutateWorkspace(actor, async (workspace, tx) => {
      const rows = await tx.query<{ id: string; revoked_at: string | null }>(
        'SELECT id,revoked_at FROM api_keys WHERE id=$1 AND tenant_id=$2',
        [input.id, actor.tenantId],
      );
      if (!rows[0]) throw new HttpError(404, 'Integration key was not found in this organization.');
      if (!rows[0].revoked_at) {
        await tx.query('UPDATE api_keys SET revoked_at=$1 WHERE id=$2 AND tenant_id=$3', [
          new Date().toISOString(),
          input.id,
          actor.tenantId,
        ]);
        appendAudit(
          workspace,
          actor,
          'revokeIntegrationKey',
          input.id,
          'Read-only integration credential revoked; no raw credential retained in audit.',
        );
      }
    });
    return listApiKeys(actor);
  }
  const token = `${actor.tenantId}.${randomBytes(32).toString('base64url')}`;
  const key: ApiKeyMetadata = {
    id: randomUUID(),
    name: input.name,
    scopes: [...new Set(input.scopes)],
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + input.expiresInDays * 86400000).toISOString(),
    revokedAt: null,
  };
  await mutateWorkspace(actor, async (workspace, tx) => {
    requireEnterprise(workspace);
    const active = await tx.query<{ id: string }>(
      'SELECT id FROM api_keys WHERE tenant_id=$1 AND revoked_at IS NULL AND expires_at>$2',
      [actor.tenantId, key.createdAt],
    );
    if (active.length >= 20)
      throw new HttpError(409, 'This organization already has 20 active integration keys. Revoke an unused key first.');
    await tx.query(
      'INSERT INTO api_keys(id,tenant_id,user_id,name,token_hash,scopes,created_at,expires_at,revoked_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,NULL)',
      [
        key.id,
        actor.tenantId,
        actor.id,
        key.name,
        digest(token),
        JSON.stringify(key.scopes),
        key.createdAt,
        key.expiresAt,
      ],
    );
    appendAudit(
      workspace,
      actor,
      'createIntegrationKey',
      key.id,
      `Read-only scopes ${key.scopes.join(', ')}; expires ${key.expiresAt}. Raw token is shown once and is never audited.`,
    );
  });
  return { key, token };
}

export async function authenticateIntegration(
  request: Request,
  requiredScope: IntegrationScope,
): Promise<{ actor: Actor; keyId: string }> {
  const bearer =
    /^Bearer ([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/i.exec(
      request.headers.get('authorization') || '',
    );
  if (!bearer) throw new HttpError(401, 'A valid integration bearer token is required.');
  const tenantId = bearer[1],
    token = `${bearer[1]}.${bearer[2]}`;
  const authenticated = await transaction(tenantId, async tx => {
    const rows = await tx.query<ApiKeyRow & { actor_name: string; email: string; role: Actor['role'] }>(
      'SELECT api_keys.id,api_keys.tenant_id,api_keys.user_id,api_keys.name,api_keys.scopes,api_keys.created_at,api_keys.expires_at,api_keys.revoked_at,users.name AS actor_name,users.email,users.role FROM api_keys JOIN users ON users.id=api_keys.user_id AND users.tenant_id=api_keys.tenant_id WHERE api_keys.token_hash=$1 AND api_keys.tenant_id=$2',
      [digest(token), tenantId],
    );
    const row = rows[0];
    if (
      !row ||
      row.revoked_at ||
      new Date(row.expires_at).getTime() <= Date.now() ||
      !Number.isFinite(new Date(row.expires_at).getTime()) ||
      row.role !== 'owner'
    )
      throw new HttpError(401, 'Integration token is revoked, expired, or its issuing owner is no longer eligible.');
    const scopes = z.array(z.enum(integrationScopes)).safeParse(JSON.parse(row.scopes));
    if (!scopes.success || !scopes.data.includes(requiredScope))
      throw new HttpError(403, 'Integration token does not permit this read scope.');
    if (process.env.NODE_ENV === 'production') {
      const security = await tx.query<{ enabled_at: string | null; is_demo: number }>(
        'SELECT enabled_at,is_demo FROM account_security WHERE user_id=$1',
        [row.user_id],
      );
      if (!security[0]?.enabled_at && security[0]?.is_demo !== 1)
        throw new HttpError(403, 'The issuing owner must enroll in MFA before integration access can continue.');
    }
    requireEnterprise(await workspaceInTransaction(tx, tenantId));
    return {
      actor: { id: row.user_id, tenantId, name: row.actor_name, email: row.email, role: row.role },
      keyId: row.id,
    };
  });
  await rateLimit(request, `integration:${authenticated.keyId}`, 120, authenticated.actor);
  return authenticated;
}

export async function integrationReadWorkspace(request: Request, scope: IntegrationScope): Promise<Workspace> {
  const { actor } = await authenticateIntegration(request, scope);
  await reserveUsage(actor, 'fabricQueries');
  const workspace = await getWorkspace(actor.tenantId);
  // Recheck after reserving quota so a concurrent downgrade never grants a fresh read.
  requireEnterprise(workspace);
  return scopeWorkspaceForAccess(workspace, 'export');
}

export const integrationQuerySchema = z.strictObject({
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});

export async function integrationProperties(request: Request) {
  const query = integrationQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  const workspace = await integrationReadWorkspace(request, 'properties:read');
  const matches = workspace.properties.filter(
    property =>
      !query.q ||
      `${property.address} ${property.city} ${property.state} ${property.zip}`
        .toLowerCase()
        .includes(query.q.toLowerCase()),
  );
  const properties = matches.slice(query.offset, query.offset + query.limit).map(property => ({
    ...property,
    dataKind: workspace.sources.find(source => source.id === property.sourceId)?.kind ?? 'unknown',
  }));
  return {
    properties,
    total: matches.length,
    limit: query.limit,
    offset: query.offset,
    hasMore: matches.length > query.offset + query.limit,
    asOf: workspace.asOf,
    mode: workspace.mode,
    scope: 'properties:read',
    note: 'Per-record dataKind identifies synthetic or source-provided records independently of workspace mode. Current source export permissions and retention apply; payment does not grant data rights.',
  };
}

export async function integrationCmas(request: Request) {
  const query = integrationQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  const workspace = await integrationReadWorkspace(request, 'cmas:read');
  const matches = workspace.cmas.filter(
    record => !query.q || `${record.name} ${record.propertyId}`.toLowerCase().includes(query.q.toLowerCase()),
  );
  // Raw candidate snapshots and excluded records are deliberately not an API surface.
  const cmas = matches.slice(query.offset, query.offset + query.limit).map(record => {
    const { inputSnapshot: _snapshot, excluded: _excluded, ...result } = record.result;
    const kinds = [
      ...new Set(result.sourceIds.map(id => workspace.sources.find(source => source.id === id)?.kind ?? 'unknown')),
    ];
    return {
      ...record,
      result,
      dataKind: kinds.includes('synthetic') ? 'synthetic' : kinds.length === 1 ? kinds[0] : 'mixed-source',
    };
  });
  return {
    cmas,
    total: matches.length,
    limit: query.limit,
    offset: query.offset,
    hasMore: matches.length > query.offset + query.limit,
    asOf: workspace.asOf,
    mode: workspace.mode,
    scope: 'cmas:read',
    note: 'Read-only reviewed export surface. Raw candidate snapshots and exclusions are not returned; source rights remain independent of subscription.',
  };
}
