import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { saveSiteSetting, useSiteSettings } from "@/lib/settings";
import { CATEGORIES, formulasByCat } from "@/lib/formulas";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Admin writes their own description/guide per formula (e.g. how to read an income statement). Stored as site_settings formula_desc_<id>. */
export function FormulaGuideEditor() {
  const s = useSiteSettings();
  const qc = useQueryClient();
  const [cat, setCat] = useState(1);
  const list = useMemo(() => formulasByCat(cat), [cat]);
  const [id, setId] = useState(list[0]?.id ?? "");
  const [text, setText] = useState("");
  useEffect(() => { setId(formulasByCat(cat)[0]?.id ?? ""); }, [cat]);
  useEffect(() => { setText(s[`formula_desc_${id}`] ?? ""); }, [id, s]);

  async function save() {
    const { error } = await saveSiteSetting(`formula_desc_${id}`, text);
    if (error) return void toast.error(error.message);
    toast.success("Formula description saved");
    qc.invalidateQueries({ queryKey: ["site-settings"] });
  }
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
      <div>
        <h2 className="text-2xl font-bold">Formula descriptions</h2>
        <p className="text-sm text-muted-foreground">Write your own explanation for any formula — shown on its page under "About this formula".</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div><Label>Category</Label>
          <select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={cat} onChange={(e) => setCat(Number(e.target.value))}>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>
        <div><Label>Formula</Label>
          <select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={id} onChange={(e) => setId(e.target.value)}>
            {list.map((f) => <option key={f.id} value={f.id}>{s[`formula_desc_${f.id}`] ? "✓ " : ""}{f.name}</option>)}
          </select></div>
      </div>
      <Textarea className="min-h-48" value={text} onChange={(e) => setText(e.target.value)} placeholder={"e.g.\n# How to read it\nThe income statement shows…\n- A healthy ratio is above 1.5"} />
      <p className="text-[11px] text-muted-foreground"># Heading · - bullet · &gt; highlighted note · **bold**</p>
      <Button onClick={save}>Save description</Button>
    </section>
  );
}
