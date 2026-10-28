import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { equationVars, evaluateEquation } from "@/lib/equation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type CF = { id: string; category: string; name: string; expression: string; description: string };

export function useCustomFormulas() {
  return useQuery({
    queryKey: ["custom-formulas"],
    queryFn: async () => ((await supabase.from("custom_formulas").select("id,category,name,expression,description").order("category").order("name")).data ?? []) as CF[],
  });
}

/** Public: admin-posted formulas with a live calculator each. */
export function CustomFormulaList() {
  const { data = [] } = useCustomFormulas();
  if (!data.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="font-serif text-2xl font-bold">Our formulas</h2>
      <div className="grid gap-4 md:grid-cols-2">{data.map((f) => <FormulaCalc key={f.id} f={f} />)}</div>
    </section>
  );
}

function FormulaCalc({ f }: { f: CF }) {
  const vars = equationVars(f.expression);
  const [v, setV] = useState<Record<string, string>>({});
  let out = "";
  try {
    if (vars.every((k) => v[k] !== undefined && v[k] !== "")) {
      const r = evaluateEquation(f.expression, Object.fromEntries(vars.map((k) => [k, Number(v[k])])));
      out = Number.isFinite(r) ? r.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "—";
    }
  } catch { out = "Check the formula"; }
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[11px] font-bold tracking-[0.15em] text-primary">{f.category.toUpperCase()}</p>
      <h3 className="font-sans text-lg font-bold">{f.name}</h3>
      <p className="mt-1 rounded-md bg-muted px-2 py-1 font-mono text-sm">{f.expression}</p>
      {f.description && <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{f.description}</p>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {vars.map((k) => (
          <label key={k} className="text-xs font-bold">{k}
            <Input type="number" className="mt-1 h-9" value={v[k] ?? ""} onChange={(e) => setV((s) => ({ ...s, [k]: e.target.value }))} />
          </label>
        ))}
      </div>
      <p className="mt-3 text-sm font-bold">Result: <span className="text-primary">{out || "—"}</span></p>
    </div>
  );
}

/** Admin: post, edit and delete formulas. */
export function CustomFormulaAdmin() {
  const qc = useQueryClient();
  const { data = [] } = useCustomFormulas();
  const blank = { id: "", category: "Custom", name: "", expression: "", description: "" };
  const [form, setForm] = useState<CF>(blank);
  const set = (k: keyof CF) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!form.name.trim() || !form.expression.trim()) return void toast.error("Name and formula are required");
    try { evaluateEquation(form.expression, Object.fromEntries(equationVars(form.expression).map((k) => [k, 1]))); }
    catch (e) { return void toast.error("Formula problem: " + (e as Error).message); }
    const row = { category: form.category || "Custom", name: form.name, expression: form.expression, description: form.description, updated_at: new Date().toISOString() };
    const { error } = form.id ? await supabase.from("custom_formulas").update(row).eq("id", form.id) : await supabase.from("custom_formulas").insert(row);
    if (error) return void toast.error(error.message);
    toast.success(form.id ? "Formula updated" : "Formula posted");
    setForm(blank);
    qc.invalidateQueries({ queryKey: ["custom-formulas"] });
  }
  async function remove(id: string) {
    if (!confirm("Delete this formula?")) return;
    const { error } = await supabase.from("custom_formulas").delete().eq("id", id);
    if (error) return void toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["custom-formulas"] });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="space-y-3 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-2xl font-semibold">{form.id ? "Edit formula" : "Post a new formula"}</h2>
        <Input placeholder="Category (e.g. Banking)" value={form.category} onChange={set("category")} />
        <Input placeholder="Formula name (e.g. Economic Value Added)" value={form.name} onChange={set("name")} />
        <Input placeholder="Formula, e.g. NOPAT - Capital * WACC" value={form.expression} onChange={set("expression")} />
        <p className="text-xs text-muted-foreground">Use words for the boxes people fill in (Revenue, Cost). Allowed: + − * / ^ ( ) sqrt, ln, log, min, max.</p>
        <Textarea placeholder="Description (optional)" value={form.description} onChange={set("description")} />
        <div className="flex gap-2">
          <Button onClick={save}><Plus className="mr-2 h-4 w-4" />{form.id ? "Save changes" : "Post formula"}</Button>
          {form.id && <Button variant="outline" onClick={() => setForm(blank)}>Cancel</Button>}
        </div>
      </section>
      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-2xl font-semibold">Your formulas ({data.length})</h2>
        <div className="mt-3 space-y-2">
          {data.map((f) => (
            <div key={f.id} className="flex items-center gap-2 rounded-lg border border-border p-3">
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{f.name}</p><p className="truncate font-mono text-xs text-muted-foreground">{f.category} · {f.expression}</p></div>
              <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => setForm(f)}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => remove(f.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          {!data.length && <p className="text-sm text-muted-foreground">No formulas posted yet.</p>}
        </div>
      </section>
    </div>
  );
}
