import { EquationPie } from "@/components/EquationPie";
import { interpretEquation } from "@/lib/authoring.functions";
import { toast } from "sonner";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import { z } from "zod";
import { Save, Sigma, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { equationVars, evaluateEquation } from "@/lib/equation";
import { askMfp } from "@/lib/mfp-bus";

type Saved = { id: string; name: string; expr: string; vals: Record<string, string> };
const STORE = "mfp-equations";

export const Route = createFileRoute("/equations")({
  validateSearch: (s) =>
    z.object({ expr: z.string().optional(), name: z.string().optional() }).parse(s),
  head: () => ({
    meta: [
      { title: "My Own Equations — Math & Finance Pro" },
      {
        name: "description",
        content:
          "Write your own mathematics, science, business and finance equations, enter values and calculate instantly.",
      },
      { property: "og:title", content: "My Own Equations — Math & Finance Pro" },
      { property: "og:description", content: "Build and save custom business equations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EquationsPage,
});

function EquationsPage() {
  const search = Route.useSearch();
  const [name, setName] = useState(search.name ?? "My equation");
  const [expr, setExpr] = useState(search.expr ?? "(Revenue - Expenses) / Units");
  const [vals, setVals] = useState<Record<string, string>>({});
  const lastRead = useRef("");
  const latestExpr = useRef(expr);
  latestExpr.current = expr;
  const [automatic, setAutomatic] = useState(true);
  const [reading, setReading] = useState(false);
  const [explanation, setExplanation] = useState("");
  async function readEquation() {
    const source = expr;
    lastRead.current = source;
    setReading(true);
    try {
      const r = await interpretEquation({ data: { text: source } });
      if (latestExpr.current !== source) return;
      setExplanation(r.description);
      if (r.expression) {
        lastRead.current = r.expression;
        setExpr(r.expression);
        setName(r.name);
      }
    } catch {
      if (latestExpr.current === source)
        toast.error("Could not read the equation. Check AI settings and try again.");
    } finally {
      setReading(false);
    }
  }
  useEffect(() => {
    if (!automatic || !expr.trim() || lastRead.current === expr) return;
    const timer = setTimeout(() => {
      void readEquation();
    }, 1400);
    return () => clearTimeout(timer);
  }, [expr, automatic]);

  const [saved, setSaved] = useState<Saved[]>([]);
  useEffect(() => {
    try {
      setSaved(JSON.parse(localStorage.getItem(STORE) || "[]"));
    } catch {
      /* ignore */
    }
  }, []);
  const persist = (n: Saved[]) => {
    setSaved(n);
    localStorage.setItem(STORE, JSON.stringify(n));
  };

  const vars = useMemo(() => equationVars(expr), [expr]);
  const { result, error } = useMemo(() => {
    try {
      const nums: Record<string, number> = {};
      for (const v of vars) {
        const raw = vals[v]?.trim() ?? "";
        const n = raw ? Number(raw) : NaN;
        if (!Number.isFinite(n))
          return { result: null, error: `Enter a value for ${v.replace(/_/g, " ")}` };
        nums[v] = n;
      }
      const r = evaluateEquation(expr, nums);
      return {
        result: Number.isFinite(r) ? r : null,
        error: Number.isFinite(r) ? "" : "Result is not a number (check for divide by zero)",
      };
    } catch (e) {
      return { result: null, error: (e as Error).message };
    }
  }, [expr, vals, vars]);

  function save() {
    const item: Saved = { id: crypto.randomUUID(), name: name.trim() || "My equation", expr, vals };
    persist([item, ...saved.filter((s) => s.name !== item.name)]);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="text-xs font-bold tracking-[0.2em] text-primary">EQUATION BUILDER</p>
        <h1 className="mt-1 text-4xl font-bold">Make your own equation</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Type any formula using names and + − × ÷ ^ ( ). Example:{" "}
          <span className="font-mono">NOPAT - Capital * WACC</span>. Use _ instead of spaces in
          names. Functions: sqrt, abs, ln, log, exp, min, max, round, sin, cos, tan (angles in
          radians). Paste other notation and choose Read with Ollama to interpret it.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-[1.3fr_1fr]">
        <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <div>
            <Label className="text-xs uppercase tracking-wider">Name</Label>
            <Input
              className="mt-1 font-bold"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={automatic}
              onChange={(e) => setAutomatic(e.target.checked)}
            />{" "}
            Automatically read equations with Ollama
          </label>
          <div>
            <Label className="text-xs uppercase tracking-wider">Equation</Label>
            <Input
              className="mt-1 font-mono"
              value={expr}
              onChange={(e) => setExpr(e.target.value)}
            />
          </div>
          {vars.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {vars.map((v) => (
                <div key={v}>
                  <Label className="text-xs text-muted-foreground">{v.replace(/_/g, " ")}</Label>
                  <Input
                    className="mt-1"
                    inputMode="decimal"
                    value={vals[v] ?? ""}
                    onChange={(e) => setVals({ ...vals, [v]: e.target.value })}
                  />
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={reading || !expr.trim()} onClick={readEquation}>
              {reading ? "Reading equation…" : "Read with Ollama"}
            </Button>
            <Button onClick={save}>
              <Save className="mr-1.5 h-4 w-4" />
              Save equation
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                askMfp(
                  `Please explain my equation "${name}": ${expr}. Values: ${vars.map((v) => `${v}=${vals[v] ?? "?"}`).join(", ")}. Result: ${result ?? "n/a"}.`,
                )
              }
            >
              <Sparkles className="mr-1.5 h-4 w-4" />
              Ask MFP
            </Button>
          </div>
        </div>
        <div className="flex flex-col justify-center rounded-2xl bg-primary p-8 text-primary-foreground shadow-[var(--shadow-elegant)]">
          <p className="text-xs tracking-[0.2em] opacity-80">RESULT</p>
          <p className="mt-3 break-words font-serif text-5xl font-bold">
            {result === null ? "—" : result.toLocaleString(undefined, { maximumFractionDigits: 4 })}
          </p>
          {error && <p className="mt-4 text-sm opacity-80">{error}</p>}
        </div>
      </div>
      {explanation && (
        <p className="whitespace-pre-line rounded-xl border bg-card p-5 text-sm">{explanation}</p>
      )}
      <EquationPie values={Object.fromEntries(vars.map((k) => [k, vals[k] ?? " "]))} />
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Sigma className="h-5 w-5 text-primary" />
          My saved equations
        </h2>
        {saved.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Nothing saved yet.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {saved.map((s) => (
              <div
                key={s.id}
                className="flex items-start justify-between gap-2 rounded-xl border border-border p-4"
              >
                <button
                  className="min-w-0 text-left"
                  onClick={() => {
                    setName(s.name);
                    setExpr(s.expr);
                    setVals(s.vals);
                  }}
                >
                  <p className="font-bold hover:text-primary">{s.name}</p>
                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{s.expr}</p>
                </button>
                <button
                  aria-label={`Delete ${s.name}`}
                  onClick={() => persist(saved.filter((x) => x.id !== s.id))}
                  className="rounded-md p-1.5 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
