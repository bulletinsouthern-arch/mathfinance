import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { compute, formatResult, type Formula } from "@/lib/formulas";

const COLORS = ["var(--primary)", "var(--gold)", "oklch(0.55 0.08 160)", "oklch(0.45 0.05 230)", "oklch(0.65 0.1 50)", "oklch(0.7 0.04 140)"];

function Donut({ data, center, sub }: { data: { name: string; value: number }[]; center: string; sub: string }) {
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <div className="grid items-center gap-6 sm:grid-cols-[220px_1fr]">
      <div className="relative h-[220px]">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius={68} outerRadius={100} paddingAngle={2} stroke="none">
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v: number) => `${((v / total) * 100).toFixed(1)}%`} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-serif text-xl font-bold">{center}</span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{sub}</span>
        </div>
      </div>
      <ul className="space-y-2">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 text-sm">
            <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />{d.name}</span>
            <span className="font-bold tabular-nums">{((d.value / total) * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FormulaInsights({ f, vals }: { f: Formula; vals: Record<string, string> }) {
  const result = compute(f, vals);

  const pie = useMemo(() => {
    if (f.unit === "%" && Number.isFinite(result) && result >= 0 && result <= 1) {
      return { data: [{ name: f.name.replace(/\s*\(.*\)/, ""), value: result }, { name: "Remainder", value: 1 - result }], title: "Share breakdown" };
    }
    const parts = f.inputs.filter((i) => !i.pct && !i.list).map((i) => ({ name: i.label, value: Math.abs(Number(vals[i.key] ?? i.def)) })).filter((d) => d.value > 0);
    if (parts.length < 2) return null;
    return { data: parts, title: "Input composition" };
  }, [f, vals, result]);

  const sens = useMemo(() => f.inputs.filter((i) => !i.list).map((i) => {
    const base = Number(vals[i.key] ?? i.def);
    const lo = compute(f, { ...vals, [i.key]: String(base * 0.9) });
    const hi = compute(f, { ...vals, [i.key]: String(base * 1.1) });
    return { label: i.label, lo, hi, swing: Math.abs(hi - lo) };
  }).sort((a, b) => (b.swing || 0) - (a.swing || 0)), [f, vals]);
  const maxSwing = Math.max(...sens.map((s) => (Number.isFinite(s.swing) ? s.swing : 0)), 1e-12);

  const scen = [["Bear case", 0.85], ["Base case", 1], ["Bull case", 1.15]].map(([n, k]) => {
    const scaled = Object.fromEntries(f.inputs.map((i) => [i.key, i.list || i.pct ? vals[i.key] ?? String(i.def) : String(Number(vals[i.key] ?? i.def) * (k as number))]));
    return { n: n as string, k: k as number, r: compute(f, scaled), scaled };
  });
  const fmtIn = (i: Formula["inputs"][number], v: string) => i.list ? v : i.pct ? `${Number(v)}%` : Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const baseR = scen[1].r;
  const verdict = (r: number) => {
    if (!Number.isFinite(r) || !Number.isFinite(baseR) || baseR === 0) return "";
    const d = ((r - baseR) / Math.abs(baseR)) * 100;
    return `${d >= 0 ? "+" : ""}${d.toFixed(1)}% vs base`;
  };

  return (
    <div className="space-y-6">
      {pie && (
        <section className="rounded-2xl border border-border bg-card p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold">Business pie</p>
          <h2 className="mb-4 font-serif text-2xl font-bold">{pie.title}</h2>
          <Donut data={pie.data} center={formatResult(result, f.unit)} sub="Result" />
        </section>
      )}
      <section className="rounded-2xl border border-border bg-card p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold">Scenario analysis</p>
        <h2 className="mb-1 font-serif text-2xl font-bold">Worked solution · Bear · Base · Bull</h2>
        <p className="mb-4 text-sm text-muted-foreground">Each case shows the real numbers put into <span className="font-mono">{f.expr}</span> and the answer. Amounts move ±15%; rates stay fixed.</p>
        <div className="grid gap-4 lg:grid-cols-3">
          {scen.map((s) => (
            <div key={s.n} className={`rounded-xl border p-5 ${s.k === 1 ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] opacity-80">{s.n}</p>
              <p className="mt-1 text-[11px] opacity-70">{s.k === 1 ? "Your current inputs" : `Amounts ${s.k > 1 ? "+" : "−"}15%`}</p>
              <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.15em] opacity-70">Step 1 · Inputs</p>
              <ul className="mt-1 space-y-1 text-sm">
                {f.inputs.map((i) => (
                  <li key={i.key} className="flex justify-between gap-2 border-b border-current/10 pb-1">
                    <span className="opacity-85">{i.label}</span><span className="font-bold tabular-nums">{fmtIn(i, s.scaled[i.key])}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.15em] opacity-70">Step 2 · Formula</p>
              <p className="mt-1 font-mono text-xs">{f.name} = {f.expr}</p>
              <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.15em] opacity-70">Step 3 · Answer</p>
              <p className="mt-1 break-words font-serif text-2xl font-bold">{formatResult(s.r, f.unit)}</p>
              {s.k !== 1 && <p className="mt-1 text-xs font-bold opacity-80">{verdict(s.r)}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold">Sensitivity</p>
        <h2 className="mb-1 font-serif text-2xl font-bold">What drives the result most</h2>
        <p className="mb-4 text-sm text-muted-foreground">Each input moved −10% and +10%, others held constant.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground"><th className="py-2">Driver</th><th>−10%</th><th>+10%</th><th className="w-1/3">Impact</th></tr></thead>
            <tbody>
              {sens.map((s) => (
                <tr key={s.label} className="border-b border-border/60">
                  <td className="py-2.5 font-bold">{s.label}</td>
                  <td className="tabular-nums">{formatResult(s.lo, f.unit)}</td>
                  <td className="tabular-nums">{formatResult(s.hi, f.unit)}</td>
                  <td><div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${Number.isFinite(s.swing) ? (s.swing / maxSwing) * 100 : 0}%` }} /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
