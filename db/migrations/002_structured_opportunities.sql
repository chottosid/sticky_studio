ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS organization_name TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS organization_type TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS application_url TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS eligibility TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS requirements JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS opportunity_sources (
  id BIGSERIAL PRIMARY KEY,
  opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  source_type VARCHAR(50) NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  storage_path TEXT,
  source_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT opportunity_sources_type_check CHECK (
    source_type IN ('upload', 'pasted-text', 'submitted-url', 'enriched-url')
  ),
  CONSTRAINT opportunity_sources_location_check CHECK (
    storage_path IS NOT NULL OR source_url IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_opportunity_sources_opportunity_id
  ON opportunity_sources(opportunity_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_opportunity_sources_storage_path
  ON opportunity_sources(storage_path) WHERE storage_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_organization
  ON opportunities(organization_name);
CREATE INDEX IF NOT EXISTS idx_opportunities_attributes
  ON opportunities USING GIN(attributes);

CREATE INDEX IF NOT EXISTS idx_opportunities_search
  ON opportunities USING GIN(
    to_tsvector(
      'english',
      coalesce(name, '') || ' ' ||
      coalesce(details, '') || ' ' ||
      coalesce(organization_name, '') || ' ' ||
      coalesce(location, '')
    )
  );

