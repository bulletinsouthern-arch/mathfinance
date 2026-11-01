import { equationVars, evaluateEquation } from "./equation";

// The business pie has two views. Each works out one Total Pool Base (the formula's
// result) for the ring centre and the formula sentence, and splits the ring between
// exactly the parts the student set, so the shares always add up to 100%:
// - Raw Input Share: one part per typed box (Price, Units Sold, Debt); each share is
//   the box ÷ the sum of the boxes, and the base is the formula applied to the boxes.
// - Financial Reality: everything is measured out of Gross Revenue (Price × Units Sold = 100%).
//   The rows are "Gross Revenue (100%)" and "Less: Debt" (Debt ÷ Gross Revenue); the ring is the
//   net part (green) plus a Debt sliver (red). The "net" view shows only the net result (100%).
//   It never reuses the typed-box shares of Raw Input Share.
export type PieMode = "raw" | "financial";
export type FinancialView = "deduction" | "net";
export type PoolOp = "+" | "-" | "*" | "/";
export type PoolItem = {
  key: string;
  vars: string[];
  src: string;
  /** Size of the part (always positive). */
  value: number;
  /** Raw: value ÷ the sum of all parts × 100. Financial: value ÷ Gross Revenue × 100. */
  share: number;
  role: "gross" | "debt" | "net" | "input";
  /** Sign joining this part to the pool (null for the first part). */
  op: PoolOp | null;
};
export type Pool = {
  mode: PieMode;
  /** Total Pool Base, or null when it cannot be worked out (e.g. ÷ 0). */
  base: number | null;
  items: PoolItem[];
  /** Ring segments (key matches an item, or "__net" for the part left after Debt), in %. */
  slices: { key: string; value: number }[];
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
/** Each part's share of the parts' combined size (all zero when nothing is typed yet). */
function withShares(items: Omit<PoolItem, "share">[]): PoolItem[] {
  const sum = items.reduce((a, p) => a + p.value, 0);
  return items.map((p) => ({ ...p, share: sum > 0 ? (p.value / sum) * 100 : 0 }));
}

/**
 * Raw Input Share: Total Pool Base = the formula applied to the typed boxes
 * (500 × 1,000 − 2,000 = 498,000), and each box's share = box ÷ (sum of the boxes) × 100.
 * `show` picks which boxes get a row (e.g. leave out % rates).
 */
export function rawPool(expr: string, nums: Record<string, number>, show: (k: string) => boolean = () => true): Pool {
  let base: number | null = null;
  try { base = finite(evaluateEquation(expr, nums)); } catch { /* base stays unknown */ }
  const vars = equationVars(expr);
  const items = vars.filter(show).map((k, i) => {
    const value = Math.abs(Number.isFinite(nums[k]) ? nums[k]! : 0);
    const op = i === 0 ? null : (expr.replace(/[−–]/g, "-").match(opBefore(k))?.[1] as PoolOp | undefined) ?? null;
    return { key: k, vars: [k], src: k, value, role: "input" as const, op };
  });
  const shared = withShares(items);
  return { mode: "raw", base, items: shared, slices: shared.map((p) => ({ key: p.key, value: p.share })), gross: null, debt: null };
}

const opBefore = (k: string) => new RegExp(`([-+*/])\\s*(?=(?<![A-Za-z0-9_])${k.replace(/[^A-Za-z0-9_]/g, "")}(?![A-Za-z0-9_]))`);

/**
 * Financial Reality: Gross Revenue = everything before the last unit (e.g. Price × Units Sold),
 * then Total Pool Base = Gross Revenue <sign> Debt for whichever of + − × ÷ joins Debt.
 * Shares are out of Gross Revenue: ₱5,000 × 1,000 − ₱1,000 gives Gross Revenue 100% and
 * Less: Debt 0.02%, and the ring is 99.98% net (green) with a 0.02% Debt sliver (red).
 * `view: "net"` shows only the result (₱4,999,000 = 100%) without a Debt row.
 * Without a "<gross> <sign> <unit>" shape the whole formula is the gross part (100%).
 */
export function financialPool(expr: string, nums: Record<string, number>, view: FinancialView = "deduction"): Pool {
  const split = splitLast(expr);
  const evalOr = (src: string) => { try { return finite(evaluateEquation(src, nums)); } catch { return null; } };
  const whole = (key: string, src: string, value: number | null, role: "gross" | "net", base: number | null, debt: Pool["debt"]): Pool => {
    const v = Math.abs(value ?? 0);
    return {
      mode: "financial",
      base,
      items: [{ key, vars: equationVars(src), src, value: v, share: v > 0 ? 100 : 0, role, op: null }],
      slices: v > 0 ? [{ key, value: 100 }] : [],
      gross: { src, value: value ?? 0 },
      debt,
    };
  };
  if (!split) return whole("__gross", expr, evalOr(expr), "gross", evalOr(expr), null);
  const gross = evalOr(split.left);
  const debt = Number.isFinite(nums[split.right]) ? nums[split.right]! : 0;
  const base = gross === null ? null : finite(applyOp(gross, split.op, debt));
  const debtInfo = { key: split.right, value: debt, op: split.op };
  if (view === "net") return { ...whole("__net", expr, base, "net", base, debtInfo), gross: { src: split.left, value: gross ?? 0 } };
  const g = Math.abs(gross ?? 0), d = Math.abs(debt);
  const debtShare = g > 0 ? (d / g) * 100 : 0;
  // A deduction eats into Gross Revenue (net + debt = 100%); any other sign sits next to it.
  const slices = g === 0
    ? []
    : split.op === "-"
      ? [{ key: "__net", value: Math.max(0, 100 - debtShare) }, { key: split.right, value: Math.min(100, debtShare) }]
      : [{ key: "__gross", value: (g / (g + d)) * 100 }, { key: split.right, value: (d / (g + d)) * 100 }];
  return {
    mode: "financial",
    base,
    items: [
      { key: "__gross", vars: equationVars(split.left), src: split.left, value: g, share: g > 0 ? 100 : 0, role: "gross", op: null },
      { key: split.right, vars: [split.right], src: split.right, value: d, share: debtShare, role: "debt", op: split.op },
    ],
    slices: slices.filter((x) => x.value > 0),
    gross: { src: split.left, value: gross ?? 0 },
    debt: debtInfo,
  };
}

export const totalPool = (mode: PieMode, expr: string, nums: Record<string, number>, show?: (k: string) => boolean, view?: FinancialView) =>
  mode === "financial" ? financialPool(expr, nums, view) : rawPool(expr, nums, show);

/** Ring segments for the selected tab (no filler segment). */
export function ringSlices(pool: Pool): { key: string; value: number }[] {
  return pool.slices.filter((p) => p.value > 0);
}
