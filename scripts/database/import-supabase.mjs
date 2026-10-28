// Run only in a Netlify environment after automatic schema migration.
// No source rows, account emails, credentials, or upstream errors are logged.
import { createClient } from '@supabase/supabase-js';
import { getDatabase } from '@netlify/database';
import { ImportError, TABLES, accountRecord, validateColumns, readPages, inTransaction } from './import-support.mjs';

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  if (args.some(arg => !['--apply', '--source-paused'].includes(arg))) {
    throw new ImportError('Supported flags: --apply --source-paused. Without --apply, only source row counts are checked.');
  }
  if (apply && !args.includes('--source-paused')) {
    throw new ImportError('Pause source writes before importing, then pass --apply --source-paused.');
  }
  const url = process.env.MIGRATION_SOURCE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new ImportError('Source administrator access is unavailable. Configure it securely in the Netlify environment.');
  const source = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const counts = {};

  // Test privileged access rather than mistaking RLS-filtered empty results for
  // a complete export. This does not invite users or modify the source.
  const authProbe = await source.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (authProbe.error) throw new ImportError('Source account administrator access failed; no data was imported.');
  for (const [table] of TABLES) {
    if (table === 'accounts') continue;
    const { count, error } = await source.from(table).select('*', { count: 'exact', head: true });
    if (error || count === null) throw new ImportError(`Cannot read source table ${table}; no data was imported.`);
    counts[table] = count;
  }

  if (!apply) {
    const accountCount = await readPages(async (page, size) => {
      const { data, error } = await source.auth.admin.listUsers({ page: page + 1, perPage: size });
      if (error) throw new ImportError('Cannot read source accounts.');
      return data.users;
    }, async () => {});
    console.log(`Source accounts: ${accountCount}`);
    for (const [table, count] of Object.entries(counts)) console.log(`${table}: ${count} source rows`);
    console.log('Readiness check only. No destination data changed. Media files and authentication cutover are separate steps.');
    return;
  }

  const db = getDatabase();
  const client = await db.pool.connect();
  try {
    const summary = await inTransaction(client, async () => {
      // Concurrent imports cannot both pass the empty-destination check.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('mfp-legacy-import'))");
      const columns = {};
      for (const [table] of TABLES) {
        const result = await client.query(
          'SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position',
          ['mfp', table],
        );
        columns[table] = result.rows.map(row => row.column_name);
        if (!columns[table].length) throw new ImportError('Destination migration has not been applied. Deploy before importing.');
        const existing = await client.query(`SELECT 1 FROM mfp."${table}" LIMIT 1`);
        if (existing.rows.length) throw new ImportError('Destination contains data. Import refused to avoid overwriting existing records.');
      }
      const imported = {};
      for (const [table, order] of TABLES) {
        const read = async (page, size) => {
          if (table === 'accounts') {
            const { data, error } = await source.auth.admin.listUsers({ page: page + 1, perPage: size });
            if (error) throw new ImportError('Cannot read source accounts.');
            return data.users.map(accountRecord);
          }
          let query = source.from(table).select('*');
          for (const column of order) query = query.order(column);
          const { data, error } = await query.range(page * size, (page + 1) * size - 1);
          if (error || !data) throw new ImportError(`Cannot read source table ${table}.`);
          return data;
        };
        imported[table] = await readPages(read, async rows => {
          validateColumns(rows, columns[table]);
          // Table and column identifiers come only from the fixed manifest and
          // destination schema; record values are always parameterized.
          const names = columns[table].map(name => '"' + name.replaceAll('"', '""') + '"').join(', ');
          await client.query(
            `INSERT INTO mfp."${table}" (${names}) SELECT ${names} FROM jsonb_populate_recordset(NULL::mfp."${table}", $1::jsonb)`,
            [JSON.stringify(rows)],
          );
        });
        const result = await client.query(`SELECT count(*)::int AS count FROM mfp."${table}"`);
        if (result.rows[0].count !== imported[table]) throw new ImportError(`Destination count mismatch for ${table}.`);
        if (table !== 'accounts') {
          const { count, error } = await source.from(table).select('*', { count: 'exact', head: true });
          if (error || count !== counts[table] || count !== imported[table]) {
            throw new ImportError(`Source changed or was incompletely read for ${table}; import rolled back.`);
          }
        }
      }
      return imported;
    });
    for (const [table, count] of Object.entries(summary)) console.log(`${table}: ${count} rows imported`);
    console.log('Structured import committed. The application still uses its existing backend. Verify accounts, private files, and API permissions before switching it.');
  } finally {
    client.release();
    await db.pool.end();
  }
}

main().catch(error => {
  // Never print driver errors: they may contain SQL values or connection details.
  const safe = error instanceof ImportError;
  console.error(safe ? error.message : 'Import failed. No completion is claimed. Inspect configuration without logging credentials or source records.');
  process.exitCode = 1;
});
