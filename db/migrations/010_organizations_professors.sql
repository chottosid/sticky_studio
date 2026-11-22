-- Universities/organizations and professors become first-class rows, so a lab's people can be tracked
-- across several openings. Additive only: opportunities keep organization_name and professorNames.
CREATE TABLE organizations (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  -- Normalized name (see src/lib/organizations.ts). alias_keys hold other normalized spellings of the same place.
  name_key TEXT NOT NULL UNIQUE,
  alias_keys TEXT[] NOT NULL DEFAULT '{}',
  country TEXT,
  website TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX organizations_alias_keys ON organizations USING GIN (alias_keys);

CREATE TABLE professors (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  department TEXT,
  homepage TEXT,
  scholar_url TEXT,
  email TEXT,
  research_areas TEXT[] NOT NULL DEFAULT '{}',
  recruiting_status TEXT NOT NULL DEFAULT 'unknown' CHECK (recruiting_status IN ('unknown', 'taking', 'not_taking')),
  recruiting_checked_on DATE,
  recruiting_source_url TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name_key)
);

-- Some openings name co-supervisors, so the link is many-to-many.
CREATE TABLE opportunity_professors (
  opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  professor_id INTEGER NOT NULL REFERENCES professors(id) ON DELETE CASCADE,
  PRIMARY KEY (opportunity_id, professor_id)
);
CREATE INDEX opportunity_professors_professor ON opportunity_professors (professor_id);

ALTER TABLE opportunities ADD COLUMN organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX opportunities_organization ON opportunities (organization_id);

-- Same treatment as migration 009: the app uses PostgreSQL directly, so the Supabase API roles get nothing.
DO $$
DECLARE
  table_name TEXT;
  api_role TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['organizations', 'professors', 'opportunity_professors']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);
    FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')
    LOOP
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', table_name, api_role);
    END LOOP;
  END LOOP;
END $$;

CREATE POLICY sticky_research_read ON public.organizations FOR SELECT USING (current_user = 'sticky_studio_research');
CREATE POLICY sticky_research_read ON public.professors FOR SELECT USING (current_user = 'sticky_studio_research');
CREATE POLICY sticky_research_read ON public.opportunity_professors FOR SELECT USING (current_user = 'sticky_studio_research');

-- The read-only research login (created by `npm run db:research -- setup`) may already exist.
-- Free-text notes stay private, as with candidate_profiles.additional_context.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sticky_studio_research') THEN
    GRANT SELECT (id, name, name_key, alias_keys, country, website) ON public.organizations TO sticky_studio_research;
    GRANT SELECT (id, organization_id, name, name_key, department, homepage, scholar_url, email, research_areas,
      recruiting_status, recruiting_checked_on, recruiting_source_url) ON public.professors TO sticky_studio_research;
    GRANT SELECT (opportunity_id, professor_id) ON public.opportunity_professors TO sticky_studio_research;
    GRANT SELECT (organization_id) ON public.opportunities TO sticky_studio_research;
  END IF;
END $$;
