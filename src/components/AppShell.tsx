import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { BarChart3, Calculator, ChevronRight, Clock, FunctionSquare, LayoutGrid, LogOut, Menu, Search, Settings, Shield, Sigma, Star, X } from "lucide-react";
import { CATEGORIES, FORMULAS } from "@/lib/formulas";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useSiteSettings } from "@/lib/settings";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/formulas", label: "Formulas" },
  { to: "/calculators", label: "Calculators" },
  { to: "/resources", label: "Resources" },
  { to: "/courses", label: "Courses" },
  { to: "/about", label: "About" },
] as const;

export function Logo() {
  const s = useSiteSettings();
  const { data: logoUrl } = useQuery({
    queryKey: ["site-logo", s["site_logo"]],
    enabled: !!s["site_logo"],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => (await supabase.storage.from("media").createSignedUrl(s["site_logo"]!, 60 * 60 * 24)).data?.signedUrl ?? null,
  });
  return (
    <Link to="/" className="flex items-center gap-2.5">
      {logoUrl ? (
        <img src={logoUrl} alt="Site logo" className="h-9 w-9 rounded-md object-contain" />
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <BarChart3 className="h-5 w-5" />
        </span>
      )}
      <span className="leading-tight">
        <span className="block font-serif text-xl font-semibold text-foreground">Math &amp; Finance Pro</span>
        <span className="block text-[10px] tracking-[0.2em] text-muted-foreground">REAL NUMBERS. BETTER DECISIONS.</span>
      </span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { session, username, isAdmin } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  function search(e: React.FormEvent) {
    e.preventDefault();
    navigate({ to: "/formulas", search: { q, cat: undefined, view: undefined } });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-6 px-4 lg:px-6">
          <button className="lg:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Logo />
          <nav className="ml-6 hidden items-center gap-7 lg:flex">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} activeOptions={{ exact: n.to === "/" }}
                className="relative py-5 text-sm font-medium text-foreground/80 transition hover:text-primary data-[status=active]:text-primary data-[status=active]:after:absolute data-[status=active]:after:inset-x-0 data-[status=active]:after:bottom-0 data-[status=active]:after:h-0.5 data-[status=active]:after:bg-primary">
                {n.label}
              </Link>
            ))}
            {isAdmin && (
              <Link to="/admin" className="flex items-center gap-1 text-sm font-medium text-gold hover:opacity-80"><Shield className="h-4 w-4" />Admin</Link>
            )}
          </nav>
          <form onSubmit={search} className="ml-auto hidden max-w-xs flex-1 items-center rounded-full border border-border bg-muted/60 px-4 md:flex">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search any formula, ratio or metric…" className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            <Search className="h-4 w-4 text-muted-foreground" />
          </form>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            {session ? (
              <>
                <Link to="/settings" className="hidden text-sm text-muted-foreground hover:text-foreground sm:block">@{username ?? "account"}</Link>
                <Button variant="outline" size="sm" onClick={signOut}><LogOut className="mr-1.5 h-4 w-4" />Sign out</Button>
              </>
            ) : (
              <>
                <Button asChild size="sm"><Link to="/auth" search={{ mode: "login" }}>Sign In</Link></Button>
                <Button asChild size="sm" variant="outline" className="border-primary text-primary"><Link to="/auth" search={{ mode: "signup" }}>Get Started</Link></Button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1600px]">
        <aside className={`${open ? "fixed inset-y-16 left-0 z-30 flex" : "hidden"} w-64 shrink-0 flex-col border-r border-border bg-sidebar p-4 lg:sticky lg:top-16 ${path.startsWith("/courses") ? "" : "lg:flex"} lg:h-[calc(100vh-4rem)]`}>
          {path.startsWith("/formulas") ? <FormulaPicker path={path} onPick={() => setOpen(false)} /> : (
            <nav className="space-y-1" onClick={() => setOpen(false)}>
              {[
                { label: "All Categories", icon: LayoutGrid, search: {} },
                { label: "Favorites", icon: Star, search: { view: "favorites" } },
                { label: "Recently Viewed", icon: Clock, search: { view: "recent" } },
                { label: "Formulas", icon: FunctionSquare, search: {} },
                { label: "My own equations", icon: Sigma, search: {}, to: "/equations" },
                { label: "Calculators", icon: Calculator, search: {}, to: "/calculators" },
                { label: "Settings", icon: Settings, search: {}, to: "/settings" },
              ].map((s) => (
                <Link key={s.label} to={(s.to ?? "/formulas") as never} search={s.search as never}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold text-sidebar-foreground/85 transition hover:bg-sidebar-accent">
                  <s.icon className="h-4 w-4 text-primary" />{s.label}
                </Link>
              ))}
            </nav>
          )}
          <div className="mt-3 border-t border-border pt-3 lg:hidden" onClick={() => setOpen(false)}>
            {NAV.map((n) => (<Link key={n.to} to={n.to} className="block rounded-lg px-3 py-2 text-sm">{n.label}</Link>))}
            {isAdmin && <Link to="/admin" className="block rounded-lg px-3 py-2 text-sm text-gold">Admin</Link>}
          </div>
        </aside>
        <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

/** Sidebar: search + every category with its formulas — one click opens a formula. */
function FormulaPicker({ path, onPick }: { path: string; onPick: () => void }) {
  const [q, setQ] = useState("");
  const current = path.startsWith("/formulas/") ? decodeURIComponent(path.slice(10)) : "";
  const currentCat = FORMULAS.find((f) => f.id === current)?.cat;
  const [openCat, setOpenCat] = useState<number | null>(currentCat ?? null);
  const t = q.trim().toLowerCase();
  const hits = t ? FORMULAS.filter((f) => f.name.toLowerCase().includes(t)).slice(0, 60) : [];
  const item = (f: (typeof FORMULAS)[number]) => (
    <Link key={f.id} to="/formulas/$id" params={{ id: f.id }} onClick={onPick}
      className={`block truncate rounded-md px-2 py-1.5 text-[13px] transition hover:bg-sidebar-accent ${f.id === current ? "bg-primary font-bold text-primary-foreground hover:bg-primary" : "text-sidebar-foreground/85"}`}>{f.name}</Link>
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center rounded-lg border border-border bg-background px-2.5">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a formula…" className="h-9 flex-1 bg-transparent px-2 text-sm outline-none" />
      </div>
      <div className="mt-2 flex gap-1 text-xs">
        <Link to="/formulas" search={{ view: "favorites" } as never} onClick={onPick} className="flex flex-1 items-center justify-center gap-1 rounded-md border border-border py-1.5 hover:border-primary"><Star className="h-3.5 w-3.5" />Favorites</Link>
        <Link to="/formulas" search={{ view: "recent" } as never} onClick={onPick} className="flex flex-1 items-center justify-center gap-1 rounded-md border border-border py-1.5 hover:border-primary"><Clock className="h-3.5 w-3.5" />Recent</Link>
      </div>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
        {t ? (hits.length ? hits.map(item) : <p className="px-2 text-xs text-muted-foreground">No formula found.</p>)
          : CATEGORIES.map((c) => (
            <div key={c.id}>
              <button onClick={() => setOpenCat(openCat === c.id ? null : c.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] font-bold hover:bg-sidebar-accent">
                <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-gold transition ${openCat === c.id ? "rotate-90" : ""}`} />
                <span className="truncate">{c.name}</span>
              </button>
              {openCat === c.id && <div className="mb-1 ml-3 border-l border-border pl-2">{FORMULAS.filter((f) => f.cat === c.id).map(item)}</div>}
            </div>
          ))}
      </div>
    </div>
  );
}
