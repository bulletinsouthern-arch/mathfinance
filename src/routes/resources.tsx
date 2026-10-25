import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Lightbulb, Scale, TrendingUp } from "lucide-react";
import { CATEGORIES, formulasByCat } from "@/lib/formulas";

export const Route = createFileRoute("/resources")({
  head: () => ({
    meta: [
      { title: "Finance Resources & Formula Guide — Math & Finance Pro" },
      { name: "description", content: "Guides, benchmarks and a complete formula reference for analysts and business owners." },
      { property: "og:title", content: "Finance Resources — Math & Finance Pro" },
      { property: "og:description", content: "Guides, benchmarks and a complete formula reference." },
    ],
  }),
  component: Resources,
});

const GUIDES = [
  { icon: TrendingUp, title: "Reading an income statement", body: "Start at revenue, subtract the cost of what you sold to get gross profit, then operating costs to get EBIT. Interest and taxes bring you to net income — the bottom line owners keep." },
  { icon: Scale, title: "Healthy ratio benchmarks", body: "Current ratio 1.5–2.0×, interest coverage above 3×, debt-to-EBITDA under 3×, CLV-to-CAC above 3×. Benchmarks vary by industry — compare against peers." },
  { icon: Lightbulb, title: "Valuing a project", body: "Discount every future cash flow at your WACC. Positive NPV creates value; IRR above WACC confirms it. Check payback for liquidity risk." },
  { icon: BookOpen, title: "Growing your income", body: "Raise price or volume, lower COGS through supplier terms, trim OPEX lines that don't drive revenue, and shorten your cash conversion cycle to free up cash." },
];

function Resources() {
  return (
    <div className="space-y-10">
      <div>
        <p className="text-xs font-semibold tracking-[0.2em] text-primary">RESOURCES</p>
        <h1 className="mt-1 text-4xl font-semibold">Guides &amp; Formula Reference</h1>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {GUIDES.map((g) => (
          <div key={g.title} className="rounded-2xl border border-border bg-card p-6">
            <g.icon className="h-6 w-6 text-primary" />
            <h2 className="mt-3 text-2xl font-semibold">{g.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{g.body}</p>
          </div>
        ))}
      </div>
      <div className="space-y-8">
        <h2 className="text-3xl font-semibold">Complete formula reference</h2>
        {CATEGORIES.map((c) => (
          <section key={c.id}>
            <h3 className="border-b border-border pb-2 text-xl font-semibold">{c.id}. {c.name}</h3>
            <div className="mt-2 divide-y divide-border">
              {formulasByCat(c.id).map((f) => (
                <Link key={f.id} to="/formulas/$id" params={{ id: f.id }} className="grid gap-1 py-2 text-sm hover:text-primary md:grid-cols-[1fr_1.4fr]">
                  <span className="font-medium">{f.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{f.expr}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
