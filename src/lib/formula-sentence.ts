import { equationVars, evaluateEquation } from "./equation";
import { splitTerms } from "./pie-shares";

// Plain-language reading of a business pie formula, so changing a sign (+ − × ÷)
// is explained on screen: "Gross Revenue (₱500,000) MINUS Debt (₱2,000) = ₱498,000 Net Revenue."
export type Segment = { kind: "text" | "op" | "result"; text: string };
export type TermName = { short: string; full: string };
export type FormulaSentence = {
  segments: Segment[];
  /** Sign joining a debt-like unit to the rest of the formula, if any. */
  debtSign: "+" | "-" | null;
  /** Breakdown labels for each top-level term, keyed like pieShares slices ("t0", "t1", …). */
  terms: Record<string, TermName>;
};
export type SentenceContext = {
  label: (k: string) => string;
  /** Formatted input value, e.g. "₱2,000" or "1,000". */
  value: (k: string) => string;
  /** Formatted amount in the formula's output unit, e.g. "₱500,000". */
  money: (n: number) => string;
  outputLabel: string;
  result: number | null;
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

export function formulaSentence(expr: string, nums: Record<string, number>, ctx: SentenceContext): FormulaSentence {
  const vars = equationVars(expr);
  const terms = splitTerms(expr);
  const segments: Segment[] = [];
  const names: Record<string, TermName> = {};
  let debtSign: "+" | "-" | null = null;
  const revenueLike = IS_REVENUE.test(ctx.outputLabel) || !ctx.outputLabel;
  let grossUsed = false;

  terms.forEach((t, i) => {
    const tv = equationVars(t.src);
    const debt = tv.some((k) => isDebt(k) || isDebt(ctx.label(k)));
    if (i > 0) {
      segments.push({ kind: "op", text: t.sign < 0 ? "MINUS" : "PLUS" });
      if (debt && debtSign === null) debtSign = t.sign < 0 ? "-" : "+";
    }
    const single = ID.test(t.src.trim()) && vars.includes(t.src.trim());
    const plain = single ? ctx.label(t.src.trim()) : wordsName(t.src, vars, ctx);
    let short = plain;
    let full = plain;
    if (terms.length > 1 && !single && tv.length >= 2 && t.sign > 0 && !grossUsed && revenueLike && !debt) {
      grossUsed = true;
      short = "Gross Revenue";
      full = `Gross Revenue (${plain})`;
      let v: number | null = null;
      try { v = evaluateEquation(t.src, nums); } catch { /* shown as words below */ }
      if (v !== null && Number.isFinite(v)) segments.push({ kind: "text", text: `Gross Revenue (${ctx.money(v)})` });
      else segments.push(...words(t.src, vars, ctx));
    } else {
      segments.push(...words(t.src, vars, ctx));
    }
    if (i > 0 && t.sign < 0) { short = `Less: ${short}`; full = `Less: ${full}`; }
    else if (i > 0 && debt) { short = `Add: ${short}`; full = `Add: ${full}`; }
    names[`t${i}`] = { short, full };
  });

  if (ctx.result !== null && segments.length) {
    const label = ctx.outputLabel.trim() || "Result";
    const hasMinus = terms.some((t, i) => i > 0 && t.sign < 0);
    const name = debtSign === "+" && !hasMinus ? "Total Base Pool" : hasMinus && revenueLike && !/^net\b/i.test(label) ? `Net ${label}` : label;
    segments.push({ kind: "op", text: "=" }, { kind: "result", text: `${ctx.money(ctx.result)} ${name}` });
  }
  return { segments, debtSign, terms: names };
}

/** The sentence as plain text, e.g. for screen readers and tests. */
export const sentenceText = (s: FormulaSentence) => `${s.segments.map((x) => x.text).join(" ")}.`;
