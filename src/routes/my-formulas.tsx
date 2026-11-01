import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Lock, Pencil, Plus, Save, Sparkles, Trash2, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { checkMyFormula, myFormulas, type MyFormula } from "@/lib/my-formulas.functions";
import { equationVars, evaluateEquation } from "@/lib/equation";
import { askMfp } from "@/lib/mfp-bus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/my-formulas")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "My Formulas — Math & Finance Pro" },
      { name: "description", content: "Create, check, color and save your own private formulas with custom scenarios." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyFormulasPage,
});

const SWATCHES = ["#1c6658", "#d4ad55", "#2563eb", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#0f766e"];
const DEFAULT_SCENARIOS = [
  { name: "Bear", change: -15 },
  { name: "Base", change: 0 },
  { name: "Bull", change: 15 },
];
type Check = { verdict: "correct" | "check" | "wrong"; feedback: string; suggestion: string };

const blank = (): MyFormula => ({
  id: crypto.randomUUID(),
  name: "Revenue",
  expression: "Price * Units_Sold",
  description: "",
  outputLabel: "Revenue",
  outputUnit: "₱",
  color: SWATCHES[0]!,
  inputs: { Price: "250", Units_Sold: "100" },
  scenarios: DEFAULT_SCENARIOS,
});

function calc(expr: string, vars: string[], vals: Record<string, string>) {
  try {
    const nums: Record<string, number> = {};
    for (const v of vars) {
      const n = Number(vals[v]?.trim() || NaN);
      if (!Number.isFinite(n)) return { value: null, error: `Enter a value for ${v.replace(/_/g, " ")}` };
      nums[v] = n;
    }
    const r = evaluateEquation(expr, nums);
    return Number.isFinite(r) ? { value: r, error: "" } : { value: null, error: "Result is not a number (check for divide by zero)" };
  } catch (e) {
    return { value: null, error: (e as Error).message };
  }
}

const fmt = (v: number | null, unit: string) =>
  v === null ? "—" : `${unit === "₱" ? "₱" : ""}${v.toLocaleString(undefined, { maximumFractionDigits: 4 })}${unit === "%" ? "%" : ""}`;

function MyFormulasPage() {
  const { session, loading } = useAuth();
  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!session)
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-8 text-center">
        <Lock className="mx-auto h-8 w-8 text-primary" />
        <h1 className="mt-3 text-3xl font-bold">My Formulas</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to create, check and save your own private formulas. Only you can see the formulas you make.
        </p>
        <Button asChild className="mt-5">
          <Link to="/auth" search={{ redirect: "/my-formulas" }}>Sign in</Link>
        </Button>
      </div>
    );
  return <Builder />;
}

