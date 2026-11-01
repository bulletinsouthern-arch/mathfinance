import { equationVars, evaluateEquation } from "./equation";

// The business pie has two views, and each works out one Total Pool Base that the
// ring centre, the formula sentence and every share in the breakdown all use:
// - Raw Input Share: the formula applied straight to the typed boxes
//   (Price × Units Sold − Debt = 498,000), each box shown as its value ÷ that base.
// - Financial Reality: Gross Revenue (Price × Units Sold) joined to Debt by its sign
//   (₱500,000 − ₱2,000 = ₱498,000), each part shown as its value ÷ that base.
export type PieMode = "raw" | "financial";
export type PoolOp = "+" | "-" | "*" | "/";
export type PoolItem = {
  key: string;
  vars: string[];
  src: string;
  /** Size of the part (always positive). */
  value: number;
  /** value ÷ base × 100; can pass 100% or go negative when a sign shrinks or flips the pool. */
  share: number;
  role: "gross" | "debt" | "input";
  /** Sign joining this part to the pool (null for the first part). */
  op: PoolOp | null;
};
export type Pool = {
  mode: PieMode;
  /** Total Pool Base, or null when it cannot be worked out (e.g. ÷ 0). */
  base: number | null;
  items: PoolItem[];
  /** Financial Reality: the Gross Revenue part and the sign joining Debt to it. */
  gross: { src: string; value: number } | null;
  debt: { key: string; value: number; op: PoolOp } | null;
};

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
      if (unarySign(s, i)) continue;
      out.push({ sign, src: s.slice(start, i).trim() });
      sign = c === "+" ? 1 : -1;
      start = i + 1;
    }
  }
  out.push({ sign, src: s.slice(start).trim() });
  return out;
}

/** A sign after an operator or at the start is part of the number (e.g. "-5" or "a * -b"); so is "1e-5". */
function unarySign(s: string, i: number) {
  const before = s.slice(0, i).trimEnd();
  return !/[A-Za-z0-9_).]$/.test(before) || /(^|[^A-Za-z0-9_.])[\d.]+e$/i.test(before);
}

/**
 * The last unit joined at the top level, e.g. "Price * Units_Sold - Debt" → "Price * Units_Sold", "-", "Debt".
 * Null when the formula does not end in "<something> <+ − × ÷> <unit>".
 */
export function splitLast(expr: string): { left: string; op: PoolOp; right: string } | null {
  const s = expr.replace(/[−–]/g, "-").replace(/×/g, "*").replace(/÷/g, "/");
  let depth = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    const c = s[i]!;
    if (c === ")") depth++;
    else if (c === "(") depth--;
    else if (depth === 0 && "+-*/".includes(c)) {
      if ((c === "+" || c === "-") && unarySign(s, i)) continue;
      const right = s.slice(i + 1).trim();
      const left = s.slice(0, i).trim();
      return /^[A-Za-z_][A-Za-z0-9_]*$/.test(right) && left ? { left, op: c as PoolOp, right } : null;
    }
  }
  return null;
}

export function applyOp(a: number, op: PoolOp, b: number) {
  return op === "+" ? a + b : op === "-" ? a - b : op === "*" ? a * b : a / b;
}

const finite = (n: number) => (Number.isFinite(n) ? n : null);
const shareOf = (value: number, base: number | null) => (base ? (value / base) * 100 : 0);

/**
 * Raw Input Share: Total Pool Base = the formula applied to the typed boxes
 * (500 × 1,000 − 2,000 = 498,000), and each box's share = box ÷ base × 100.
 * `show` picks which boxes get a row (e.g. leave out % rates).
 */
export function rawPool(expr: string, nums: Record<string, number>, show: (k: string) => boolean = () => true): Pool {
  let base: number | null = null;
  try { base = finite(evaluateEquation(expr, nums)); } catch { /* base stays unknown */ }
  const vars = equationVars(expr);
  const items = vars.filter(show).map((k, i): PoolItem => {
    const value = Math.abs(Number.isFinite(nums[k]) ? nums[k]! : 0);
    const op = i === 0 ? null : (expr.replace(/[−–]/g, "-").match(opBefore(k))?.[1] as PoolOp | undefined) ?? null;
    return { key: k, vars: [k], src: k, value, share: shareOf(value, base), role: "input", op };
  });
  return { mode: "raw", base, items, gross: null, debt: null };
}

const opBefore = (k: string) => new RegExp(`([-+*/])\\s*(?=(?<![A-Za-z0-9_])${k.replace(/[^A-Za-z0-9_]/g, "")}(?![A-Za-z0-9_]))`);

/**
 * Financial Reality: Gross Revenue = everything before the last unit (e.g. Price × Units Sold),
 * then Total Pool Base = Gross Revenue <sign> Debt for whichever of + − × ÷ joins Debt.
 * Each part's share = part ÷ base × 100, so ₱2,000 − debt on ₱500,000 is 0.4% of ₱498,000.
 * Without a "<gross> <sign> <unit>" shape the whole formula is the gross part (100%).
 */
export function financialPool(expr: string, nums: Record<string, number>): Pool {
  const split = splitLast(expr);
  const evalOr = (src: string) => { try { return finite(evaluateEquation(src, nums)); } catch { return null; } };
  if (!split) {
    const base = evalOr(expr);
    const value = Math.abs(base ?? 0);
    return {
      mode: "financial",
      base,
      items: [{ key: "__gross", vars: equationVars(expr), src: expr, value, share: shareOf(value, base), role: "gross", op: null }],
      gross: { src: expr, value: base ?? 0 },
      debt: null,
    };
  }
  const gross = evalOr(split.left);
  const debt = Number.isFinite(nums[split.right]) ? nums[split.right]! : 0;
  const base = gross === null ? null : finite(applyOp(gross, split.op, debt));
  const g = Math.abs(gross ?? 0), d = Math.abs(debt);
  return {
    mode: "financial",
    base,
    items: [
      { key: "__gross", vars: equationVars(split.left), src: split.left, value: g, share: shareOf(g, base), role: "gross", op: null },
      { key: split.right, vars: [split.right], src: split.right, value: d, share: shareOf(d, base), role: "debt", op: split.op },
    ],
    gross: { src: split.left, value: gross ?? 0 },
    debt: { key: split.right, value: debt, op: split.op },
  };
}

export const totalPool = (mode: PieMode, expr: string, nums: Record<string, number>, show?: (k: string) => boolean) =>
  mode === "financial" ? financialPool(expr, nums) : rawPool(expr, nums, show);

/**
 * Ring segments sized by each part's share of the base. When the shares add up to less
 * than 100% (e.g. after × or ÷) the rest of the ring is a "Rest of pool" gap, so the
 * drawn segments always match the percentages in the list.
 */
export function ringSlices(pool: Pool): { key: string; value: number; rest?: true }[] {
  if (!pool.base) return [];
  const slices = pool.items.map((p) => ({ key: p.key, value: Math.abs(p.share) })).filter((p) => p.value > 0);
  const used = slices.reduce((a, p) => a + p.value, 0);
  return used > 0 && used < 99.999 ? [...slices, { key: "__rest", value: 100 - used, rest: true as const }] : slices;
}
