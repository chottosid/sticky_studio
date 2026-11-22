const fs = require('node:fs/promises');
const path = require('node:path');
const { withDatabase, reportError } = require('./db-access');

async function main() {
  const migrationsDirectory = path.join(__dirname, '..', 'db', 'migrations');
  const files = (await fs.readdir(migrationsDirectory)).filter((file) => file.endsWith('.sql')).sort();

  await withDatabase('DATABASE_URL', async (client) => {
    for (const file of files) {
      await client.query('BEGIN');
      try {
        await client.query('SELECT pg_advisory_xact_lock(346242, 392)');
        await client.query(`
          CREATE TABLE IF NOT EXISTS schema_migrations (
            name TEXT PRIMARY KEY,
            applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);
        const applied = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
        if (!applied.rowCount) {
          console.log(`Applying: ${file}`);
          await client.query(await fs.readFile(path.join(migrationsDirectory, file), 'utf8'));
          await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        } else {
          console.log(`Already applied: ${file}`);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    }
  });
}

main().catch(reportError);
