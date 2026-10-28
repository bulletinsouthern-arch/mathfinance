import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { TABLES, accountRecord, inTransaction, readPages, validateColumns } from '../../scripts/database/import-support.mjs';

// These tests exercise failure paths that must never leave a partial migration.
describe('database import', () => {
  it('rolls back all destination writes if any table fails', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    await expect(inTransaction(client, async () => { throw new Error('table failed'); })).rejects.toThrow('table failed');
    expect(client.query.mock.calls.map(call => call[0])).toEqual(['BEGIN', 'ROLLBACK']);
  });

  it('commits only after verification completes', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    await expect(inTransaction(client, async () => 42)).resolves.toBe(42);
    expect(client.query.mock.calls.map(call => call[0])).toEqual(['BEGIN', 'COMMIT']);
  });

  it('reads all pages, including an exact multiple of the page size', async () => {
    const read = vi.fn(async (page: number) => [[{ id: 1 }, { id: 2 }], [{ id: 3 }, { id: 4 }], []][page] ?? []);
    const rows: unknown[] = [];
    expect(await readPages(read, async (batch: unknown[]) => { rows.push(...batch); }, 2)).toBe(4);
    expect(read).toHaveBeenCalledTimes(3);
    expect(rows).toHaveLength(4);
  });

  it('rejects schema drift instead of dropping unknown source fields', () => {
    expect(() => validateColumns([{ id: 'a', new_field: 'keep me' }], ['id'])).toThrow('Source schema differs');
    expect(() => validateColumns([{ id: 'a' }], ['id'])).not.toThrow();
  });

  it('preserves the account ID without copying passwords or sessions', () => {
    const row = accountRecord({ id: 'legacy-id', email: 'example@example.com', created_at: '2026-01-01', encrypted_password: 'private', access_token: 'private', refresh_token: 'private' });
    expect(row.id).toBe('legacy-id');
    expect(row.identity_id).toBeNull();
    expect(row).not.toHaveProperty('encrypted_password');
    expect(row).not.toHaveProperty('access_token');
    expect(row).not.toHaveProperty('refresh_token');
  });

  it('has destination tables for every source table and keeps account data private', () => {
    const sql = readFileSync('netlify/database/migrations/20261028110000_create_application_database.sql', 'utf8');
    for (const [table] of TABLES) {
      expect(sql.toLowerCase()).toContain(`create table mfp.${table} (`);
      expect(sql).toContain(`REVOKE ALL ON TABLE mfp.${table} FROM PUBLIC;`);
      expect(sql).toContain(`ALTER TABLE mfp.${table} ENABLE ROW LEVEL SECURITY;`);
    }
    expect(sql).not.toContain('auth.users');
    expect(sql).not.toMatch(/INSERT INTO/i);
  });
});
