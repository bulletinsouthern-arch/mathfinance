// Favorites and recently viewed live in the browser for quick personal access.
const read = (k: string): string[] => {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; }
};
const write = (k: string, v: string[]) => localStorage.setItem(k, JSON.stringify(v));
export const getFavorites = () => read("mfp-fav");
export const toggleFavorite = (id: string) => {
  const f = getFavorites();
  const n = f.includes(id) ? f.filter((x) => x !== id) : [id, ...f];
  write("mfp-fav", n);
  return n;
};
export const getRecent = () => read("mfp-recent");
export const pushRecent = (id: string) => write("mfp-recent", [id, ...getRecent().filter((x) => x !== id)].slice(0, 20));
export const removeRecent = (id: string) => { const n = getRecent().filter((x) => x !== id); write("mfp-recent", n); return n; };
export const clearRecent = () => { write("mfp-recent", []); return [] as string[]; };
