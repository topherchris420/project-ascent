-- Scoped read-only service credentials. Raw tokens are never persisted.
CREATE TABLE IF NOT EXISTS api_keys(
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  scopes text NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS api_keys_token_hash ON api_keys(token_hash);
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS api_key_isolation ON api_keys;
CREATE POLICY api_key_isolation ON api_keys USING(tenant_id=current_setting('app.tenant_id',true)) WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
