import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthState = {
  session: Session | null;
  username: string | null;
  isAdmin: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
};
const Ctx = createContext<AuthState>({ session: null, username: null, isAdmin: false, loading: true, refresh: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load(s: Session | null) {
    setSession(s);
    if (!s) { setUsername(null); setIsAdmin(false); setLoading(false); return; }
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("username").eq("id", s.user.id).maybeSingle(),
      supabase.rpc("has_role", { _user_id: s.user.id, _role: "admin" }),
    ]);
    setUsername(p?.username ?? null);
    setIsAdmin(!!r);
    setLoading(false);
  }

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setTimeout(() => load(s), 0); });
    supabase.auth.getSession().then(({ data }) => load(data.session));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <Ctx.Provider value={{ session, username, isAdmin, loading, refresh: async () => load((await supabase.auth.getSession()).data.session) }}>
      {children}
    </Ctx.Provider>
  );
}
export const useAuth = () => useContext(Ctx);
