import { equationVars } from "./equation";
import type { Pool, PoolOp } from "./pie-shares";

// Plain-language reading of a business pie formula, so changing a sign (+ − × ÷)
// is explained on screen: "Gross Revenue (₱500,000) MINUS Debt (₱2,000) = ₱498,000 Net Revenue."
export type Segment = { kind: "text" | "op" | "result"; text: string };
export type TermName = { short: string; full: string };
export type FormulaSentence = {
  segments: Segment[];
  /** Sign joining a debt-like unit to the rest of the formula, if any. */
  debtSign: "+" | "-" | null;
  /** Breakdown labels for each pool item, keyed like Pool items ("gross", "Debt", …). */
  terms: Record<string, TermName>;
};
export type SentenceContext = {
  label: (k: string) => string;
  /** Formatted input value, e.g. "₱2,000" or "1,000". */
  value: (k: string) => string;
  /** Formatted amount in the formula's output unit, e.g. "₱500,000". */
  money: (n: number) => string;
  outputLabel: string;
};

export const OP_WORDS: Record<string, string> = { "+": "PLUS", "-": "MINUS", "*": "TIMES", "/": "DIVIDED BY", "^": "TO THE POWER OF", "%": "MOD" };
export const isDebt = (s: string) => /debt|loan|liabilit|utang|owed|payable/i.test(s);
const IS_REVENUE = /revenue|income|sales|profit|earning|kita/i;

const ID = /^[A-Za-z_][A-Za-z0-9_]*$/;
const strip = (s: string) => s.replace(/×/g, "*").replace(/÷/g, "/").replace(/[−–]/g, "-");

/** Word-by-word reading of an expression: "Price * Units" → "Price (₱500) TIMES Units (1,000)". */
function words(src: string, vars: string[], ctx: SentenceContext): Segment[] {
  const out: Segment[] = [];
  const toks = strip(src).match(/[A-Za-z_][A-Za-z0-9_]*|\d*\.?\d+(?:e[+-]?\d+)?|\S/gi) ?? [];
  toks.forEach((t, i) => {
    const prev = toks[i - 1];
    const unary = t === "-" && (i === 0 || (prev !== undefined && /^[-+*/^%(,]$/.test(prev)));
    if (unary) out.push({ kind: "op", text: "NEGATIVE" });
    else if (OP_WORDS[t]) out.push({ kind: "op", text: OP_WORDS[t]! });
    else if (vars.includes(t)) out.push({ kind: "text", text: `${ctx.label(t)} (${ctx.value(t)})` });
    else if (/^\d/.test(t) || t.startsWith(".")) out.push({ kind: "text", text: Number(t).toLocaleString(undefined, { maximumFractionDigits: 6 }) });
    else out.push({ kind: "text", text: t });
  });
  return out;
}

/** Shows the formula's operators with unit names, e.g. "Price per Unit × Units Sold". */
function wordsName(src: string, vars: string[], ctx: SentenceContext) {
  return strip(src)
    .replace(/[A-Za-z_][A-Za-z0-9_]*/g, (k) => (vars.includes(k) ? ctx.label(k) : k))
    .replace(/\*/g, "×").replace(/\//g, "÷").replace(/-/g, "−")
    .replace(/\s+/g, " ").trim();
}

const LINK: Record<PoolOp, string> = { "+": "Add", "-": "Less", "*": "Times", "/": "Divided by" };

/**
 * Reads the same Total Pool Base the ring and breakdown use, so the three never disagree.
 * Raw Input Share: "Price per Unit (₱500) TIMES Units Sold (1,000) MINUS Debt (₱2,000) = ₱498,000 Total Pool Base."
 * Financial Reality: "Gross Revenue (₱500,000) MINUS Debt (₱2,000) = ₱498,000 Net Revenue (Total Pool Base)."
 */
export function formulaSentence(expr: string, pool: Pool, ctx: SentenceContext): FormulaSentence {
  const vars = equationVars(expr);
  const revenueLike = IS_REVENUE.test(ctx.outputLabel) || !ctx.outputLabel;
  const debtLike = (k: string) => isDebt(k) || isDebt(ctx.label(k));
  const names: Record<string, TermName> = {};
  const segments: Segment[] = [];
  let debtSign: "+" | "-" | null = null;

  if (pool.mode === "raw") {
    segments.push(...words(expr, vars, ctx));
    for (const it of pool.items) {
      const name = it.op === "-" ? `Less: ${ctx.label(it.key)}` : ctx.label(it.key);
      names[it.key] = { short: name, full: name };
      if (debtSign === null && debtLike(it.key) && (it.op === "+" || it.op === "-")) debtSign = it.op;
    }
  } else {
    // The "net only" view has no gross row, but the sentence still reads Gross Revenue − Debt = Net.
    const gross = pool.items.find((it) => it.role === "gross")
      ?? (pool.gross && pool.debt ? { key: "__gross", src: pool.gross.src, vars: equationVars(pool.gross.src) } : null);
    if (gross) {
      const single = ID.test(gross.src.trim()) && vars.includes(gross.src.trim());
      const plain = single ? ctx.label(gross.src.trim()) : wordsName(gross.src, vars, ctx);
      const isGross = !single && gross.vars.length >= 2 && revenueLike && !gross.vars.some(debtLike);
      names[gross.key] = isGross ? { short: "Gross Revenue", full: `Gross Revenue (${plain})` } : { short: plain, full: plain };
      if (!pool.debt) segments.push(...words(gross.src, vars, ctx));
      else if (single) segments.push({ kind: "text", text: `${plain} (${ctx.value(gross.src.trim())})` });
      else segments.push({ kind: "text", text: `${isGross ? "Gross Revenue" : plain} (${ctx.money(pool.gross!.value)})` });
    }
    const debt = pool.debt;
    if (debt) {
      const label = ctx.label(debt.key);
      names[debt.key] = { short: `${LINK[debt.op]}: ${label}`, full: `${LINK[debt.op]}: ${label}` };
      segments.push({ kind: "op", text: OP_WORDS[debt.op]! }, { kind: "text", text: `${label} (${ctx.value(debt.key)})` });
      if (debtLike(debt.key) && (debt.op === "+" || debt.op === "-")) debtSign = debt.op;
    }
  }

  if (pool.base !== null && segments.length) {
    const label = ctx.outputLabel.trim() || "Revenue";
    const net = pool.mode === "financial" && pool.debt?.op === "-" && revenueLike;
    const netLabel = /^net\b/i.test(label) ? label : `Net ${label}`;
    const name = net ? `${netLabel} (Total Pool Base)` : "Total Pool Base";
    if (pool.mode === "financial") names["__net"] = { short: net ? netLabel : "Result", full: net ? `${netLabel} (after ${ctx.label(pool.debt!.key)})` : "Result" };
    segments.push({ kind: "op", text: "=" }, { kind: "result", text: `${ctx.money(pool.base)} ${name}` });
  }
  return { segments, debtSign, terms: names };
}

/** The sentence as plain text, e.g. for screen readers and tests. */
export const sentenceText = (s: FormulaSentence) => `${s.segments.map((x) => x.text).join(" ")}.`;
