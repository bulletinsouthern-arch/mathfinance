import type { Session, SupabaseClient } from '@supabase/supabase-js';

// One refresh per browser client, including simultaneous uploads and page saves.
export function createSessionRecovery(auth: SupabaseClient['auth']) {
  let refreshing: Promise<Session | null> | null = null;
  return async function recover(forceForToken?: string): Promise<Session | null> {
    if (refreshing) return refreshing;
    const { data, error } = await auth.getSession();
    if (error) throw new Error('Unable to reconnect. Check your connection and try again; your edits are still here.');
    const session = data.session;
    if (!session) return null;
    if (forceForToken && session.access_token !== forceForToken) return session;
    if (!forceForToken && session.expires_at && session.expires_at * 1000 > Date.now() + 60_000) return session;
    if (!refreshing) {
      refreshing = (async () => {
        const result = await auth.refreshSession();
        if (result.error || !result.data.session) {
          throw new Error('Your session could not be renewed. Reconnect or sign in again, then retry saving.');
        }
        return result.data.session;
      })().finally(() => { refreshing = null; });
    }
    return refreshing;
  };
}

// Only replay requests explicitly rejected by authentication, never ambiguous
// network failures or server errors that may have committed a write already.
export function withSessionRecovery(
  transport: typeof fetch,
  recover: ReturnType<typeof createSessionRecovery>,
): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    if (!request.headers.get('Authorization')?.startsWith('Bearer ')) return transport(request);
    const session = await recover();
    if (session) request.headers.set('Authorization', `Bearer ${session.access_token}`);
    const retry = request.clone();
    const response = await transport(request);
    if (response.status !== 401 && response.status !== 403) return response;
    const body = await response.clone().json().catch(() => null);
    if (!/jwt expired|token (?:has )?expired/i.test(String(body?.message ?? body?.msg ?? body?.error ?? ''))) return response;
    const token = retry.headers.get('Authorization')!.slice(7);
    const renewed = await recover(token);
    if (!renewed) return response;
    retry.headers.set('Authorization', `Bearer ${renewed.access_token}`);
    return transport(retry);
  };
}
