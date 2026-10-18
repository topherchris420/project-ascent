-- Server-only identity registry, like users/sessions; never grant client/direct database access.
CREATE TABLE IF NOT EXISTS account_security(
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  is_demo integer NOT NULL DEFAULT 0 CHECK(is_demo IN (0,1)),
  secret text, pending_secret text, pending_until timestamptz, enabled_at timestamptz,
  last_counter bigint NOT NULL DEFAULT -1, recovery_hashes text NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS session_assurance(hash text PRIMARY KEY REFERENCES sessions(hash) ON DELETE CASCADE,mfa_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS password_resets(hash text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS auth_mail_outbox(id text PRIMARY KEY,payload text NOT NULL,created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS password_resets_expiry ON password_resets(expires_at);
CREATE INDEX IF NOT EXISTS auth_mail_outbox_expiry ON auth_mail_outbox(expires_at);
