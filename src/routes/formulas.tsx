import { createFileRoute, Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Search, Star } from "lucide-react";
import { CATEGORIES, FORMULAS } from "@/lib/formulas";
import { getFavorites, getRecent } from "@/lib/favorites";
import { CatLogo } from "@/components/SignedImage";

const schema = z.object({
  q: z.string().optional(),
  cat: z.number().optional(),
  view: z.enum(["favorites", "recent"]).optional(),
});

export const Route = createFileRoute("/formulas")({
  validateSearch: (s) => schema.parse(s),
  head: () => ({
    meta: [
      { title: "Formula Library — Math & Finance Pro" },
      { name: "description", content: "Search and calculate 400+ finance, accounting, operations and statistics formulas." },
      { property: "og:title", content: "Formula Library — Math & Finance Pro" },
      { property: "og:description", content: "Search and calculate 400+ financial formulas." },
    ],
  }),
  component: FormulasPage,
});

function FormulasPage() {
  const match = useMatchRoute();
  if (match({ to: "/formulas/$id", fuzzy: true })) return <Outlet />;
  return <FormulaList />;
}

function FormulaList() {
  const { q = "", cat, view } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [text, setText] = useState(q);
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => { setText(q); }, [q]);
  useEffect(() => { setIds(view === "favorites" ? getFavorites() : view === "recent" ? getRecent() : []); }, [view]);

  const list = useMemo(() => {
    let l = FORMULAS;
    if (view) l = ids.map((id) => FORMULAS.find((f) => f.id === id)!).filter(Boolean);
    if (cat) l = l.filter((f) => f.cat === cat);
    const t = text.trim().toLowerCase();
    if (t) l = l.filter((f) => f.name.toLowerCase().includes(t) || f.expr.toLowerCase().includes(t));
    return l;
  }, [cat, text, view, ids]);

  const title = view === "favorites" ? "Favorites" : view === "recent" ? "Recently Viewed" : cat ? CATEGORIES[cat - 1]?.name : "All Formulas";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-[0.2em] text-primary">FORMULA LIBRARY</p>
        <h1 className="mt-1 text-4xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{list.length} formulas — click any to calculate instantly.</p>
      </div>
      <div className="flex items-center rounded-xl border border-border bg-card px-4">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search formulas…" className="h-12 flex-1 bg-transparent px-3 text-sm outline-none" />
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => navigate({ search: { q: text || undefined } })} className={`rounded-full border px-3 py-1 text-xs ${!cat && !view ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary"}`}>All</button>
        {CATEGORIES.map((c) => (
          <button key={c.id} onClick={() => navigate({ search: { cat: c.id, view, q: text || undefined } })} className={`rounded-full border px-3 py-1 text-xs ${cat === c.id ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary"}`}>
            {c.id}. {c.name.split(" ")[0]} {c.name.split(" ")[1]?.replace(",", "")}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          {view === "favorites" ? <><Star className="mx-auto mb-2 h-6 w-6" />No favorites yet — tap the star on any formula.</> : "No formulas match your search."}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((f) => {
            return (
              <Link key={f.id} to="/formulas/$id" params={{ id: f.id }} className="group rounded-xl border border-border bg-card p-4 transition hover:border-primary/40 hover:shadow-[var(--shadow-elegant)]">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-primary"><CatLogo cat={f.cat} className="h-4 w-4" /></span>
                  <div className="min-w-0">
                    <h3 className="font-sans text-sm font-semibold group-hover:text-primary">{f.name}</h3>
                    <p className="mt-1 line-clamp-2 font-mono text-xs text-muted-foreground">{f.expr}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
