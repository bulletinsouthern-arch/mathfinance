import { equationVars, evaluateEquation } from "./equation";

// The business pie has two views. Raw Input Share adds the typed numbers together;
// Financial Reality splits the formula into money added (revenue) and money taken
// away (debt), so a ₱2,000 debt on ₱500,000 of sales is 0.4%, not 57.1%.
export type Slice = { key: string; vars: string[]; src: string; value: number; share: number; kind: "in" | "out" };
export type PieShares = { base: number; revenue: number; debt: number; debtToRevenue: number | null; gross: string[]; slices: Slice[] };

/** Top-level terms joined by + or −, e.g. "a * b - (c + d)" → [+ "a * b", − "(c + d)"]. */
export function splitTerms(expr: string): { sign: 1 | -1; src: string }[] {
  const s = expr.replace(/[−–]/g, "-");
  const out: { sign: 1 | -1; src: string }[] = [];
  let depth = 0, start = 0, sign: 1 | -1 = 1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (depth === 0 && (c === "+" || c === "-")) {
      const before = s.slice(0, i).trimEnd();
      // A sign after an operator or at the start is part of the number (e.g. "-5" or "a * -b"); so is "1e-5".
      if (!/[A-Za-z0-9_).]$/.test(before) || /(^|[^A-Za-z0-9_.])[\d.]+e$/i.test(before)) continue;
      out.push({ sign, src: s.slice(start, i).trim() });
      sign = c === "+" ? 1 : -1;
      start = i + 1;
    }
  }
  out.push({ sign, src: s.slice(start).trim() });
  return out;
}

export type PieMode = "raw" | "financial";

/** Raw Input Share: each box's typed value out of all boxes added together (500 + 1,000 + 2,000 → Debt 57.1%). */
export function rawShares(nums: Record<string, number>): Slice[] {
  const parts = Object.entries(nums).map(([k, n]) => ({ key: k, vars: [k], src: k, value: Number.isFinite(n) ? Math.abs(n) : 0 }));
  const total = parts.reduce((a, p) => a + p.value, 0);
  return parts.map((p) => ({ ...p, share: total ? (p.value / total) * 100 : 0, kind: "in" as const }));
}

/**
 * Financial Reality: money coming in (e.g. revenue = Price × Units) against money taken away (e.g. Debt).
 * Base = revenue + debt, so 500 × 1,000 with 2,000 debt gives Revenue 99.6% and Debt 0.4%.
 * debtToRevenue is debt as a percentage of gross revenue (2,000 ÷ 500,000 = 0.4%).
 * Null when the formula has no + / − parts (or cannot be worked out).
 */
export function pieShares(expr: string, nums: Record<string, number>): PieShares | null {
  const terms = splitTerms(expr);
  if (terms.length < 2) return null;
  const parts: Slice[] = [];
  for (const [i, t] of terms.entries()) {
    let v: number;
    try { v = t.sign * evaluateEquation(t.src, nums); } catch { return null; }
    if (!Number.isFinite(v)) return null;
    parts.push({ key: `t${i}`, vars: equationVars(t.src), src: t.src, value: Math.abs(v), share: 0, kind: v < 0 ? "out" : "in" });
  }
  const sum = (k: Slice["kind"]) => parts.filter((p) => p.kind === k).reduce((a, p) => a + p.value, 0);
  const revenue = sum("in"), debt = sum("out");
  const base = revenue + debt;
  return {
    base,
    revenue,
    debt,
    debtToRevenue: revenue ? (debt / revenue) * 100 : null,
    gross: parts.filter((p) => p.kind === "in").map((p) => p.src),
    slices: [...parts.filter((p) => p.kind === "in"), ...parts.filter((p) => p.kind === "out")]
      .map((p) => ({ ...p, share: base ? (p.value / base) * 100 : 0 })),
  };
}
