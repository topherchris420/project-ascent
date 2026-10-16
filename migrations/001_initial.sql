-- Apply with a migration identity; run the application with a separate non-superuser,
-- non-BYPASSRLS identity. FORCE RLS also protects tables from their owner.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE TABLE IF NOT EXISTS tenants(id text PRIMARY KEY, created_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS users(
  id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id), name text NOT NULL,
  email text NOT NULL UNIQUE, role text NOT NULL CHECK(role IN ('owner','agent','viewer')),
  password_hash text, created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS users_tenant ON users(tenant_id);
CREATE TABLE IF NOT EXISTS sessions(hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS workspaces(tenant_id text PRIMARY KEY REFERENCES tenants(id), version integer NOT NULL DEFAULT 1, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS documents(id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id), data bytea NOT NULL, encrypted integer NOT NULL CHECK(encrypted IN (0,1)), created_at timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS documents_tenant ON documents(tenant_id);
CREATE TABLE IF NOT EXISTS rate_limits(key text PRIMARY KEY, count integer NOT NULL, expires_at bigint NOT NULL);
CREATE TABLE IF NOT EXISTS property_locations(
  tenant_id text NOT NULL REFERENCES tenants(id), property_id text NOT NULL,
  lat double precision NOT NULL CHECK(lat BETWEEN -90 AND 90), lng double precision NOT NULL CHECK(lng BETWEEN -180 AND 180),
  location geography(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng,lat),4326)::geography) STORED,
  PRIMARY KEY(tenant_id,property_id)
);
CREATE INDEX IF NOT EXISTS property_locations_geo ON property_locations USING gist(location);
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;
ALTER TABLE property_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_locations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_isolation ON workspaces;
CREATE POLICY workspace_isolation ON workspaces USING(tenant_id=current_setting('app.tenant_id',true)) WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
DROP POLICY IF EXISTS document_isolation ON documents;
CREATE POLICY document_isolation ON documents USING(tenant_id=current_setting('app.tenant_id',true)) WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
DROP POLICY IF EXISTS property_isolation ON property_locations;
CREATE POLICY property_isolation ON property_locations USING(tenant_id=current_setting('app.tenant_id',true)) WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
-- Authentication registry and rate limits are server-only global tables. No database
-- connection or service credential is exposed to a browser. Grant the app role only
-- SELECT/INSERT/UPDATE/DELETE on these tables and tenant tables; never schema CREATE.
