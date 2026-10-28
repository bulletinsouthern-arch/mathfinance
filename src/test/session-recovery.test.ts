import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSessionRecovery, withSessionRecovery } from '@/integrations/supabase/session-recovery';

function setup(expires = 0) {
  const session = { access_token: 'old', expires_at: expires };
  const renewed = { access_token: 'new', expires_at: Date.now() / 1000 + 3600 };
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    refreshSession: vi.fn().mockResolvedValue({ data: { session: renewed }, error: null }),
  };
  return { auth, recover: createSessionRecovery(auth as unknown as SupabaseClient['auth']) };
}

describe('posting session recovery', () => {
  it('shares refresh across simultaneous saves', async () => {
    const { auth, recover } = setup();
    const sessions = await Promise.all([recover(), recover(), recover()]);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(sessions.every(s => s?.access_token === 'new')).toBe(true);
  });
  it('renews before sending an article write and preserves its body', async () => {
    const { recover } = setup();
    const transport = vi.fn(async (r: Request) => {
      expect(r.headers.get('Authorization')).toBe('Bearer new');
      expect(await r.text()).toBe('article content');
      return new Response('{}');
    });
    await withSessionRecovery(transport as typeof fetch, recover)('https://example.test/rest/v1/course_sections', {
      method: 'PATCH', headers: { Authorization: 'Bearer old' }, body: 'article content',
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('replays an explicitly expired upload once with the renewed token', async () => {
    const { recover, auth } = setup(Date.now() / 1000 + 3600);
    const bodies: string[] = [];
    const transport = vi.fn(async (r: Request) => {
      bodies.push(await r.text());
      return transport.mock.calls.length === 1
        ? Response.json({ message: 'jwt expired' }, { status: 401 })
        : new Response('{}');
    });
    await withSessionRecovery(transport as typeof fetch, recover)('https://example.test/storage/v1/object/media/photo', {
      method: 'POST', headers: { Authorization: 'Bearer old' }, body: 'photo bytes',
    });
    expect(bodies).toEqual(['photo bytes', 'photo bytes']);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[1]![0].headers.get('Authorization')).toBe('Bearer new');
  });
  it.each([403, 500])('does not replay unrelated failures (%s)', async status => {
    const { recover, auth } = setup(Date.now() / 1000 + 3600);
    const transport = vi.fn().mockResolvedValue(Response.json({ message: 'permission denied' }, { status }));
    await withSessionRecovery(transport, recover)('https://example.test/rest/v1/courses', { headers: { Authorization: 'Bearer old' } });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });
  it('stops before posting when renewal fails', async () => {
    const { recover, auth } = setup();
    auth.refreshSession.mockResolvedValue({ data: { session: null }, error: { message: 'invalid refresh' } } as never);
    const transport = vi.fn();
    await expect(withSessionRecovery(transport, recover)('https://example.test/rest/v1/courses', { headers: { Authorization: 'Bearer old' } })).rejects.toThrow('session could not be renewed');
    expect(transport).not.toHaveBeenCalled();
  });
});
