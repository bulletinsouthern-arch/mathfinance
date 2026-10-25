import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatResult } from "@/lib/formulas";

export const Route = createFileRoute("/calculators")({
  head: () => ({
    meta: [
      { title: "Business Income Builder & Calculators — Math & Finance Pro" },
      { name: "description", content: "Build your own income statement, see margins instantly and visualize where every peso goes." },
      { property: "og:title", content: "Business Income Builder — Math & Finance Pro" },
      { property: "og:description", content: "Build your own income statement with a live profit breakdown pie chart." },
    ],
  }),
  component: Calculators,
});

type Line = { name: string; amount: number };
type Model = { company: string; revenue: Line[]; cogs: number; opex: Line[]; da: number; interest: number; taxRate: number; shares: number; dividends: number };
const DEFAULT: Model = {
  company: "My Company",
  revenue: [{ name: "Product sales", amount: 420000 }, { name: "Services", amount: 80000 }],
  cogs: 210000,
  opex: [{ name: "Salaries", amount: 90000 }, { name: "Rent", amount: 24000 }, { name: "Marketing", amount: 18000 }, { name: "Software & tools", amount: 6000 }],
  da: 12000, interest: 9000, taxRate: 21, shares: 10000, dividends: 15000,
};
const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--primary-glow)"];
const money = (n: number) => formatResult(n, "$");
const pct = (n: number) => formatResult(n, "%");

