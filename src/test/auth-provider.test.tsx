import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/hooks/use-auth';

const mocks = vi.hoisted(() => ({ recover: vi.fn(), profile: vi.fn(), role: vi.fn(), callback: undefined as undefined | ((event: string, session: unknown) => void) }));
vi.mock('@/integrations/supabase/client', () => ({
  recoverSession: mocks.recover,
  supabase: {
    auth: { onAuthStateChange: (cb: typeof mocks.callback) => { mocks.callback = cb; return { data: { subscription: { unsubscribe: vi.fn() } } }; } },
    from: () => ({ select: () => ({ eq: () => ({ abortSignal: () => ({ maybeSingle: mocks.profile }) }) }) }),
    rpc: () => ({ abortSignal: mocks.role }),
  },
}));
const session = { user: { id: 'one', user_metadata: { first_name: 'Jane', last_name: 'Doe' } } };
function State() {
  const a = useAuth();
  return <div>{a.session ? 'signed in' : 'signed out'}|{a.username}|{String(a.isAdmin)}|{String(a.reconnecting)}</div>;
}
function mount() { return render(<AuthProvider><State /></AuthProvider>); }
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });
describe('account session continuity', () => {
  it('keeps account identity and admin navigation during failed lookups, then applies role revocation', async () => {
    mocks.recover.mockResolvedValue(session);
    mocks.profile.mockResolvedValue({ data: { username: 'legacy' }, error: null });
    mocks.role.mockResolvedValue({ data: true, error: null });
    mount();
    await waitFor(() => expect(screen.getByText('signed in|Jane Doe|true|false')).toBeTruthy());
    mocks.profile.mockRejectedValue(new Error('offline'));
    mocks.role.mockResolvedValue({ error: { message: 'offline' } });
    act(() => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(screen.getByText('signed in|Jane Doe|true|true')).toBeTruthy());
    mocks.role.mockResolvedValue({ data: false, error: null });
    act(() => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(screen.getByText('signed in|Jane Doe|false|true')).toBeTruthy());
  });
  it('does not restore a stale account after sign-out while profile lookup is pending', async () => {
    let resolve!: (value: unknown) => void;
    mocks.recover.mockResolvedValue(session);
    mocks.profile.mockReturnValue(new Promise(r => { resolve = r; }));
    mocks.role.mockResolvedValue({ data: true });
    mount();
    await waitFor(() => expect(screen.getByText('signed in|Jane Doe|false|false')).toBeTruthy());
    act(() => mocks.callback?.('SIGNED_OUT', null));
    await act(async () => resolve({ data: { username: 'stale' } }));
    expect(screen.getByText('signed out||false|false')).toBeTruthy();
  });
  it('retries a temporary renewal failure on the periodic recovery timer', async () => {
    vi.useFakeTimers();
    mocks.recover.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(session);
    mocks.profile.mockResolvedValue({ data: { username: 'legacy' } });
    mocks.role.mockResolvedValue({ data: true });
    mount();
    await act(async () => {});
    expect(screen.getByText('signed out||false|true')).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(screen.getByText('signed in|Jane Doe|true|false')).toBeTruthy();
  });
});
