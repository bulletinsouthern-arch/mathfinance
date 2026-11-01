import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Check, ChevronRight, FolderPlus, Info, Lock, Palette, Pencil, PieChart as PieIcon, Plus, RotateCcw, Save, Sparkles, Trash2, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { checkMyFormula, MAX_PIES, myCategories, myFormulas, type MyCategory, type MyFormula } from "@/lib/my-formulas.functions";
import { equationVars, evaluateEquation } from "@/lib/equation";
import { askMfp } from "@/lib/mfp-bus";
import { ringSlices, splitLast, splitTerms, totalPool, type PieMode } from "@/lib/pie-shares";
import { formulaSentence, sentenceText } from "@/lib/formula-sentence";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip as Hint, TooltipContent as HintContent, TooltipProvider as HintProvider, TooltipTrigger as HintTrigger } from "@/components/ui/tooltip";

type Kind = "" | "₱" | "%";
type FPie = MyFormula["pies"][number];
type Unit = { label: string; color: string; kind: Kind };
type Review = { verdict: "correct" | "check" | "wrong"; feedback: string; suggestion: string; expr: string };

const SWATCHES = ["#1c6658", "#d4ad55", "#2563eb", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#0f766e"];
const UNIT_COLORS = ["#1c5a46", "#d4ad55", "#dc2626", "#2563eb", "#7c3aed", "#ea580c", "#0f766e", "#db2777"];
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Private formulas of the signed-in student, shared by the sidebar and the workspace. */
export function useMyFormulas() {
  const { session } = useAuth();
  const run = useServerFn(myFormulas);
  return useQuery({
    queryKey: ["my-formulas", session?.user.id],
    enabled: !!session,
    queryFn: () => run({ data: { action: "load" } }),
  });
}

/** The student's own categories for grouping their formulas. */
export function useMyCategories() {
  const { session } = useAuth();
  const run = useServerFn(myCategories);
  return useQuery({
    queryKey: ["my-formula-categories", session?.user.id],
    enabled: !!session,
    queryFn: () => run({ data: { action: "load" } }),
  });
}

/** Creates a category and returns it, or null if the student cancelled. */
function useCreateCategory() {
  const qc = useQueryClient();
  const run = useServerFn(myCategories);
  return async (): Promise<MyCategory | null> => {
    const name = prompt("Name your new category")?.trim().slice(0, 60);
    if (!name) return null;
    const cat = { id: crypto.randomUUID(), name };
    try {
      await run({ data: { action: "save", ...cat } });
      await qc.invalidateQueries({ queryKey: ["my-formula-categories"] });
      toast.success(`Category "${name}" created`);
      return cat;
    } catch (e) {
      toast.error((e as Error).message.includes("up to") ? (e as Error).message : "Could not create category");
      return null;
    }
  };
}

export const blankFormula = (categoryId: string | null = null): MyFormula => ({
  id: crypto.randomUUID(),
  name: "Revenue",
  categoryId,
  description: "",
  color: SWATCHES[0]!,
  inputs: { Price: "50", Units_Sold: "10000" },
  units: {
    Price: { label: "Price per Unit", color: UNIT_COLORS[0]!, kind: "₱" },
    Units_Sold: { label: "Units Sold", color: UNIT_COLORS[1]!, kind: "" },
  },
  pies: [{ title: "Input composition", expression: "Price * Units_Sold", outputLabel: "Revenue", outputUnit: "₱" }],
  scenarioTitle: "",
  scenarios: [
    { name: "Bear case", change: -15 },
    { name: "Base case", change: 0 },
    { name: "Bull case", change: 15 },
  ],
});

const pretty = (k: string) => k.replace(/_/g, " ");
const pretty_expr = (e: string) => e.replace(/\*/g, "×").replace(/_/g, " ");
const toName = (s: string) => {
  const n = s.trim().replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return /^[0-9]/.test(n) ? `N_${n}` : n;
};
const wordRe = (k: string) => new RegExp(`(?<![A-Za-z0-9_])${k}(?![A-Za-z0-9_])`, "g");

/** Matches the sign just before a unit name, e.g. the "+" in "Price + Units_Sold". */
const opRe = (k: string) => new RegExp(`([-+*/])(\\s*)(?=(?<![A-Za-z0-9_])${k}(?![A-Za-z0-9_]))`);
const OPS: [string, string][] = [["+", "+"], ["-", "−"], ["*", "×"], ["/", "÷"]];

function valid(expr: string) {
  try {
    evaluateEquation(expr, Object.fromEntries(equationVars(expr).map((k) => [k, 1])));
    return true;
  } catch {
    return false;
  }
}

/** Blank boxes count as 0 so a freshly added unit does not break the result. */
function calc(expr: string, vals: Record<string, string>) {
  try {
    const nums: Record<string, number> = {};
    for (const v of equationVars(expr)) {
      const raw = vals[v]?.trim() ?? "";
      const n = raw === "" ? 0 : Number(raw.replace(/,/g, ""));
      if (!Number.isFinite(n)) return { value: null, error: `${pretty(v)} must be a number` };
      nums[v] = n;
    }
    const r = evaluateEquation(expr, nums);
    return Number.isFinite(r) ? { value: r, error: "" } : { value: null, error: "Result is not a number (check for divide by zero)" };
  } catch (e) {
    return { value: null, error: (e as Error).message };
  }
}

/** Shows typed numbers with thousands commas (1000 → 1,000); the stored value stays plain. */
const withCommas = (v: string) => v.replace(/^(-?)(\d+)/, (_, sign: string, d: string) => sign + d.replace(/\B(?=(\d{3})+(?!\d))/g, ","));

const PIE_MODES: { id: PieMode; label: string; hint: string }[] = [
  { id: "raw", label: "Raw Input Share", hint: "Applies the chosen signs straight to the typed boxes (Price × Units Sold − Debt = 498,000) and shows each box as its value ÷ that Total Pool Base." },
  { id: "financial", label: "Financial Reality (vs Revenue)", hint: "Works out Gross Revenue (Price × Units Sold) first, then joins Debt with its sign: ₱500,000 − ₱2,000 = ₱498,000 Total Pool Base. Each share is the item ÷ that base, so the ₱2,000 debt is 0.4%." },
];

const pctLabel = (p: number) => `${p.toFixed(p && p < 1 ? 2 : 1)}%`;
const fmt = (v: number | null, unit: string) =>
  v === null ? "—" : `${unit === "₱" ? "₱" : ""}${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}${unit === "%" ? "%" : ""}`;

export function FormulaWorkspace({ id, newIn }: { id?: string | undefined; newIn?: string | undefined }) {
  const { session, loading } = useAuth();
  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!session)
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-8 text-center">
        <Lock className="mx-auto h-8 w-8 text-primary" />
        <h1 className="mt-3 text-3xl font-bold">Your private formulas</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to create, check and save your own formulas with business pies and scenarios. Only you can see the formulas you make.
        </p>
        <Button asChild className="mt-5">
          <Link to="/auth" search={{ redirect: "/formulas" }}>Sign in</Link>
        </Button>
      </div>
    );
  return <Workspace id={id} newIn={newIn} />;
}

