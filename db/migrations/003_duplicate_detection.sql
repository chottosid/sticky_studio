CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE opportunity_sources ADD COLUMN IF NOT EXISTS content_sha256 VARCHAR(64);
ALTER TABLE opportunity_sources ADD COLUMN IF NOT EXISTS canonical_url TEXT;

CREATE INDEX IF NOT EXISTS idx_opportunity_sources_content_sha256
  ON opportunity_sources(content_sha256) WHERE content_sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opportunity_sources_canonical_url
  ON opportunity_sources(canonical_url) WHERE canonical_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_name_trgm
  ON opportunities USING GIN (lower(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_opportunities_organization_trgm
  ON opportunities USING GIN (lower(coalesce(organization_name, '')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_opportunities_details_trgm
  ON opportunities USING GIN (lower(details) gin_trgm_ops);
