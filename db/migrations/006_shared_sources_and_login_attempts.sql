-- Uploads are content-addressed (one object per file content), so several opportunities saved
-- from one post legitimately share a storage path. The unique index made every multi-item save fail.
DROP INDEX IF EXISTS idx_opportunity_sources_storage_path;
CREATE INDEX IF NOT EXISTS idx_opportunity_sources_storage_path_lookup
  ON opportunity_sources(storage_path) WHERE storage_path IS NOT NULL;

-- Failed sign-ins per client address, for rate limiting the public login action.
CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGSERIAL PRIMARY KEY,
  client TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_client_time ON login_attempts(client, attempted_at);