/** Small pencil that matches the unit color, as used across the editor. */
function Pen({ color, label, onClick, className = "" }: { color?: string | undefined; label: string; onClick: () => void; className?: string }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={`rounded p-1 transition hover:bg-accent ${className}`}>
      <Pencil className="h-4 w-4" style={{ color: color ?? "#dc2626" }} />
    </button>
  );
}

function Workspace({ id, newIn }: { id?: string | undefined; newIn?: string | undefined }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const run = useServerFn(myFormulas);
  const { data: saved = [], isLoading } = useMyFormulas();
  const { data: categories = [] } = useMyCategories();
  const createCategory = useCreateCategory();
  const [form, setForm] = useState<MyFormula>(blankFormula);
  const [busy, setBusy] = useState(false);
  const [autoCheck, setAutoCheck] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [showColors, setShowColors] = useState(false);
  const [autoSave, setAutoSave] = useState(0);
  const set = <K extends keyof MyFormula>(k: K, v: MyFormula[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!id) return;
    if (form.id === id) return;
    const f = saved.find((s) => s.id === id);
    if (f) { setForm(f); setEditing(null); }
    else if (!isLoading) void navigate({ to: "/formulas", search: {}, replace: true });
  }, [id, saved, isLoading]);

  // "New formula" inside a sidebar category starts a blank formula in that category.
  useEffect(() => {
    if (!newIn) return;
    setForm(blankFormula(newIn === "none" ? null : newIn));
    setEditing(null);
    void navigate({ to: "/formulas", search: {}, replace: true });
  }, [newIn]);

  // "Done" buttons close the editor and save straight away (after the edit has landed in state).
  const done = () => { setEditing(null); setAutoSave((n) => n + 1); };
  useEffect(() => {
    if (autoSave && dirty && !busy) void save(true);
  }, [autoSave]);

  const savedVersion = saved.find((s) => s.id === form.id);
  const isSaved = !!savedVersion;
  const dirty = !savedVersion || JSON.stringify(savedVersion) !== JSON.stringify(form);

  const unit = (k: string, i = 0): Unit => form.units[k] ?? { label: pretty(k), color: UNIT_COLORS[i % UNIT_COLORS.length]!, kind: "" };
  const setUnit = (k: string, patch: Partial<Unit>) => setForm((f) => ({ ...f, units: { ...f.units, [k]: { ...(f.units[k] ?? { label: pretty(k), color: UNIT_COLORS[0]!, kind: "" as Kind }), ...patch } } }));
  const setPie = (i: number, patch: Partial<FPie>) => setForm((f) => ({ ...f, pies: f.pies.map((p, k) => (k === i ? { ...p, ...patch } : p)) }));
  const allVars = useMemo(() => [...new Set(form.pies.flatMap((p) => equationVars(p.expression)))], [form.pies]);

  function newFormula() {
    setForm(blankFormula(form.categoryId));
    setEditing(null);
    void navigate({ to: "/formulas", search: {} });
  }

  async function save(auto = false) {
    // Auto-saves wait quietly until the formula is complete; Save explains what is missing.
    const warn = (m: string) => void (auto || toast.error(m));
    if (!form.name.trim()) return warn("Give your formula a name");
    const bad = form.pies.findIndex((p) => !valid(p.expression));
    if (bad >= 0) return warn(`Fix the formula in ${form.pies[bad]!.title || `pie ${bad + 1}`} before saving`);
    if (!form.scenarios.length) return warn("Add at least one scenario");
    setBusy(true);
    try {
      const keep = (r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).filter(([k]) => allVars.includes(k)));
      // Tidy the data first so the server never rejects it over a blank or overlong field.
      const clean: MyFormula = {
        ...form,
        name: form.name.trim().slice(0, 100),
        inputs: Object.fromEntries(allVars.map((k) => [k, (form.inputs[k] ?? "").slice(0, 40)])),
        units: Object.fromEntries(Object.entries(keep(form.units) as MyFormula["units"]).map(([k, u]) => [k, { ...u, label: u.label.trim().slice(0, 60) }])),
        pies: form.pies.map((p) => ({ ...p, title: p.title.trim().slice(0, 80), outputLabel: p.outputLabel.trim().slice(0, 60) })),
        scenarios: form.scenarios.map((c, i) => ({ ...c, name: c.name.trim().slice(0, 40) || `Case ${i + 1}` })),
      };
      try {
        await run({ data: { action: "save", formula: clean } });
      } catch (e) {
        if ((e as Error).message.includes("up to")) throw e;
        // One quiet retry covers a brief network or server hiccup.
        await new Promise((r) => setTimeout(r, 1200));
        await run({ data: { action: "save", formula: clean } });
      }
      setForm(clean);
      await qc.invalidateQueries({ queryKey: ["my-formulas"] });
      toast.success(auto ? "Saved" : isSaved ? "Formula updated" : "Formula saved — only you can see it");
      if (id !== clean.id) void navigate({ to: "/formulas", search: { id: clean.id } });
    } catch (e) {
      // Auto-saves stay quiet; the Save button stays active so nothing is lost.
      if ((e as Error).message.includes("up to")) toast.error((e as Error).message);
      else if (!auto) toast("Not saved yet — check your connection and press Save again.");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!isSaved) return newFormula();
    if (!confirm(`Delete "${form.name}"? This cannot be undone.`)) return;
    try {
      await run({ data: { action: "delete", id: form.id } });
      await qc.invalidateQueries({ queryKey: ["my-formulas"] });
      toast.success("Formula deleted");
      newFormula();
    } catch {
      toast.error("Could not delete formula");
    }
  }

  function addUnit(pieIndex: number, op = "+") {
    let n = 1;
    let key = "New_Unit";
    while (allVars.includes(key) || form.units[key]) key = `New_Unit_${++n}`;
    const used = new Set(Object.values(form.units).map((u) => u.color));
    const color = [...UNIT_COLORS.slice(2), ...UNIT_COLORS.slice(0, 2)].find((c) => !used.has(c)) ?? UNIT_COLORS[2]!;
    const expr = form.pies[pieIndex]!.expression.trim();
    const wrap = (op === "*" || op === "/") && /[+-]/.test(expr) ? `(${expr})` : expr;
    setForm((f) => ({
      ...f,
      inputs: { ...f.inputs, [key]: "" },
      units: { ...f.units, [key]: { label: pretty(key), color, kind: "" } },
      pies: f.pies.map((p, k) => (k === pieIndex ? { ...p, expression: expr ? `${wrap} ${op} ${key}` : key } : p)),
    }));
    setEditing(`unit:${pieIndex}:${key}`);
  }

  function renameUnit(oldKey: string, label: string) {
    const key = toName(label);
    if (!key || !NAME_RE.test(key)) return void toast.error("Use letters or numbers for the unit name");
    if (key === oldKey) {
      setUnit(oldKey, { label: label.trim() || pretty(oldKey) });
      return done();
    }
    if (allVars.includes(key)) return void toast.error(`A unit called ${pretty(key)} already exists`);
    setForm((f) => {
      const { [oldKey]: meta, ...units } = f.units;
      const { [oldKey]: value, ...inputs } = f.inputs;
      return {
        ...f,
        units: { ...units, [key]: { ...(meta ?? { color: UNIT_COLORS[0]!, kind: "" as Kind }), label: label.trim() } },
        inputs: { ...inputs, [key]: value ?? "" },
        pies: f.pies.map((p) => ({ ...p, expression: p.expression.replace(wordRe(oldKey), key) })),
      };
    });
    done();
  }

  /** Swap the + − × ÷ sign that joins a unit to the rest of its pie formula. */
  function setOperator(pieIndex: number, key: string, op: string) {
    const expr = form.pies[pieIndex]!.expression;
    let next = expr.replace(opRe(key), (_m, _sign: string, gap: string) => `${op}${gap}`);
    // Keep "Price + Units × Debt" as (Price + Units) × Debt, matching the pool's "everything before Debt, then its sign".
    const last = splitLast(next);
    if ((op === "*" || op === "/") && last?.right === key && splitTerms(last.left).length > 1) next = `(${last.left}) ${op} ${key}`;
    if (next === expr) return;
    if (!valid(next)) return void toast.error("That sign does not fit here — edit the formula with the pencil instead");
    setPie(pieIndex, { expression: next });
  }

  function removeUnit(pieIndex: number, key: string) {
    const expr = form.pies[pieIndex]!.expression;
    const k = key.replace(/[^A-Za-z0-9_]/g, "");
    const options = [
      expr.replace(new RegExp(`\\s*[-+*/^]\\s*(?<![A-Za-z0-9_])${k}(?![A-Za-z0-9_])`), ""),
      expr.replace(new RegExp(`(?<![A-Za-z0-9_])${k}(?![A-Za-z0-9_])\\s*[-+*/^]\\s*`), ""),
    ].map((e) => e.replace(/^\((.*)\)$/, (m, inner: string) => (valid(inner) ? inner : m)));
    const next = options.find((e) => e !== expr && e.trim() && valid(e) && !equationVars(e).includes(k));
    if (!next) return void toast.error("Edit the formula with the pencil to take this unit out");
    setPie(pieIndex, { expression: next });
    setEditing(null);
  }

  const scenTitle = form.scenarioTitle || `Worked solution · ${form.scenarios.map((s) => s.name).join(" · ")}`;
  const setScenario = (i: number, patch: Partial<MyFormula["scenarios"][number]>) =>
    set("scenarios", form.scenarios.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const scaledFor = (change: number) =>
    Object.fromEntries(allVars.map((k) => {
      const raw = form.inputs[k]?.trim() ?? "";
      if (unit(k).kind === "%" || raw === "" || !Number.isFinite(Number(raw))) return [k, raw];
      return [k, String(Number(raw) * (1 + change / 100))];
    }));
  const base = form.scenarios.find((s) => s.change === 0) ?? form.scenarios[0];

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={newFormula} className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-4 w-4" />My private formulas
        </button>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
          <Lock className="h-3.5 w-3.5" />Only you can see this
        </span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          {editing === "name" ? (
            <div className="flex max-w-xl items-center gap-2">
              <Input autoFocus maxLength={100} className="h-12 text-2xl font-semibold" value={form.name} onChange={(e) => set("name", e.target.value)} onKeyDown={(e) => e.key === "Enter" && done()} />
              <Button size="icon" variant="outline" aria-label="Done" onClick={done}><Check className="h-4 w-4" /></Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-semibold">{form.name || "Untitled formula"}</h1>
              <Pen label="Rename formula" onClick={() => setEditing("name")} />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Category
            <select
              aria-label="Formula category"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
              value={form.categoryId ?? ""}
              onChange={async (e) => {
                if (e.target.value !== "__new") return set("categoryId", e.target.value || null);
                const cat = await createCategory();
                if (cat) set("categoryId", cat.id);
              }}
            >
              <option value="">No category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="__new">+ New category…</option>
            </select>
          </label>
          <div className="space-y-2">
            {form.pies.map((p, i) => (
              <FormulaChip
                key={i}
                pie={p}
                showOutput={form.pies.length > 1}
                editing={editing === `expr:${i}`}
                onEdit={() => (editing === `expr:${i}` ? done() : setEditing(`expr:${i}`))}
                onChange={(patch) => setPie(i, patch)}
                formulaName={form.name}
                description={form.description}
                autoCheck={autoCheck}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={newFormula}><Plus className="mr-1.5 h-4 w-4" />New formula</Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => askMfp(`Explain my formula "${form.name}": ${form.pies.map((p) => `${p.outputLabel} = ${p.expression} (${fmt(calc(p.expression, form.inputs).value, p.outputUnit)})`).join("; ")}. Inputs: ${allVars.map((v) => `${unit(v).label}=${form.inputs[v] || 0}`).join(", ")}.`)}
            >
              <Sparkles className="mr-1.5 h-4 w-4" />Ask MFP about this
            </Button>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={autoCheck} onChange={(e) => setAutoCheck(e.target.checked)} />
              AI checks my formula
            </label>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex gap-2">
            <Button variant="outline" size="icon" aria-label="Formula color" aria-expanded={showColors} onClick={() => setShowColors(!showColors)}>
              <Palette className="h-4 w-4" style={{ color: form.color }} />
            </Button>
            <Button variant="outline" size="icon" aria-label={isSaved ? "Delete formula" : "Discard formula"} onClick={remove}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          {showColors && (
            <div className="flex max-w-[200px] flex-wrap justify-end gap-1.5 rounded-lg border border-border bg-card p-2">
              {SWATCHES.map((c) => (
                <button key={c} aria-label={`Color ${c}`} onClick={() => set("color", c)} className={`h-6 w-6 rounded-full border-2 ${form.color === c ? "border-foreground" : "border-transparent"}`} style={{ background: c }} />
              ))}
              <input type="color" aria-label="Custom color" value={form.color} onChange={(e) => set("color", e.target.value)} className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent" />
            </div>
          )}
          <Button disabled={busy || (isSaved && !dirty)} onClick={() => save()} style={{ background: form.color }} className="text-white hover:opacity-90">
            <Save className="mr-1.5 h-4 w-4" />{busy ? "Saving…" : isSaved ? (dirty ? "Save changes" : "Saved") : "Save formula"}
          </Button>
        </div>
      </div>

      {form.pies.map((p, i) => (
        <BusinessPie
          key={i}
          index={i}
          pie={p}
          total={form.pies.length}
          form={form}
          unit={unit}
          editing={editing}
          setEditing={setEditing}
          onTitle={(title) => setPie(i, { title })}
          onValue={(k, v) => set("inputs", { ...form.inputs, [k]: v })}
          onUnit={setUnit}
          onRename={renameUnit}
          onRemoveUnit={(k) => removeUnit(i, k)}
          onAddUnit={() => addUnit(i)}
          onOp={(k, op) => setOperator(i, k, op)}
          onDone={done}
          onReset={() => setForm((f) => ({ ...f, inputs: savedVersion?.inputs ?? blankFormula().inputs }))}
          onRemove={() => set("pies", form.pies.filter((_, k) => k !== i))}
        />
      ))}
      {form.pies.length < MAX_PIES && (
        <button
          onClick={() => setForm((f) => ({
            ...f,
            inputs: { Unit_Cost: "30", ...f.inputs },
            units: { Unit_Cost: { label: "Cost per Unit", color: UNIT_COLORS[3]!, kind: "₱" }, ...f.units },
            pies: [...f.pies, { title: "Second pie", expression: allVars.includes("Units_Sold") ? "Unit_Cost * Units_Sold" : "Unit_Cost", outputLabel: "Total cost", outputUnit: "₱" }],
          }))}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border p-3 text-sm font-semibold text-muted-foreground transition hover:border-primary hover:text-primary"
        >
          <PieIcon className="h-4 w-4" />Add a second business pie with its own formula
        </button>
      )}

      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold">Scenario analysis</p>
        {editing === "scenTitle" ? (
          <div className="mb-1 mt-1 flex max-w-2xl items-center gap-2">
            <Input autoFocus maxLength={100} value={form.scenarioTitle || scenTitle} onChange={(e) => set("scenarioTitle", e.target.value)} onKeyDown={(e) => e.key === "Enter" && done()} />
            <Button size="icon" variant="outline" aria-label="Done" onClick={done}><Check className="h-4 w-4" /></Button>
          </div>
        ) : (
          <div className="mb-1 flex items-center gap-2">
            <h2 className="font-serif text-2xl font-bold">{scenTitle}</h2>
            <Pen label="Rename scenario analysis" onClick={() => setEditing("scenTitle")} />
          </div>
        )}
        <p className="mb-3 text-sm text-muted-foreground">
          Each case shows the real numbers put into {form.pies.map((p, i) => <span key={i} className="font-mono">{i > 0 && " and "}{pretty_expr(p.expression)}</span>)} and the answer. Amounts move by each case's percentage; rates stay fixed.
        </p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {form.scenarios.map((s, si) => {
            const scaled = scaledFor(s.change);
            const highlight = s === base;
            const key = `scen:${si}`;
            return (
              <div key={si} className="rounded-xl border p-4" style={highlight ? { background: form.color, borderColor: form.color, color: "white" } : undefined}>
                {editing === key ? (
                  <div className="space-y-2 text-foreground">
                    <Input aria-label="Scenario name" maxLength={40} value={s.name} onChange={(e) => setScenario(si, { name: e.target.value })} />
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Input aria-label="Change in percent" type="number" className="pr-7" value={s.change} onChange={(e) => setScenario(si, { change: Math.max(-100, Math.min(1000, Number(e.target.value) || 0)) })} />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                      </div>
                      <Button size="icon" variant="outline" aria-label="Done" onClick={() => { if (!s.name.trim()) setScenario(si, { name: `Case ${si + 1}` }); done(); }}><Check className="h-4 w-4" /></Button>
                      <Button size="icon" variant="outline" aria-label={`Delete ${s.name}`} disabled={form.scenarios.length <= 1} onClick={() => { set("scenarios", form.scenarios.filter((_, k) => k !== si)); setEditing(null); }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] opacity-80">{s.name}</p>
                      <p className="mt-1 text-[11px] opacity-70">{s.change === 0 ? "Your current inputs" : `Amounts ${s.change > 0 ? "+" : "−"}${Math.abs(s.change)}%`}</p>
                    </div>
                    <Pen label={`Edit ${s.name}`} color={highlight ? "white" : undefined} onClick={() => setEditing(key)} />
                  </div>
                )}
                {form.pies.map((p, pi) => {
                  const vars = equationVars(p.expression);
                  const r = calc(p.expression, scaled).value;
                  const b = base ? calc(p.expression, scaledFor(base.change)).value : null;
                  const diff = r !== null && b !== null && b !== 0 && !highlight ? ((r - b) / Math.abs(b)) * 100 : null;
                  return (
                    <div key={pi} className={pi > 0 ? "mt-4 border-t border-current/20 pt-3" : ""}>
                      {form.pies.length > 1 && <p className="mt-3 text-xs font-bold opacity-90">{p.title}</p>}
                      <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.15em] opacity-70">Step 1 · Inputs</p>
                      <ul className="mt-1 space-y-1 text-sm">
                        {vars.map((v) => (
                          <li key={v} className="flex justify-between gap-2 border-b border-current/10 pb-1">
                            <span className="opacity-85">{unit(v).label}</span>
                            <span className="font-bold tabular-nums">{fmt(scaled[v]?.trim() ? Number(scaled[v]) : 0, unit(v).kind)}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.15em] opacity-70">Step 2 · Formula</p>
                      <p className="mt-1 font-mono text-xs">{p.outputLabel || "Result"} = {pretty_expr(p.expression)}</p>
                      <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.15em] opacity-70">Step 3 · Answer</p>
                      <p className="mt-1 break-words font-serif text-xl font-bold">{fmt(r, p.outputUnit)}</p>
                      {diff !== null && <p className="mt-1 text-xs font-bold opacity-80">{diff >= 0 ? "+" : ""}{diff.toFixed(1)}% vs {base!.name.toLowerCase()}</p>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        {form.scenarios.length < 8 && (
          <Button
            size="sm"
            variant="outline"
            className="mt-4"
            onClick={() => { set("scenarios", [...form.scenarios, { name: `Case ${form.scenarios.length + 1}`, change: 25 }]); setEditing(`scen:${form.scenarios.length}`); }}
          >
            <Plus className="mr-1 h-4 w-4" />Add scenario
          </Button>
        )}
      </section>
    </div>
  );
}

/** The formula strip under the title: shows the formula, edits it, and asks the AI whether it is right. */
function FormulaChip({ pie, showOutput, editing, onEdit, onChange, formulaName, description, autoCheck }: {
  pie: FPie; showOutput: boolean; editing: boolean; onEdit: () => void; onChange: (p: Partial<FPie>) => void;
  formulaName: string; description: string; autoCheck: boolean;
}) {
  const check = useServerFn(checkMyFormula);
  const [review, setReview] = useState<Review | null>(null);
  const [checking, setChecking] = useState(false);
  const latest = useRef(pie.expression);
  latest.current = pie.expression;
  const lastChecked = useRef("");
  const ok = valid(pie.expression);

  async function runCheck() {
    const expr = pie.expression;
    if (!expr.trim()) return;
    setChecking(true);
    try {
      const r = await check({ data: { name: `${formulaName} — ${pie.title}`, expression: expr, description, outputLabel: pie.outputLabel } });
      if (latest.current === expr) setReview({ ...r, expr });
    } catch {
      if (latest.current === expr) toast.error("The AI could not check this formula right now. Try again in a moment.");
    } finally {
      setChecking(false);
    }
  }
  useEffect(() => {
    const key = `${pie.expression}|${pie.outputLabel}`;
    if (!autoCheck || !ok || lastChecked.current === key) return;
    const t = setTimeout(() => { lastChecked.current = key; void runCheck(); }, 1600);
    return () => clearTimeout(t);
  }, [pie.expression, pie.outputLabel, autoCheck, ok]);

  const shown = review && review.expr === pie.expression ? review : null;
  return (
    <div>
      {editing ? (
        <div className="max-w-2xl space-y-2 rounded-xl border border-border bg-card p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <div>
              <Label className="text-xs text-muted-foreground">Output name</Label>
              <Input className="mt-1" maxLength={60} value={pie.outputLabel} onChange={(e) => onChange({ outputLabel: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Shown as</Label>
              <select aria-label="Output unit" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={pie.outputUnit} onChange={(e) => onChange({ outputUnit: e.target.value as Kind })}>
                <option value="">Number</option>
                <option value="₱">₱ Peso</option>
                <option value="%">%</option>
              </select>
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Formula (use _ instead of spaces in names)</Label>
            <div className="mt-1 flex gap-2">
              <Input autoFocus className="font-mono" maxLength={500} placeholder="Price * Units_Sold" value={pie.expression} onChange={(e) => onChange({ expression: e.target.value })} onKeyDown={(e) => e.key === "Enter" && ok && onEdit()} />
              <Button size="icon" variant="outline" aria-label="Done" disabled={!ok} onClick={onEdit}><Check className="h-4 w-4" /></Button>
            </div>
            <p className={`mt-1 text-xs ${ok ? "text-muted-foreground" : "text-destructive"}`}>
              {ok ? "Allowed: + − * / ^ ( ) and sqrt, abs, ln, log, exp, min, max, round." : "This formula cannot be calculated yet — check the brackets and operators."}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <p className={`inline-block rounded-lg px-3 py-2 font-mono text-sm font-semibold ${ok ? "bg-accent text-accent-foreground" : "bg-destructive/10 text-destructive"}`}>
            {showOutput && `${pie.outputLabel || "Result"} = `}{pretty_expr(pie.expression) || "Add a formula"}
          </p>
          <Pen label="Edit formula" onClick={onEdit} />
          <button onClick={runCheck} disabled={checking || !ok} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground hover:text-primary disabled:opacity-50">
            <Sparkles className="h-3.5 w-3.5" />{checking ? "AI is checking…" : "Check with AI"}
          </button>
        </div>
      )}
      {shown && (
        <div className="mt-2 max-w-2xl rounded-lg bg-muted/60 p-3 text-sm text-foreground">
          <p className="flex items-center gap-1.5 font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            AI note
            <button aria-label="Hide AI feedback" onClick={() => setReview(null)} className="ml-auto opacity-70 hover:opacity-100"><X className="h-4 w-4" /></button>
          </p>
          <p className="mt-1 whitespace-pre-line text-muted-foreground">{shown.feedback}</p>
          {shown.suggestion && shown.suggestion !== shown.expr && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Optional idea:</span>
              <span className="rounded bg-background px-2 py-1 font-mono text-xs">{shown.suggestion}</span>
              <Button size="sm" variant="outline" onClick={() => onChange({ expression: shown.suggestion })}>Use this</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Unit name and share printed beside each pie slice. */
function SliceLabel({ cx, cy, midAngle, outerRadius, name, payload }: { cx: number; cy: number; midAngle: number; outerRadius: number; name: string; payload: { pct: number } }) {
  const a = (-midAngle * Math.PI) / 180;
  const x = cx + (outerRadius + 16) * Math.cos(a);
  const y = cy + (outerRadius + 16) * Math.sin(a);
  const anchor = x >= cx ? "start" : "end";
  const short = name.length > 14 ? `${name.slice(0, 13)}…` : name;
  return (
    <text x={x} y={y} textAnchor={anchor} dominantBaseline="central" className="fill-foreground text-[10px]">
      <tspan x={x} dy="-0.5em" fontWeight={600}>{short}</tspan>
      <tspan x={x} dy="1.15em" className="fill-muted-foreground">{pctLabel(payload.pct)}</tspan>
    </text>
  );
}

function BusinessPie({ index, pie, total, form, unit, editing, setEditing, onTitle, onValue, onUnit, onRename, onRemoveUnit, onAddUnit, onOp, onDone, onReset, onRemove }: {
  index: number; pie: FPie; total: number; form: MyFormula; unit: (k: string, i?: number) => Unit;
  editing: string | null; setEditing: (v: string | null) => void;
  onTitle: (t: string) => void; onValue: (k: string, v: string) => void; onUnit: (k: string, p: Partial<Unit>) => void;
  onRename: (k: string, label: string) => void; onRemoveUnit: (k: string) => void; onAddUnit: () => void;
  onOp: (k: string, op: string) => void; onDone: () => void;
  onReset: () => void; onRemove: () => void;
}) {
  const [draft, setDraft] = useState("");
  const vars = equationVars(pie.expression);
  const result = calc(pie.expression, form.inputs);
  const color = (k: string) => unit(k, Math.max(0, vars.indexOf(k))).color;
  const nameOf = (src: string) => pretty_expr(src.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (k) => (vars.includes(k) ? unit(k).label : k)));
  const [mode, setMode] = useState<PieMode>("raw");
  const nums = Object.fromEntries(vars.map((k) => [k, Number(form.inputs[k]?.replace(/,/g, "").trim() || 0)]));
  // One Total Pool Base per tab drives the ring centre, the sentence and every share below.
  const pool = totalPool(mode, pie.expression, nums, (k) => unit(k).kind !== "%");
  const sentence = formulaSentence(pie.expression, pool, {
    label: (k) => unit(k).label,
    value: (k) => fmt(nums[k] ?? 0, unit(k).kind),
    money: (n) => fmt(n, pie.outputUnit),
    outputLabel: pie.outputLabel,
  });
  const itemColor = (vs: string[]) => color(vs[0] ?? "");
  const parts = pool.items.map((d) => {
    const n = sentence.terms[d.key];
    return { key: d.key, value: d.value, pct: d.share, name: n?.short ?? nameOf(d.src), full: n?.full ?? nameOf(d.src), color: itemColor(d.vars), unit: d.role === "gross" ? pie.outputUnit : unit(d.key).kind };
  });
  const byKey = new Map(parts.map((d) => [d.key, d]));
  const ring = ringSlices(pool).map((r) => {
    const d = byKey.get(r.key);
    return { key: r.key, value: r.value, pct: d ? d.pct : r.value, name: d?.name ?? "Rest of pool", color: d?.color ?? "var(--muted)" };
  });
  const sum = ring.length;
  const pctOf = new Map(ring.map((d) => [d.key, d.pct]));
  const shareTotal = parts.reduce((a, d) => a + d.pct, 0);
  const formulaText = pool.mode === "financial" && pool.debt
    ? `${parts[0]?.name ?? ""} ${OPS.find(([v]) => v === pool.debt!.op)![1]} ${unit(pool.debt.key).label}`
    : nameOf(pie.expression);
  const titleKey = `pieTitle:${index}`;
  const plusDebt = sentence.debtSign === "+";

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold">Business pie{total > 1 ? ` ${index + 1}` : ""}</p>
          {editing === titleKey ? (
            <div className="mt-1 flex items-center gap-2">
              <Input autoFocus maxLength={80} value={pie.title} onChange={(e) => onTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onDone()} />
              <Button size="icon" variant="outline" aria-label="Done" onClick={onDone}><Check className="h-4 w-4" /></Button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <h2 className="font-serif text-2xl font-bold">{pie.title || "Input composition"}</h2>
              <Pen label="Rename pie" onClick={() => setEditing(titleKey)} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <HintProvider delayDuration={150}>
            <div role="tablist" aria-label="How percentages are worked out" className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
              {PIE_MODES.map((m) => (
                <div key={m.id} className={`flex items-center rounded-full ${mode === m.id ? "bg-background shadow-sm" : ""}`}>
                  <button role="tab" aria-selected={mode === m.id} onClick={() => setMode(m.id)} className={`flex-1 py-1.5 pl-3 pr-1 text-left text-xs font-semibold leading-tight ${mode === m.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    {m.label}
                  </button>
                  <Hint>
                    <HintTrigger asChild>
                      <button aria-label={`What is ${m.label}?`} className="mr-2 shrink-0 text-muted-foreground hover:text-primary"><Info className="h-3.5 w-3.5" /></button>
                    </HintTrigger>
                    <HintContent className="max-w-64 leading-relaxed">{m.hint}</HintContent>
                  </Hint>
                </div>
              ))}
            </div>
          </HintProvider>
          {total > 1 && (
            <Button size="icon" variant="ghost" aria-label="Remove this pie" onClick={() => { if (confirm(`Remove "${pie.title}"?`)) onRemove(); }}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-5 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
        <div>
          <div className="relative mx-auto h-[320px] max-w-[400px]">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={sum ? ring : [{ key: "none", name: "No values yet", color: "var(--muted)", value: 1 }]} dataKey="value" innerRadius="47%" outerRadius="66%" paddingAngle={sum ? 1 : 0} stroke="none" isAnimationActive={false} labelLine={sum > 0} label={sum > 0 ? SliceLabel : false}>
                  {(sum ? ring : [{ key: "none", color: "var(--muted)" }]).map((d) => <Cell key={d.key} fill={d.color} />)}
                </Pie>
                {sum > 0 && <Tooltip formatter={(_v: number, _n, item) => { const k = (item.payload as { key: string }).key; const d = byKey.get(k); return d ? `${pctLabel(d.pct)} · ${fmt(d.value, d.unit)}` : `${pctLabel(pctOf.get(k) ?? 0)} of the pool`; }} />}
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="max-w-[140px] break-all font-serif text-xl font-bold leading-tight">{fmt(pool.base, pie.outputUnit)}</span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Total Pool Base</span>
            </div>
          </div>
          {(result.error || (pool.base === null && vars.length > 0)) && <p className="text-xs text-destructive">{result.error || "The Total Pool Base cannot be worked out (check for divide by zero)."}</p>}
          {plusDebt && (
            <p role="note" className="mt-1 flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span><span className="font-bold">Notice:</span> You are adding debt to your revenue. This treats debt as an additional asset value in your total pool instead of a deduction.</span>
            </p>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{PIE_MODES.find((m) => m.id === mode)!.hint}</p>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-serif text-xl font-semibold">Inputs</h3>
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" onClick={onReset}><RotateCcw className="mr-1 h-3.5 w-3.5" />Reset example</Button>
              <Button size="sm" className="bg-emerald-500 font-bold text-white hover:bg-emerald-600" onClick={onAddUnit}>Add Unit</Button>
            </div>
          </div>
          {vars.length === 0 && <p className="text-sm text-muted-foreground">Add a unit or edit the formula to get input boxes.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {vars.map((k, i) => {
              const u = unit(k, i);
              const key = `unit:${index}:${k}`;
              const open = editing === key;
              const sign = pie.expression.match(opRe(k))?.[1];
              const left = (sign ? 2.75 : 0.75) + (u.kind === "₱" ? 1 : 0);
              return (
                <div key={k} className={open ? "sm:col-span-2" : ""}>
                  <Label className="text-xs font-semibold text-muted-foreground">{u.label}{u.kind ? ` (${u.kind})` : ""}</Label>
                  <div className={`relative mt-1 rounded-md ${open ? "ring-2 ring-foreground/70" : ""}`}>
                    {sign && (
                      <select
                        aria-label={`Sign before ${u.label}`}
                        title="How this unit joins the formula"
                        value={sign}
                        onChange={(e) => onOp(k, e.target.value)}
                        className="absolute left-1 top-1/2 h-8 w-9 -translate-y-1/2 cursor-pointer appearance-none rounded border border-input bg-muted text-center text-sm font-bold"
                        style={{ color: u.color }}
                      >
                        {OPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    )}
                    {u.kind === "₱" && <span className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-sm font-bold text-primary" style={{ left: `${left - 1}rem` }}>₱</span>}
                    {u.kind === "%" && <span className="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">%</span>}
                    <Input className="pr-10" style={{ paddingLeft: `${left}rem` }} inputMode="decimal" aria-label={u.label} value={withCommas(form.inputs[k] ?? "")} onChange={(e) => onValue(k, e.target.value.replace(/,/g, ""))} />
                    <Pen color={u.color} label={`Edit ${u.label}`} className="absolute right-1.5 top-1/2 -translate-y-1/2" onClick={() => { setDraft(u.label); setEditing(open ? null : key); }} />
                  </div>
                  {open && (
                    <div className="mt-2 grid gap-2 rounded-lg border border-border bg-background p-3 sm:grid-cols-[1fr_auto_auto]">
                      <div>
                        <Label className="text-xs text-muted-foreground">Unit name</Label>
                        <Input autoFocus className="mt-1" maxLength={60} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onRename(k, draft)} />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Type</Label>
                        <select aria-label="Unit type" className="mt-1 h-10 rounded-md border border-input bg-background px-2 text-sm" value={u.kind} onChange={(e) => onUnit(k, { kind: e.target.value as Kind })}>
                          <option value="">Number</option>
                          <option value="₱">₱ Peso</option>
                          <option value="%">% Rate</option>
                        </select>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Color</Label>
                        <input type="color" aria-label="Unit color" value={u.color} onChange={(e) => onUnit(k, { color: e.target.value })} className="mt-1 block h-10 w-14 cursor-pointer rounded border border-border bg-transparent" />
                      </div>
                      <div className="flex flex-wrap gap-1.5 sm:col-span-3">
                        {UNIT_COLORS.map((c) => (
                          <button key={c} aria-label={`Color ${c}`} onClick={() => onUnit(k, { color: c })} className={`h-6 w-6 rounded-full border-2 ${u.color === c ? "border-foreground" : "border-transparent"}`} style={{ background: c }} />
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2 sm:col-span-3">
                        <Button size="sm" onClick={() => onRename(k, draft)}><Check className="mr-1 h-4 w-4" />Done</Button>
                        <Button size="sm" variant="outline" onClick={() => onRemoveUnit(k)}><Trash2 className="mr-1 h-4 w-4" />Remove unit</Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {sentence.segments.length > 0 && (
            <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2" aria-live="polite">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Formula sentence</p>
              <p className="mt-0.5 text-sm leading-relaxed" aria-label={sentenceText(sentence)}>
                {sentence.segments.map((x, i) => (
                  <span key={i}>
                    {i > 0 && " "}
                    {x.kind === "op" ? (
                      <span className={`font-extrabold ${x.text === "MINUS" ? "text-red-600" : x.text === "PLUS" ? "text-emerald-600" : "text-primary"}`}>{x.text}</span>
                    ) : x.kind === "result" ? (
                      <span className="font-bold">{x.text}</span>
                    ) : x.text}
                  </span>
                ))}
                .
              </p>
            </div>
          )}
          {parts.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {pool.base !== null && (
                <li className="text-xs text-muted-foreground">
                  Each share = item ÷ Total Pool Base {fmt(pool.base, pie.outputUnit)} ({formulaText}) × 100
                  {Math.abs(shareTotal - 100) > 0.05 && pool.base !== 0 && ` — shares add up to ${pctLabel(shareTotal)} because ${shareTotal > 100 ? "a part is taken out of" : "× or ÷ resizes"} the pool`}
                </li>
              )}
              {parts.map((d) => (
                <li key={d.key} className="flex items-center justify-between gap-3 border-b border-border/60 pb-1.5 text-sm">
                  <span className="flex items-center gap-2.5"><span className="h-3 w-3 shrink-0 rounded-full" style={{ background: d.color }} /><span className={d.full.startsWith("Less:") ? "font-medium text-red-700 dark:text-red-400" : ""}>{d.full}</span></span>
                  <span className="text-right tabular-nums">
                    <span className="mr-2 text-muted-foreground">{fmt(d.value, d.unit)}</span>
                    <span className="font-bold">{pctLabel(d.pct)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

export function MyFormulaSidebar({ onPick }: { onPick: () => void }) {
  const { session, loading } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const runCat = useServerFn(myCategories);
  const { data: formulas = [] } = useMyFormulas();
  const { data: categories = [] } = useMyCategories();
  const createCategory = useCreateCategory();
  const current = useRouterState({ select: (s) => (s.location.search as { id?: string }).id });
  const [q, setQ] = useState("");
  const [closed, setClosed] = useState<string[]>([]);

  if (loading) return null;
  if (!session)
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
        <Lock className="mx-auto mb-2 h-5 w-5 text-primary" />
        Sign in to make your own categories and formulas.
      </div>
    );

  const t = q.trim().toLowerCase();
  const known = new Set(categories.map((c) => c.id));
  const groups = [
    ...categories.map((c) => ({ ...c, own: true })),
    { id: "", name: "No category", own: false },
  ].map((c) => ({
    ...c,
    items: formulas.filter((f) => (c.own ? f.categoryId === c.id : !f.categoryId || !known.has(f.categoryId)) && (!t || f.name.toLowerCase().includes(t))),
  })).filter((g) => g.own || g.items.length);

  async function rename(c: MyCategory) {
    const name = prompt("Rename category", c.name)?.trim().slice(0, 60);
    if (!name || name === c.name) return;
    try {
      await runCat({ data: { action: "save", id: c.id, name } });
      await qc.invalidateQueries({ queryKey: ["my-formula-categories"] });
    } catch { toast.error("Could not rename category"); }
  }
  async function remove(c: MyCategory) {
    if (!confirm(`Delete the category "${c.name}"? Its formulas are kept and moved to "No category".`)) return;
    try {
      await runCat({ data: { action: "delete", id: c.id } });
      await qc.invalidateQueries({ queryKey: ["my-formula-categories"] });
      await qc.invalidateQueries({ queryKey: ["my-formulas"] });
    } catch { toast.error("Could not delete category"); }
  }
  const startIn = (catId: string) => { onPick(); void navigate({ to: "/formulas", search: { newIn: catId || "none" } as never }); };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground"><Lock className="h-3.5 w-3.5" />MY PRIVATE FORMULAS</p>
      <div className="flex items-center rounded-lg border border-border bg-background px-2.5">
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find one of my formulas" placeholder="Find my formula…" className="h-11 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none" />
      </div>
      <div className="mt-2 flex gap-1 text-xs">
        <button onClick={() => startIn("")} className="flex flex-1 items-center justify-center gap-1 rounded-md border border-primary bg-primary py-2.5 font-bold text-primary-foreground">
          <Plus className="h-3.5 w-3.5" />New formula
        </button>
        <button onClick={() => void createCategory()} className="flex flex-1 items-center justify-center gap-1 rounded-md border border-border py-2.5 font-bold hover:border-primary">
          <FolderPlus className="h-3.5 w-3.5" />New category
        </button>
      </div>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
        {!groups.length && <p className="px-2 text-xs text-muted-foreground">No formulas yet. Make a category, then add your own formulas to it.</p>}
        {groups.map((g) => {
          const open = !closed.includes(g.id) || !!t;
          return (
            <div key={g.id || "none"}>
              <div className="group flex items-center rounded-md hover:bg-sidebar-accent">
                <button aria-expanded={open} onClick={() => setClosed(open ? [...closed, g.id] : closed.filter((x) => x !== g.id))} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm font-semibold">
                  <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-primary transition ${open ? "rotate-90" : ""}`} />
                  <span className="truncate">{g.name}</span>
                  <span className="text-xs font-normal text-muted-foreground">{g.items.length}</span>
                </button>
                <button aria-label={`New formula in ${g.name}`} title="New formula here" onClick={() => startIn(g.id)} className="p-1 text-muted-foreground hover:text-primary"><Plus className="h-3.5 w-3.5" /></button>
                {g.own && <>
                  <button aria-label={`Rename ${g.name}`} title="Rename" onClick={() => void rename(g)} className="p-1 text-muted-foreground hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
                  <button aria-label={`Delete ${g.name}`} title="Delete category" onClick={() => void remove(g)} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </>}
              </div>
              {open && (
                <div className="mb-1 ml-3 border-l border-border pl-2">
                  {g.items.length ? g.items.map((f) => (
                    <Link key={f.id} to="/formulas" search={{ id: f.id } as never} onClick={onPick}
                      className={`flex items-center gap-2 truncate rounded-md px-2 py-1.5 text-[13px] transition hover:bg-sidebar-accent ${f.id === current ? "bg-primary font-bold text-primary-foreground hover:bg-primary" : "text-sidebar-foreground/85"}`}>
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: f.color }} />{f.name}
                    </Link>
                  )) : <p className="px-2 py-1.5 text-xs text-muted-foreground">{t ? "No match." : "Empty — tap + to add a formula."}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
