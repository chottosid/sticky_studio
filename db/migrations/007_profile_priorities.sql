CREATE TABLE IF NOT EXISTS candidate_profiles (
  id TEXT PRIMARY KEY CHECK (id IN ('swarup', 'archita')),
  name TEXT NOT NULL,
  website TEXT NOT NULL,
  profile_text TEXT NOT NULL DEFAULT '',
  additional_context TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL DEFAULT '',
  fetched_at TIMESTAMPTZ,
  fetch_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO candidate_profiles (id, name, website, additional_context) VALUES
  ('swarup', 'Swarup Sidhartho Mondol', 'https://swarupsidhartho.com/',
   'User supplied CGPA: 3.60/4.00 (BUET CSE). GRE and English-test scores, class rank, recommendation strength and application budget are unknown.'),
  ('archita', 'Archita Lahiri', 'https://archi120.github.io/',
   'GRE and English-test scores, recommendation strength and application budget are unknown. Use this person''s own portfolio; never transfer another candidate''s research or employment credentials.')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS profile_assessments JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS content_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS assessment_claimed_until TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_opportunities_profile_assessments ON opportunities USING GIN(profile_assessments);

-- Preserve originals and source-specific cross-check notes without overwriting announcements.
CREATE TABLE IF NOT EXISTS opportunity_research_audits (
  id BIGSERIAL PRIMARY KEY,
  opportunity_id INTEGER REFERENCES opportunities(id) ON DELETE SET NULL,
  audit_key TEXT NOT NULL UNIQUE,
  original_data JSONB,
  findings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
