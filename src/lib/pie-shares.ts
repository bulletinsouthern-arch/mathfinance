import { equationVars, evaluateEquation } from "./equation";

// Splits a formula into the parts that are added or taken away, so the business
// pie compares money, not raw inputs. For Price * Units - Debt with 1,000 × 1,000
// and 5,000 debt, Debt is 5,000 of 1,000,000 (0.5%), not 5,000 of 7,000.
export type Slice = { key: string; vars: string[]; src: string; value: number; share: number; kind: "in" | "out" | "net" | "short" };
export type PieShares = { base: number; gross: string[]; slices: Slice[] };

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

/** Pie slices for a formula, or null when it has no + / − parts (or cannot be worked out). */
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
  const added = sum("in"), taken = sum("out");
  let base = added, gross = parts.filter((p) => p.kind === "in");
  let slices = gross;
  if (taken > 0 && added >= taken) {
    // What is taken away, plus what is left (the result).
    slices = [...parts.filter((p) => p.kind === "out"), { key: "net", vars: [], src: "", value: added - taken, share: 0, kind: "net" }];
  } else if (taken > added) {
    // Costs are bigger than what comes in: show what is covered and the shortfall.
    base = taken;
    gross = parts.filter((p) => p.kind === "out");
    slices = [...parts.filter((p) => p.kind === "in"), { key: "short", vars: [], src: "", value: taken - added, share: 0, kind: "short" }];
  }
  return {
    base,
    gross: gross.map((p) => p.src),
    slices: slices.map((p) => ({ ...p, share: base ? (p.value / base) * 100 : 0 })),
  };
}
