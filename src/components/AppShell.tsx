import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { BarChart3, Calculator, Clock, FunctionSquare, LayoutGrid, LogOut, Menu, Search, Settings, Shield, Star, X } from "lucide-react";
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

  const side = [
    { to: "/formulas", label: "All Categories", icon: LayoutGrid, search: {} },
    { to: "/formulas", label: "Favorites", icon: Star, search: { view: "favorites" } },
    { to: "/formulas", label: "Recently Viewed", icon: Clock, search: { view: "recent" } },
    { to: "/formulas", label: "Formulas", icon: FunctionSquare, search: {} },
    { to: "/calculators", label: "Calculators", icon: Calculator, search: {} },
    { to: "/settings", label: "Settings", icon: Settings, search: {} },
  ];

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
          <nav className="space-y-1" onClick={() => setOpen(false)}>
            {side.map((s, i) => (
              <Link key={i} to={s.to} search={s.search as never}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition hover:bg-sidebar-accent ${i === 0 && path === "/formulas" ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-sidebar-foreground/80"}`}>
                <s.icon className="h-4 w-4" />{s.label}
              </Link>
            ))}
            <div className="lg:hidden">
              {NAV.map((n) => (<Link key={n.to} to={n.to} className="block rounded-lg px-3 py-2 text-sm">{n.label}</Link>))}
              {isAdmin && <Link to="/admin" className="block rounded-lg px-3 py-2 text-sm text-gold">Admin</Link>}
            </div>
          </nav>
          <div className="mt-auto rounded-xl bg-gradient-to-b from-accent to-transparent p-4">
            <BarChart3 className="h-8 w-8 text-primary" />
            <p className="mt-3 font-serif text-xl leading-snug text-primary">Advanced Financial Tools for Smarter Decisions</p>
            <p className="mt-2 text-xs text-muted-foreground">A complete suite of financial formulas, calculators and analytics.</p>
          </div>
        </aside>
        <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
