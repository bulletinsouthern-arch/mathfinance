import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, RotateCcw, Star } from "lucide-react";
import { CATEGORIES, compute, formatResult, formulasByCat, getFormula } from "@/lib/formulas";
import { getFavorites, pushRecent, toggleFavorite } from "@/lib/favorites";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/formulas/$id")({
  loader: ({ params }) => {
    const f = getFormula(params.id);
    if (!f) throw notFound();
    return { name: f.name, expr: f.expr };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.name} Calculator — Math & Finance Pro` },
          { name: "description", content: `${loaderData.name}: ${loaderData.expr}. Calculate it instantly.` },
          { property: "og:title", content: `${loaderData.name} Calculator` },
          { property: "og:description", content: loaderData.expr },
        ]
      : [{ title: "Formula not found" }, { name: "robots", content: "noindex" }],
  }),
  component: FormulaDetail,
});

function FormulaDetail() {
  const { id } = Route.useParams();
  const f = getFormula(id)!;
  const defaults = () => Object.fromEntries(f.inputs.map((i) => [i.key, String(i.def)]));
  const [vals, setVals] = useState<Record<string, string>>(defaults);
  const [fav, setFav] = useState(false);
  useEffect(() => { setVals(defaults()); pushRecent(id); setFav(getFavorites().includes(id)); }, [id]);
  const result = useMemo(() => compute(f, vals), [f, vals]);
  const related = formulasByCat(f.cat).filter((x) => x.id !== f.id).slice(0, 8);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link to="/formulas" search={{ cat: f.cat }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4" />{CATEGORIES[f.cat - 1].name}</Link>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold">{f.name}</h1>
          <p className="mt-3 inline-block rounded-lg bg-accent px-3 py-2 font-mono text-sm text-accent-foreground">{f.expr}</p>
        </div>
        <Button variant="outline" size="icon" onClick={() => { toggleFavorite(id); setFav(!fav); }} aria-label="Favorite">
          <Star className={`h-4 w-4 ${fav ? "fill-gold text-gold" : ""}`} />
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-[1.3fr_1fr]">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Inputs</h2>
            <Button variant="ghost" size="sm" onClick={() => setVals(defaults())}><RotateCcw className="mr-1 h-3.5 w-3.5" />Reset example</Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {f.inputs.map((i) => (
              <div key={i.key} className={i.list ? "sm:col-span-2" : ""}>
                <Label className="text-xs text-muted-foreground">{i.label}</Label>
                <Input className="mt-1" inputMode="decimal" value={vals[i.key] ?? ""} onChange={(e) => setVals({ ...vals, [i.key]: e.target.value })} />
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col justify-center rounded-2xl bg-primary p-8 text-primary-foreground shadow-[var(--shadow-elegant)]">
          <p className="text-xs tracking-[0.2em] opacity-80">RESULT</p>
          <p className="mt-3 break-words font-serif text-5xl font-semibold">{formatResult(result, f.unit)}</p>
          <p className="mt-4 text-sm opacity-80">Results update instantly as you type. Percent inputs are entered as whole numbers (e.g. 8 for 8%).</p>
        </div>
      </div>

      {related.length > 0 && (
        <div>
          <h2 className="mb-3 text-2xl font-semibold">Related formulas</h2>
          <div className="flex flex-wrap gap-2">
            {related.map((r) => <Link key={r.id} to="/formulas/$id" params={{ id: r.id }} className="rounded-full border border-border bg-card px-3 py-1.5 text-xs hover:border-primary hover:text-primary">{r.name}</Link>)}
          </div>
        </div>
      )}
    </div>
  );
}
