-- The app uses PostgreSQL directly. Its private tables should not be available
-- through the Supabase anonymous or authenticated Data API roles.
DO $$
DECLARE
  table_name TEXT;
  api_role TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'opportunities', 'opportunity_sources', 'candidate_profiles', 'opportunity_research_audits',
    'telegram_messages', 'telegram_chats', 'login_attempts', 'schema_migrations',
    'applicant_opportunities', 'applicant_assessments', 'studio_jobs', 'opportunity_save_receipts'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);
    FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')
    LOOP
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', table_name, api_role);
    END LOOP;
  END LOOP;
END $$;

-- Policies allow the scoped role to see rows only on the three tables with
-- column grants. They work when the role is created after this migration.
CREATE POLICY sticky_research_read ON public.opportunities FOR SELECT
  USING (current_user = 'sticky_studio_research');
CREATE POLICY sticky_research_read ON public.opportunity_sources FOR SELECT
  USING (current_user = 'sticky_studio_research');
CREATE POLICY sticky_research_read ON public.candidate_profiles FOR SELECT
  USING (current_user = 'sticky_studio_research');