function Builder() {
  const qc = useQueryClient();
  const run = useServerFn(myFormulas);
  const check = useServerFn(checkMyFormula);
  const { data: saved = [], isLoading } = useQuery({
    queryKey: ["my-formulas"],
    queryFn: () => run({ data: { action: "load" } }),
  });
  const [form, setForm] = useState<MyFormula>(blank);
  const [busy, setBusy] = useState(false);
  const [autoCheck, setAutoCheck] = useState(true);
  const [checking, setChecking] = useState(false);
  const [review, setReview] = useState<(Check & { expr: string }) | null>(null);
  const latest = useRef(form.expression);
  latest.current = form.expression;
  const set = <K extends keyof MyFormula>(k: K, v: MyFormula[K]) => setForm((f) => ({ ...f, [k]: v }));

  const vars = useMemo(() => equationVars(form.expression), [form.expression]);
  const result = calc(form.expression, vars, form.inputs);
  const isSaved = saved.some((s) => s.id === form.id);

  async function runCheck() {
    const expr = form.expression;
    if (!expr.trim()) return;
    setChecking(true);
    try {
      const r = await check({
        data: { name: form.name, expression: expr, description: form.description, outputLabel: form.outputLabel },
      });
      if (latest.current === expr) setReview({ ...r, expr });
    } catch {
      if (latest.current === expr) toast.error("The AI could not check this formula right now. Try again in a moment.");
    } finally {
      setChecking(false);
    }
  }
  const lastChecked = useRef("");
  useEffect(() => {
    const key = `${form.name}|${form.expression}|${form.outputLabel}`;
    if (!autoCheck || !form.expression.trim() || lastChecked.current === key) return;
    try {
      evaluateEquation(form.expression, Object.fromEntries(vars.map((k) => [k, 1])));
    } catch {
      return;
    }
    const t = setTimeout(() => {
      lastChecked.current = key;
      void runCheck();
    }, 1600);
    return () => clearTimeout(t);
  }, [form.name, form.expression, form.outputLabel, autoCheck]);

  async function save() {
    if (!form.name.trim() || !form.expression.trim()) return void toast.error("Name and formula are required");
    try {
      evaluateEquation(form.expression, Object.fromEntries(vars.map((k) => [k, 1])));
    } catch (e) {
      return void toast.error("Formula problem: " + (e as Error).message);
    }
    if (!form.scenarios.length) return void toast.error("Add at least one scenario");
    setBusy(true);
    try {
      const inputs = Object.fromEntries(vars.map((k) => [k, form.inputs[k] ?? ""]));
      await run({ data: { action: "save", formula: { ...form, inputs } } });
      toast.success(isSaved ? "Formula updated" : "Formula saved to My Formulas");
      await qc.invalidateQueries({ queryKey: ["my-formulas"] });
    } catch (e) {
      toast.error((e as Error).message.includes("up to") ? (e as Error).message : "Could not save formula");
    } finally {
      setBusy(false);
    }
  }
  async function remove(f: MyFormula) {
    if (!confirm(`Delete "${f.name}"? This cannot be undone.`)) return;
    try {
      await run({ data: { action: "delete", id: f.id } });
      toast.success("Formula deleted");
      if (f.id === form.id) setForm(blank());
      await qc.invalidateQueries({ queryKey: ["my-formulas"] });
    } catch {
      toast.error("Could not delete formula");
    }
  }
  function edit(f: MyFormula) {
    setForm(f);
    setReview(null);
    lastChecked.current = `${f.name}|${f.expression}|${f.outputLabel}`;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const setScenario = (i: number, patch: Partial<MyFormula["scenarios"][number]>) =>
    set("scenarios", form.scenarios.map((s, k) => (k === i ? { ...s, ...patch } : s)));

  const scenarios = form.scenarios.map((s) => {
    const scaled = Object.fromEntries(
      vars.map((k) => {
        const n = Number(form.inputs[k]);
        return [k, Number.isFinite(n) && form.inputs[k]?.trim() ? String(n * (1 + s.change / 100)) : ""];
      }),
    );
    return { ...s, scaled, r: calc(form.expression, vars, scaled).value };
  });
  const showReview = review && review.expr === form.expression;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="text-xs font-bold tracking-[0.2em]" style={{ color: form.color }}>MY FORMULAS · PRIVATE</p>
        <h1 className="mt-1 text-4xl font-bold">Create your own formula</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Write a formula with names for the boxes you fill in (use _ instead of spaces), pick a color and name your own
          scenarios. The AI checks whether your formula is right. Only you can see your saved formulas.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <section className="space-y-4 rounded-2xl border-2 bg-card p-6" style={{ borderColor: form.color }}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl font-bold">{isSaved ? "Edit formula" : "New formula"}</h2>
            {isSaved && (
              <Button size="sm" variant="outline" onClick={() => { setForm(blank()); setReview(null); }}>
                <Plus className="mr-1 h-4 w-4" />New formula
              </Button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs uppercase tracking-wider">Formula name</Label>
              <Input className="mt-1 font-bold" maxLength={100} value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider">Output name</Label>
              <div className="mt-1 flex gap-2">
                <Input maxLength={60} value={form.outputLabel} onChange={(e) => set("outputLabel", e.target.value)} />
                <select
                  aria-label="Output unit"
                  className="rounded-md border border-input bg-background px-2 text-sm"
                  value={form.outputUnit}
                  onChange={(e) => set("outputUnit", e.target.value as MyFormula["outputUnit"])}
                >
                  <option value="">Number</option>
                  <option value="₱">₱ Peso</option>
                  <option value="%">%</option>
                </select>
              </div>
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider">Formula</Label>
            <Input
              className="mt-1 font-mono"
              maxLength={500}
              placeholder="Price * Units_Sold"
              value={form.expression}
              onChange={(e) => set("expression", e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Allowed: + − * / ^ % ( ) and sqrt, abs, ln, log, exp, min, max, round.
            </p>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider">What it calculates (optional)</Label>
            <Textarea className="mt-1" maxLength={2000} rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </div>

          <div className="rounded-xl border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={autoCheck} onChange={(e) => setAutoCheck(e.target.checked)} />
                Check my formula automatically with Ollama AI
              </label>
              <Button size="sm" variant="outline" disabled={checking || !form.expression.trim()} onClick={runCheck}>
                <Sparkles className="mr-1 h-4 w-4" />
                {checking ? "Checking…" : "Check now"}
              </Button>
            </div>
            {showReview && (
              <div
                className={`mt-3 rounded-lg p-3 text-sm ${review.verdict === "correct" ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" : review.verdict === "wrong" ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-800 dark:text-amber-300"}`}
              >
                <p className="flex items-center gap-1.5 font-bold">
                  {review.verdict === "correct" ? <CheckCircle2 className="h-4 w-4" /> : review.verdict === "wrong" ? <XCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                  {review.verdict === "correct" ? "Looks correct" : review.verdict === "wrong" ? "This formula looks wrong" : "Double-check this formula"}
                </p>
                <p className="mt-1 whitespace-pre-line">{review.feedback}</p>
                {review.suggestion && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded bg-background px-2 py-1 font-mono text-xs text-foreground">{review.suggestion}</span>
                    <Button size="sm" variant="outline" onClick={() => set("expression", review.suggestion)}>Use suggestion</Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wider">Color</Label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  aria-label={`Color ${c}`}
                  onClick={() => set("color", c)}
                  className={`h-8 w-8 rounded-full border-2 ${form.color === c ? "border-foreground" : "border-transparent"}`}
                  style={{ background: c }}
                />
              ))}
              <input
                type="color"
                aria-label="Custom color"
                value={form.color}
                onChange={(e) => set("color", e.target.value)}
                className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wider">Inputs</Label>
            {vars.length ? (
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {vars.map((v) => (
                  <div key={v}>
                    <Label className="text-xs text-muted-foreground">{v.replace(/_/g, " ")}</Label>
                    <Input
                      className="mt-1"
                      inputMode="decimal"
                      value={form.inputs[v] ?? ""}
                      onChange={(e) => set("inputs", { ...form.inputs, [v]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Type a formula with names to get input boxes.</p>
            )}
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wider">My scenarios</Label>
            <p className="text-xs text-muted-foreground">Name each scenario and choose how much every input changes.</p>
            <div className="mt-2 space-y-2">
              {form.scenarios.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input aria-label="Scenario name" maxLength={40} value={s.name} onChange={(e) => setScenario(i, { name: e.target.value })} />
                  <div className="relative w-28 shrink-0">
                    <Input
                      aria-label="Change in percent"
                      type="number"
                      className="pr-7"
                      value={Number.isFinite(s.change) ? s.change : ""}
                      onChange={(e) => setScenario(i, { change: Math.max(-100, Math.min(1000, Number(e.target.value) || 0)) })}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                  </div>
                  <Button size="icon" variant="ghost" aria-label={`Remove ${s.name}`} onClick={() => set("scenarios", form.scenarios.filter((_, k) => k !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {form.scenarios.length < 8 && (
                <Button size="sm" variant="outline" onClick={() => set("scenarios", [...form.scenarios, { name: `Scenario ${form.scenarios.length + 1}`, change: 0 }])}>
                  <Plus className="mr-1 h-4 w-4" />Add scenario
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={save} style={{ background: form.color }} className="text-white hover:opacity-90">
              <Save className="mr-1.5 h-4 w-4" />
              {busy ? "Saving…" : isSaved ? "Save changes" : "Save to My Formulas"}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                askMfp(`Please explain my formula "${form.name}": ${form.outputLabel} = ${form.expression}. Inputs: ${vars.map((v) => `${v}=${form.inputs[v] ?? "?"}`).join(", ")}. Output: ${fmt(result.value, form.outputUnit)}.`)
              }
            >
              <Sparkles className="mr-1.5 h-4 w-4" />Ask MFP
            </Button>
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl p-8 text-white shadow-[var(--shadow-elegant)]" style={{ background: form.color }}>
            <p className="text-xs uppercase tracking-[0.2em] opacity-80">Output · {form.outputLabel || "Result"}</p>
            <p className="mt-3 break-words font-serif text-5xl font-bold">{fmt(result.value, form.outputUnit)}</p>
            {result.error && <p className="mt-3 text-sm opacity-85">{result.error}</p>}
            <div className="mt-5 border-t border-white/25 pt-3 text-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] opacity-75">Inputs</p>
              <ul className="mt-1 space-y-1">
                {vars.map((v) => (
                  <li key={v} className="flex justify-between gap-2">
                    <span className="opacity-85">{v.replace(/_/g, " ")}</span>
                    <span className="font-bold tabular-nums">{form.inputs[v] || "—"}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 font-mono text-xs opacity-90">{form.outputLabel || "Result"} = {form.expression}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-xl font-bold">My saved formulas ({saved.length})</h2>
            <p className="text-xs text-muted-foreground">Private to your account.</p>
            <div className="mt-3 space-y-2">
              {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {!isLoading && !saved.length && <p className="text-sm text-muted-foreground">Nothing saved yet.</p>}
              {saved.map((f) => (
                <div
                  key={f.id}
                  className={`flex items-center gap-2 rounded-lg border border-l-4 p-3 ${f.id === form.id ? "bg-accent" : ""}`}
                  style={{ borderLeftColor: f.color }}
                >
                  <button className="min-w-0 flex-1 text-left" onClick={() => edit(f)}>
                    <p className="truncate text-sm font-bold">{f.name}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">{f.outputLabel} = {f.expression}</p>
                  </button>
                  <Button size="icon" variant="ghost" aria-label={`Edit ${f.name}`} onClick={() => edit(f)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={`Delete ${f.name}`} onClick={() => remove(f)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {scenarios.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: form.color }}>Scenario analysis</p>
          <h2 className="mb-1 font-serif text-2xl font-bold">{scenarios.map((s) => s.name || "Untitled").join(" · ")}</h2>
          <p className="mb-4 text-sm text-muted-foreground">Each scenario changes every input by its percentage and shows the inputs and the output.</p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {scenarios.map((s, i) => (
              <div
                key={i}
                className="rounded-xl border-2 p-5"
                style={s.change === 0 ? { background: form.color, borderColor: form.color, color: "white" } : { borderColor: form.color }}
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] opacity-80">{s.name || "Untitled"}</p>
                <p className="mt-1 text-[11px] opacity-70">{s.change === 0 ? "Your current inputs" : `Inputs ${s.change > 0 ? "+" : ""}${s.change}%`}</p>
                <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.15em] opacity-70">Inputs</p>
                <ul className="mt-1 space-y-1 text-sm">
                  {vars.map((v) => (
                    <li key={v} className="flex justify-between gap-2 border-b border-current/10 pb-1">
                      <span className="opacity-85">{v.replace(/_/g, " ")}</span>
                      <span className="font-bold tabular-nums">
                        {s.scaled[v] ? Number(s.scaled[v]).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.15em] opacity-70">Output · {form.outputLabel || "Result"}</p>
                <p className="mt-1 break-words font-serif text-2xl font-bold">{fmt(s.r, form.outputUnit)}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
