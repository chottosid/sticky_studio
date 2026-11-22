const { createHash, createHmac, pbkdf2Sync, randomBytes } = require('node:crypto');
const { mkdir, writeFile } = require('node:fs/promises');
const { DbCommandError, privateDirectory, researchEnvFile, withDatabase, readOnly, reportError } = require('./db-access');

const ROLE = 'sticky_studio_research';
const researchVariable = 'STICKY_RESEARCH_DATABASE_URL';

// Keep the permitted fields explicit. This also keeps large legacy attachments off the wire.
const opportunityColumns = `id, name, category, organization_name, location, deadline, application_url,
  contact_email, details, eligibility, requirements, attributes, profile_assessments, content_revision, organization_id`;
const sourceColumns = 'id, opportunity_id, source_type, original_name, source_url, canonical_url, content_sha256';
const organizationColumns = 'id, name, name_key, alias_keys, country, website';
const professorColumns = `id, organization_id, name, name_key, department, homepage, scholar_url, email, research_areas,
  recruiting_status, recruiting_checked_on, recruiting_source_url`;
const profileColumns = 'id, name, website, profile_text, content_hash, fetched_at';

function scramVerifier(password) {
  const salt = randomBytes(16);
  const rounds = 4096;
  const salted = pbkdf2Sync(password, salt, rounds, 32, 'sha256');
  const clientKey = createHmac('sha256', salted).update('Client Key').digest();
  const storedKey = createHash('sha256').update(clientKey).digest('base64');
  const serverKey = createHmac('sha256', salted).update('Server Key').digest('base64');
  return `SCRAM-SHA-256$${rounds}:${salt.toString('base64')}$${storedKey}:${serverKey}`;
}

async function verifyRole() {
  await withDatabase(researchVariable, async (client) => {
    const { rows: [access] } = await client.query(`SELECT
      current_user AS role,
      has_column_privilege('public.opportunities', 'name', 'SELECT') AS can_read,
      has_column_privilege('public.opportunities', 'document_uri', 'SELECT') AS can_read_attachments,
      has_column_privilege('public.candidate_profiles', 'additional_context', 'SELECT') AS can_read_notes,
      has_table_privilege('public.telegram_messages', 'SELECT') AS can_read_inbox,
      has_any_column_privilege('public.opportunities', 'INSERT,UPDATE') AS can_write,
      has_table_privilege('public.opportunities', 'DELETE,TRUNCATE') AS can_delete`);
    if (access.role !== ROLE || !access.can_read || access.can_read_attachments || access.can_read_notes
      || access.can_read_inbox || access.can_write || access.can_delete) {
      throw new DbCommandError('The configured database login does not have the expected research privileges.');
    }
  });
}

