import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ login: vi.fn(), lookup: vi.fn(), account: vi.fn(), ilike: vi.fn(), adminAvailable: true }));
vi.mock('@tanstack/react-start', () => ({ createServerFn: () => {
  let parse = (d: any) => d;
  const chain: any = { inputValidator: (v: any) => { parse = v; return chain; }, handler: (h: any) => (args: any) => h({ data: parse(args.data) }) };
  return chain;
} }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { signInWithPassword: m.login } }) }));
vi.mock('@/integrations/supabase/client.server', () => ({ getOptionalSupabaseAdmin: () => m.adminAvailable ? {
  from: () => ({ select: () => ({ ilike: m.ilike }) }), auth: { admin: { getUserById: m.account } },
} : null }));
import { signInWithUsername } from '@/lib/auth.functions';
afterEach(() => vi.unstubAllEnvs());
const attempt = (username: string) => signInWithUsername({ data: { username, password: 'example-password' } });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('SUPABASE_URL', 'https://example.test');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'test-key');
  m.adminAvailable = true;
  m.ilike.mockReturnValue({ maybeSingle: m.lookup });
  m.lookup.mockResolvedValue({ data: { id: 'student' }, error: null });
  m.account.mockResolvedValue({ data: { user: { email: 'private@example.test' } }, error: null });
  m.login.mockResolvedValue({ data: { session: { access_token: 'test-access', refresh_token: 'test-refresh', user: { email: 'private@example.test' } } }, error: null });
});
it('resolves usernames on the server without returning account email or user records', async () => {
  const result = await attempt(' Student_Name ');
  expect(m.ilike).toHaveBeenCalledWith('username', 'Student\\_Name');
  expect(m.account).toHaveBeenCalledWith('student');
  expect(m.login).toHaveBeenCalledWith({ email: 'private@example.test', password: 'example-password' });
  expect(result).toEqual({ ok: true, access_token: 'test-access', refresh_token: 'test-refresh' });
});
it('normalizes email sign-in without administrator lookup', async () => {
  expect((await attempt(' Student@Example.Test ')).ok).toBe(true);
  expect(m.ilike).not.toHaveBeenCalled();
  expect(m.login).toHaveBeenCalledWith({ email: 'student@example.test', password: 'example-password' });
});
it('returns the same error for an unknown username and an incorrect password', async () => {
  m.lookup.mockResolvedValueOnce({ data: null, error: null });
  const unknown = await attempt('unknown');
  expect(m.login).not.toHaveBeenCalled();
  m.login.mockResolvedValueOnce({ data: { session: null }, error: { status: 400, message: 'Invalid login credentials' } });
  expect(await attempt('student')).toEqual(unknown);
});
it('escapes wildcard characters in a username', async () => {
  await attempt('a%_b');
  expect(m.ilike).toHaveBeenCalledWith('username', 'a\\%\\_b');
});
it('distinguishes service outages from rejected passwords', async () => {
  m.adminAvailable = false;
  expect(await attempt('student')).toMatchObject({ ok: false, error: expect.stringContaining('temporarily unavailable') });
  expect(m.login).not.toHaveBeenCalled();
});
it('preserves the email confirmation message', async () => {
  m.login.mockResolvedValueOnce({ data: { session: null }, error: { status: 400, message: 'Email not confirmed' } });
  expect(await attempt('student')).toMatchObject({ ok: false, error: expect.stringContaining('confirm your email') });
});
