// Favorites live in the browser. Recently viewed is kept in the browser AND, when signed in,
// in the user's account so it never vanishes — only the user's ✕ / Clear all removes it.
import { supabase } from "@/integrations/supabase/client";

const read = (k: string): string[] => {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; }
};
const write = (k: string, v: string[]) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
export const getFavorites = () => read("mfp-fav");
export const toggleFavorite = (id: string) => {
  const f = getFavorites();
  const n = f.includes(id) ? f.filter((x) => x !== id) : [id, ...f];
  write("mfp-fav", n);
  return n;
};
export const clearFavorites = () => { write("mfp-fav", []); return [] as string[]; };

const KEY = "mfp-recent";
const LIMIT = 50;
export const getRecent = () => read(KEY);

async function uid() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/** Merge account recents into the browser list; returns the merged list. */
export async function syncRecent(): Promise<string[]> {
  const u = await uid();
  if (!u) return getRecent();
  const { data } = await supabase.from("formula_views").select("formula_id, viewed_at").eq("user_id", u).order("viewed_at", { ascending: false }).limit(LIMIT);
  const remote = (data ?? []).map((r) => r.formula_id);
  const local = getRecent();
  const merged = [...local, ...remote.filter((x) => !local.includes(x))].slice(0, LIMIT);
  write(KEY, merged);
  const missing = local.filter((x) => !remote.includes(x));
  if (missing.length) await supabase.from("formula_views").upsert(missing.map((formula_id) => ({ user_id: u, formula_id })));
  return merged;
}

export const pushRecent = (id: string) => {
  write(KEY, [id, ...getRecent().filter((x) => x !== id)].slice(0, LIMIT));
  void uid().then((u) => u && supabase.from("formula_views").upsert({ user_id: u, formula_id: id, viewed_at: new Date().toISOString() }));
};
export const removeRecent = (id: string) => {
  const n = getRecent().filter((x) => x !== id);
  write(KEY, n);
  void uid().then((u) => u && supabase.from("formula_views").delete().eq("user_id", u).eq("formula_id", id));
  return n;
};
export const clearRecent = () => {
  write(KEY, []);
  void uid().then((u) => u && supabase.from("formula_views").delete().eq("user_id", u));
  return [] as string[];
};
