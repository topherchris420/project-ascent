-- Owner-controlled Transaction Rooms. Room contents and documents live in the owner's tenant under forced RLS;
-- collaborators reach a room only through an accepted, unexpired, unrevoked grant checked on every request.
CREATE TABLE IF NOT EXISTS homeowner_rooms(
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_key text NOT NULL,
  address text NOT NULL,
  data bytea NOT NULL,
  encrypted integer NOT NULL DEFAULT 0 CHECK(encrypted IN (0,1)),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE(tenant_id,owner_id,property_key)
);
CREATE TABLE IF NOT EXISTS room_grants(
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  room_id text NOT NULL REFERENCES homeowner_rooms(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL,
  permissions text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  invite_expires_at timestamptz NOT NULL,
  access_expires_at timestamptz NOT NULL,
  user_id text,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS room_events(
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  room_id text NOT NULL REFERENCES homeowner_rooms(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  at timestamptz NOT NULL,
  actor_id text NOT NULL,
  action text NOT NULL,
  detail text NOT NULL,
  previous_hash text NOT NULL,
  hash text NOT NULL,
  UNIQUE(room_id,sequence)
);
CREATE INDEX IF NOT EXISTS room_grants_room ON room_grants(room_id);
CREATE INDEX IF NOT EXISTS room_events_room ON room_events(room_id);
ALTER TABLE homeowner_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE homeowner_rooms FORCE ROW LEVEL SECURITY;
ALTER TABLE room_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE room_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS room_isolation ON homeowner_rooms;
CREATE POLICY room_isolation ON homeowner_rooms USING(tenant_id=current_setting('app.tenant_id',true)) WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
DROP POLICY IF EXISTS room_grant_isolation ON room_grants;
CREATE POLICY room_grant_isolation ON room_grants USING(tenant_id=current_setting('app.tenant_id',true)) WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
DROP POLICY IF EXISTS room_event_isolation ON room_events;
CREATE POLICY room_event_isolation ON room_events USING(tenant_id=current_setting('app.tenant_id',true)) WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
-- Server-only index of which rooms a collaborator accepted, like users/sessions. It holds identifiers only; every
-- access re-checks the grant inside the owner's tenant.
CREATE TABLE IF NOT EXISTS room_memberships(
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id text NOT NULL,
  tenant_id text NOT NULL REFERENCES tenants(id),
  grant_id text NOT NULL,
  PRIMARY KEY(user_id,room_id)
);
