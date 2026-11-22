ALTER TABLE opportunities
  ADD COLUMN posting_status TEXT NOT NULL DEFAULT 'unknown' CHECK (posting_status IN ('unknown', 'rolling', 'closed')),
  ADD COLUMN field_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN workflow_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE opportunities ALTER COLUMN workflow_enabled SET DEFAULT TRUE;

CREATE TABLE applicant_opportunities (
  opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'considering' CHECK (stage IN ('considering', 'applying', 'applied', 'archived')),
  follow_up_on DATE,
  follow_up_note TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (opportunity_id, candidate_id)
);

CREATE TABLE applicant_assessments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  content_revision INTEGER NOT NULL,
  profile_hash TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  model TEXT NOT NULL,
  result JSONB NOT NULL,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX applicant_assessments_latest ON applicant_assessments (opportunity_id, candidate_id, id DESC);

CREATE TABLE studio_jobs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('assessment', 'reminder')),
  dedupe_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  run_after TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_until TIMESTAMPTZ,
  lease_token UUID,
  attempts INTEGER NOT NULL DEFAULT 0,
  finished_at TIMESTAMPTZ,
  error TEXT,
  UNIQUE (kind, dedupe_key)
);

CREATE INDEX studio_jobs_pending ON studio_jobs (kind, run_after, id) WHERE finished_at IS NULL;

-- A message batch remains recoverable before and after the post-response extraction.
ALTER TABLE telegram_messages ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE telegram_messages ADD COLUMN retry_after TIMESTAMPTZ;
ALTER TABLE telegram_messages ADD COLUMN lease_token UUID;

CREATE TABLE opportunity_save_receipts (
  request_id UUID PRIMARY KEY,
  saved_count INTEGER NOT NULL CHECK (saved_count > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE applicant_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE applicant_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_save_receipts ENABLE ROW LEVEL SECURITY;
