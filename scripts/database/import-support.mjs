export class ImportError extends Error {}

// Parent tables must be imported before their children. Identifiers never come
// from command-line arguments or database rows.
export const TABLES = Object.freeze([
  ['accounts', ['id']],
  ['profiles', ['id']],
  ['user_roles', ['id']],
  ['site_content', ['key']],
  ['media_posts', ['id']],
  ['subjects', ['id']],
  ['courses', ['id']],
  ['course_units', ['id']],
  ['course_sections', ['id']],
  ['enrollments', ['id']],
  ['course_views', ['user_id', 'course_id']],
  ['quizzes', ['id']],
  ['quiz_questions', ['id']],
  ['quiz_attempts', ['id']],
  ['site_settings', ['key']],
  ['payment_settings', ['id']],
  ['formula_views', ['user_id', 'formula_id']],
  ['exam_bans', ['id']],
  ['custom_formulas', ['id']],
  ['retake_requests', ['id']],
]);

export function validateColumns(rows, columns) {
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new ImportError('Invalid source record.');
    }
    if (Object.keys(row).some(key => !columns.includes(key))) {
      // Fail rather than silently discarding fields from a newer source schema.
      throw new ImportError('Source schema differs from the destination; update the migration before importing.');
    }
  }
}

export function accountRecord(user) {
  if (!user.id || !user.created_at) throw new ImportError('Invalid source account.');
  return {
    id: user.id,
    email: user.email ?? null,
    email_confirmed_at: user.email_confirmed_at ?? null,
    created_at: user.created_at,
    updated_at: user.updated_at ?? null,
    identity_id: null,
  };
}

export async function readPages(readPage, consume, size = 200) {
  let total = 0;
  for (let page = 0; ; page++) {
    const rows = await readPage(page, size);
    if (!Array.isArray(rows) || rows.length > size) throw new ImportError('Invalid source page.');
    if (rows.length) await consume(rows);
    total += rows.length;
    if (rows.length < size) return total;
  }
}

export async function inTransaction(client, work) {
  await client.query('BEGIN');
  try {
    const result = await work();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