function Calculators() {
  const [m, setM] = useState<Model>(DEFAULT);
  useEffect(() => { try { const s = localStorage.getItem("mfp-income"); if (s) setM(JSON.parse(s)); } catch { /* ignore */ } }, []);
  useEffect(() => { localStorage.setItem("mfp-income", JSON.stringify(m)); }, [m]);

  const r = useMemo(() => {
    const rev = m.revenue.reduce((a, b) => a + (+b.amount || 0), 0);
    const opex = m.opex.reduce((a, b) => a + (+b.amount || 0), 0);
    const gp = rev - m.cogs;
    const ebitda = gp - opex;
    const ebit = ebitda - m.da;
    const ebt = ebit - m.interest;
    const tax = Math.max(0, ebt * (m.taxRate / 100));
    const ni = ebt - tax;
    return { rev, opex, gp, ebitda, ebit, ebt, tax, ni, eps: ni / (m.shares || 1), payout: m.dividends / ni };
  }, [m]);

  const pie = [
    { name: "Cost of Goods Sold", value: m.cogs },
    { name: "Operating Expenses", value: r.opex },
    { name: "Depreciation & Amortization", value: m.da },
    { name: "Interest", value: m.interest },
    { name: "Taxes", value: r.tax },
    { name: "Net Profit", value: Math.max(0, r.ni) },
  ].filter((x) => x.value > 0);
  const opexPie = m.opex.filter((x) => x.amount > 0).map((x) => ({ name: x.name, value: +x.amount }));

  const setLine = (k: "revenue" | "opex", i: number, patch: Partial<Line>) => setM({ ...m, [k]: m[k].map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const num = (k: keyof Model) => (e: React.ChangeEvent<HTMLInputElement>) => setM({ ...m, [k]: Number(e.target.value) || 0 });

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold tracking-[0.2em] text-primary">BUSINESS MATH PIE</p>
        <h1 className="mt-1 text-4xl font-semibold">Business Income Builder</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Fill in your own numbers and see your income statement, margins and a live breakdown of where every peso of revenue goes. Your figures are saved on this device.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        <div className="space-y-5 rounded-2xl border border-border bg-card p-6">
          <div><Label>Company name</Label><Input className="mt-1" value={m.company} onChange={(e) => setM({ ...m, company: e.target.value })} /></div>
          {(["revenue", "opex"] as const).map((k) => (
            <div key={k}>
              <div className="mb-2 flex items-center justify-between">
                <Label>{k === "revenue" ? "Revenue streams" : "Operating expenses"}</Label>
                <Button size="sm" variant="ghost" onClick={() => setM({ ...m, [k]: [...m[k], { name: "New line", amount: 0 }] })}><Plus className="mr-1 h-3.5 w-3.5" />Add</Button>
              </div>
              <div className="space-y-2">
                {m[k].map((l, i) => (
                  <div key={i} className="flex gap-2">
                    <Input value={l.name} onChange={(e) => setLine(k, i, { name: e.target.value })} />
                    <Input className="w-36" inputMode="decimal" value={l.amount} onChange={(e) => setLine(k, i, { amount: Number(e.target.value) || 0 })} />
                    <Button size="icon" variant="ghost" onClick={() => setM({ ...m, [k]: m[k].filter((_, j) => j !== i) })} aria-label="Remove"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Cost of goods sold</Label><Input className="mt-1" value={m.cogs} onChange={num("cogs")} /></div>
            <div><Label>Depreciation &amp; amortization</Label><Input className="mt-1" value={m.da} onChange={num("da")} /></div>
            <div><Label>Interest expense</Label><Input className="mt-1" value={m.interest} onChange={num("interest")} /></div>
            <div><Label>Tax rate (%)</Label><Input className="mt-1" value={m.taxRate} onChange={num("taxRate")} /></div>
            <div><Label>Shares outstanding</Label><Input className="mt-1" value={m.shares} onChange={num("shares")} /></div>
            <div><Label>Dividends paid</Label><Input className="mt-1" value={m.dividends} onChange={num("dividends")} /></div>
          </div>
          <Button variant="outline" onClick={() => setM(DEFAULT)}>Reset to example</Button>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-2xl font-semibold">{m.company} — Income Statement</h2>
            <table className="mt-4 w-full text-sm">
              <tbody className="[&_td]:py-1.5 [&_td:last-child]:text-right [&_td:last-child]:tabular-nums">
                <tr><td>Revenue</td><td>{money(r.rev)}</td></tr>
                <tr className="text-muted-foreground"><td>− Cost of goods sold</td><td>{money(m.cogs)}</td></tr>
                <tr className="border-t border-border font-semibold"><td>Gross profit</td><td>{money(r.gp)}</td></tr>
                <tr className="text-muted-foreground"><td>− Operating expenses</td><td>{money(r.opex)}</td></tr>
                <tr className="border-t border-border font-semibold"><td>EBITDA</td><td>{money(r.ebitda)}</td></tr>
                <tr className="text-muted-foreground"><td>− Depreciation &amp; amortization</td><td>{money(m.da)}</td></tr>
                <tr className="border-t border-border font-semibold"><td>Operating income (EBIT)</td><td>{money(r.ebit)}</td></tr>
                <tr className="text-muted-foreground"><td>− Interest</td><td>{money(m.interest)}</td></tr>
                <tr className="border-t border-border font-semibold"><td>Pre-tax income</td><td>{money(r.ebt)}</td></tr>
                <tr className="text-muted-foreground"><td>− Taxes</td><td>{money(r.tax)}</td></tr>
                <tr className="border-t-2 border-primary text-base font-bold text-primary"><td>Net income</td><td>{money(r.ni)}</td></tr>
              </tbody>
            </table>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[["Gross margin", pct(r.gp / r.rev)], ["EBITDA margin", pct(r.ebitda / r.rev)], ["Net margin", pct(r.ni / r.rev)], ["EPS", money(r.eps)], ["Operating margin", pct(r.ebit / r.rev)], ["Effective tax", pct(r.tax / r.ebt)], ["Payout ratio", pct(r.payout)], ["Retained", money(r.ni - m.dividends)]].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-accent p-3"><p className="text-[11px] text-muted-foreground">{k}</p><p className="font-semibold text-accent-foreground">{v}</p></div>
              ))}
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {[["Where revenue goes", pie], ["Operating expense mix", opexPie]].map(([title, data]) => (
              <div key={title as string} className="rounded-2xl border border-border bg-card p-5">
                <h3 className="text-xl font-semibold">{title as string}</h3>
                <div className="h-72">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={data as { name: string; value: number }[]} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                        {(data as unknown[]).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => money(v)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">Need a specific ratio? <Link to="/formulas" className="text-primary underline">Browse all formula calculators</Link>.</p>
        </div>
      </div>
    </div>
  );
}
