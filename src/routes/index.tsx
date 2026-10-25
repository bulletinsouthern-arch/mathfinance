import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Grid2X2, LineChart, ShieldCheck, Zap } from "lucide-react";
import hero from "@/assets/hero.jpg";
import { CATEGORIES, FORMULAS, formulasByCat } from "@/lib/formulas";
import { CAT_ICONS } from "@/components/category-icons";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Math & Finance Pro — 400+ Financial Formulas & Calculators" },
      { name: "description", content: "Professional-grade financial formulas, ratios, calculators and resources across 22 categories." },
      { property: "og:title", content: "Math & Finance Pro" },
      { property: "og:description", content: "Professional-grade financial formulas, ratios and calculators across 22 categories." },
    ],
  }),
  component: Home,
});

function Home() {
  const { data: heroText } = useQuery({
    queryKey: ["content", "hero"],
    queryFn: async () => (await supabase.from("site_content").select("title, body").eq("key", "hero").maybeSingle()).data,
  });
  const total = FORMULAS.length;
  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-2xl shadow-[var(--shadow-elegant)]">
        <img src={hero} alt="Misty green mountains beside a modern city" width={1920} height={640} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0" style={{ background: "var(--gradient-hero)" }} />
        <div className="relative grid gap-8 px-8 py-12 text-primary-foreground md:grid-cols-[1.4fr_1fr] md:px-12 md:py-16">
          <div>
            <p className="text-xs font-semibold tracking-[0.25em] opacity-90">FINANCIAL MATHEMATICS &amp; ANALYTICS</p>
            <h1 className="mt-4 max-w-xl text-4xl font-semibold leading-[1.05] md:text-5xl">
              {heroText?.title ?? "Everything You Need for Smarter Financial Decisions"}
            </h1>
            <p className="mt-5 max-w-xl text-sm opacity-90 md:text-base">{heroText?.body ?? `Explore ${total}+ formulas across 22 categories.`}</p>
            <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 text-sm">
              <span className="flex items-center gap-2"><LineChart className="h-4 w-4" />{total}+ Formulas</span>
              <span className="flex items-center gap-2"><Grid2X2 className="h-4 w-4" />22 Categories</span>
              <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Professional Grade</span>
              <span className="flex items-center gap-2"><Zap className="h-4 w-4" />Instant Calculations</span>
            </div>
          </div>
          <div className="hidden items-center justify-end md:flex">
            <blockquote className="font-serif text-2xl italic leading-snug">
              “Numbers tell the story.<br />We help you understand it.”
              <span className="mt-4 block h-0.5 w-16 bg-gold" />
            </blockquote>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-5 flex items-end justify-between">
          <h2 className="text-3xl font-semibold">Explore by Category</h2>
          <Link to="/formulas" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">View All Categories <ArrowRight className="h-4 w-4" /></Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {CATEGORIES.map((c) => {
            const list = formulasByCat(c.id);
            const Icon = CAT_ICONS[c.id];
            return (
              <Link key={c.id} to="/formulas" search={{ cat: c.id }} className="group flex flex-col rounded-xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[var(--shadow-elegant)]">
                <div className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Icon className="h-5 w-5" /></span>
                  <div>
                    <h3 className="font-sans text-sm font-semibold leading-snug">{c.id}. {c.name}</h3>
                    <p className="mt-1 text-xs text-primary/80">{list.length} formulas &amp; metrics</p>
                  </div>
                </div>
                <ul className="mt-4 flex-1 space-y-1 text-xs text-muted-foreground">
                  {list.slice(0, 5).map((f) => <li key={f.id} className="truncate">• {f.name}</li>)}
                  {list.length > 5 && <li>… and {list.length - 5} more</li>}
                </ul>
                <span className="mt-4 flex items-center gap-1 text-xs font-medium text-primary">View All <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" /></span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
