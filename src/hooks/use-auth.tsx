import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, recoverSession } from "@/integrations/supabase/client";

type AuthState = {
  session: Session | null;
  username: string | null;
  isAdmin: boolean;
  loading: boolean;
  reconnecting: boolean;
  refresh: () => Promise<void>;
};
const Ctx = createContext<AuthState>({ session: null, username: null, isAdmin: false, loading: true, reconnecting: false, refresh: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const refresh = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let active = true;
    let generation = 0;
    let userId: string | undefined;
    let pending: Promise<void> | undefined;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    async function load(s: Session | null) {
      if (!active) return;
      const version = ++generation;
      const changedUser = userId !== s?.user.id;
      userId = s?.user.id;
      setSession(s);
      if (!s) {
        setUsername(null);
        setIsAdmin(false);
        setLoading(false);
        setReconnecting(false);
        return;
      }
      const metadata = s.user.user_metadata;
      const name = [metadata?.['first_name'], metadata?.['last_name']].filter(Boolean).join(' ').trim()
        || metadata?.['full_name'] || null;
      if (changedUser) {
        setUsername(name);
        setIsAdmin(false);
      }
      setLoading(false);
      // Each lookup settles independently, and a hung connection cannot block recovery.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      timers.add(timeout);
      try {
        const results = await Promise.allSettled([
          supabase.from("profiles").select("username").eq("id", s.user.id).abortSignal(controller.signal).maybeSingle(),
          supabase.rpc("has_role", { _user_id: s.user.id, _role: "admin" }).abortSignal(controller.signal),
        ]);
        if (!active || version !== generation) return;
        const [profile, role] = results;
        const profileOk = profile.status === 'fulfilled' && !profile.value.error;
        const roleOk = role.status === 'fulfilled' && !role.value.error;
        if (profileOk) setUsername(name || null);
        if (roleOk) setIsAdmin(!!role.value.data);
        setReconnecting(!profileOk || !roleOk);
      } finally {
        clearTimeout(timeout);
        timers.delete(timeout);
      }
    }

    const reconnect = (): Promise<void> => {
      if (!active || document.visibilityState === "hidden") return Promise.resolve();
      if (pending) return pending;
      const version = generation;
      pending = (async () => {
        try {
          const restored = await recoverSession();
          // A sign-out or newer auth event takes precedence over this request.
          if (active && version === generation) await load(restored);
        } catch {
          if (active && version === generation) {
            setReconnecting(true);
            setLoading(false);
          }
        }
      })().finally(() => { pending = undefined; });
      return pending;
    };
    refresh.current = reconnect;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      // Invalidate in-flight work immediately; do SDK queries outside the auth lock.
      const version = ++generation;
      if (!s) {
        void load(null);
        return;
      }
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (active && version === generation) void load(s);
      }, 0);
      timers.add(timer);
    });
    void reconnect();
    // Retry outages without requiring the user to switch tabs or refresh the page.
    const interval = setInterval(() => { void reconnect(); }, 30_000);
    window.addEventListener("focus", reconnect);
    window.addEventListener("online", reconnect);
    window.addEventListener("pageshow", reconnect);
    document.addEventListener("visibilitychange", reconnect);
    return () => {
      active = false;
      ++generation;
      refresh.current = async () => {};
      sub.subscription.unsubscribe();
      clearInterval(interval);
      timers.forEach(clearTimeout);
      window.removeEventListener("focus", reconnect);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("pageshow", reconnect);
      document.removeEventListener("visibilitychange", reconnect);
    };
  }, []);

  return (
    <Ctx.Provider value={{ session, username, isAdmin, loading, reconnecting, refresh: () => refresh.current() }}>
      {children}
    </Ctx.Provider>
  );
}
export const useAuth = () => useContext(Ctx);
