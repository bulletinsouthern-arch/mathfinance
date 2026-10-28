export class ImportError extends Error {}
export const TABLES: ReadonlyArray<readonly [string, readonly string[]]>;
export function validateColumns(rows: unknown[], columns: readonly string[]): void;
export function accountRecord(user: {
  id: string;
  created_at: string;
  email?: string;
  email_confirmed_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}): {
  id: string;
  email: string | null;
  email_confirmed_at: string | null;
  created_at: string;
  updated_at: string | null;
  identity_id: null;
};
export function readPages<T>(
  readPage: (page: number, size: number) => Promise<T[]>,
  consume: (rows: T[]) => Promise<void>,
  size?: number,
): Promise<number>;
export function inTransaction<T>(
  client: { query: (query: string) => Promise<unknown> },
  work: () => Promise<T>,
): Promise<T>;