async function setup() {
  if (process.env[researchVariable]) {
    await verifyRole();
    console.log('The read-only research login is ready.');
    return;
  }

  // Only create a new role. Preserve an existing role and its credentials across checkouts.
  const password = randomBytes(30).toString('base64url');
  await withDatabase('DATABASE_URL', async (client, url) => {
    await client.query('BEGIN');
    try {
      const existing = await client.query('SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = $1', [ROLE]);
      if (existing.rowCount) {
        throw new DbCommandError(`The ${ROLE} role already exists. Load its connection in ${researchVariable}.`);
      }
      const verifier = scramVerifier(password);
      await client.query(`CREATE ROLE ${ROLE} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
        PASSWORD '${verifier}'`);
      await client.query(`ALTER ROLE ${ROLE} SET default_transaction_read_only = on`);
      await client.query(`GRANT USAGE ON SCHEMA public TO ${ROLE}`);
      await client.query(`GRANT SELECT (${opportunityColumns}) ON public.opportunities TO ${ROLE}`);
      await client.query(`GRANT SELECT (${sourceColumns}) ON public.opportunity_sources TO ${ROLE}`);
      await client.query(`GRANT SELECT (${profileColumns}) ON public.candidate_profiles TO ${ROLE}`);
      // Migration 010 tables. Free-text notes stay private to the app.
      await client.query(`GRANT SELECT (${organizationColumns}) ON public.organizations TO ${ROLE}`);
      await client.query(`GRANT SELECT (${professorColumns}) ON public.professors TO ${ROLE}`);
      await client.query(`GRANT SELECT (opportunity_id, professor_id) ON public.opportunity_professors TO ${ROLE}`);

      // Supavisor routes a username of <role>.<project-ref> to the matching project.
      const [username, ...project] = url.username.split('.');
      url.username = url.hostname.endsWith('.pooler.supabase.com') && username && project.length
        ? [ROLE, ...project].join('.') : ROLE;
      url.password = password;

      // Persist the new credentials before committing the role. Keep the file if the commit result
      // is ambiguous, so the operator can retry verification without rotating a live password.
      await mkdir(privateDirectory, { recursive: true, mode: 0o700 });
      await writeFile(researchEnvFile, `${researchVariable}=${JSON.stringify(url.href)}\n`, { flag: 'wx', mode: 0o600 });
      await client.query('COMMIT');
      process.env[researchVariable] = url.href;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  });

  await verifyRole();
  console.log('The read-only research login is ready. Connection saved to .local/sticky-research.env.');
}

async function runRead(command, argument) {
  return withDatabase(researchVariable, (client) => readOnly(client, async () => {
    if (command === 'list') {
      const { rows } = await client.query(`
        SELECT o.id, o.name, o.category, o.organization_name, o.deadline::text, o.application_url
        FROM public.opportunities o
        WHERE ($1 = '' AND (o.deadline IS NULL OR o.deadline >= (now() AT TIME ZONE $2)::date))
           OR ($1 <> '' AND (
             strpos(lower(concat_ws(' ', o.name, o.organization_name, o.details, o.application_url)), lower($1)) > 0
             OR EXISTS (SELECT 1 FROM public.opportunity_sources s
               WHERE s.opportunity_id = o.id AND strpos(lower(coalesce(s.canonical_url, s.source_url)), lower($1)) > 0)
           ))
        ORDER BY o.deadline NULLS LAST, o.id
        LIMIT 50`, [argument, process.env.APP_TIMEZONE || 'Asia/Dhaka']);
      return rows;
    }
    if (command === 'professors') {
      // Optional filter: a university name fragment or a professor name.
      const { rows } = await client.query(`
        SELECT p.id, o.name AS organization, p.name, p.department, p.research_areas, p.recruiting_status,
          p.recruiting_checked_on::text, p.recruiting_source_url, p.homepage
        FROM public.professors p JOIN public.organizations o ON o.id = p.organization_id
        WHERE $1 = '' OR strpos(lower(concat_ws(' ', o.name, p.name, array_to_string(p.research_areas, ' '))), lower($1)) > 0
        ORDER BY o.name, p.name LIMIT 100`, [argument]);
      return rows;
    }
    if (command === 'organizations') {
      const { rows } = await client.query(`
        SELECT o.id, o.name, o.country, o.website,
          (SELECT count(*)::int FROM public.professors p WHERE p.organization_id = o.id) AS professors,
          (SELECT count(*)::int FROM public.opportunities x WHERE x.organization_id = o.id) AS opportunities
        FROM public.organizations o
        WHERE $1 = '' OR strpos(lower(o.name), lower($1)) > 0 OR $2 = o.name_key OR $2 = ANY(o.alias_keys)
        ORDER BY o.name LIMIT 100`, [argument, argument.toLowerCase()]);
      return rows;
    }
    if (command === 'profile') {
      const { rows: [profile] } = await client.query(`SELECT ${profileColumns} FROM public.candidate_profiles WHERE id = $1`, [argument]);
      return profile ?? null;
    }

    const { rows: [opportunity] } = await client.query(`
      SELECT ${opportunityColumns}, deadline::text FROM public.opportunities WHERE id = $1`, [argument]);
    if (!opportunity) return null;
    const { rows: sources } = await client.query(`
      SELECT ${sourceColumns} FROM public.opportunity_sources WHERE opportunity_id = $1 ORDER BY id`, [argument]);
    return { ...opportunity, sources };
  }));
}

async function main() {
  const [command = 'list', ...args] = process.argv.slice(2);
  const argument = args.join(' ').trim();
  if (command === 'setup' && !argument) return setup();
  if ((command === 'list' && argument.length <= 500) || (command === 'show' && /^\d{1,9}$/.test(argument))
    || ((command === 'professors' || command === 'organizations') && argument.length <= 200)
    || (command === 'profile' && ['swarup', 'archita'].includes(argument))) {
    console.log(JSON.stringify(await runRead(command, argument), null, 2));
    return;
  }
  throw new DbCommandError('Usage: npm run db:research -- setup | list [search] | show <id> | professors [search] | organizations [search] | profile <swarup|archita>');
}

main().catch(reportError);
