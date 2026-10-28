// Safe evaluator for user-written equations (no eval). Supports + - * / ^ %,
// parentheses, numbers, variables and functions sqrt, abs, ln, log, exp, min, max, round.
type Tok = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

const FUNCS: Record<string, (...a: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, floor: Math.floor, ceil: Math.ceil,
  sqrt: Math.sqrt, abs: Math.abs, ln: Math.log, log: Math.log10, exp: Math.exp,
  min: Math.min, max: Math.max, round: Math.round,
};

function tokenize(src: string): Tok[] {
  const s = src.replace(/×/g, "*").replace(/÷/g, "/").replace(/[−–]/g, "-");
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (/\s/.test(c)) { i++; continue; }
    const num = s.slice(i).match(/^\d*\.?\d+(e[+-]?\d+)?/i);
    if (num) { out.push({ t: "num", v: parseFloat(num[0]) }); i += num[0].length; continue; }
    const id = s.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (id) { out.push({ t: "id", v: id[0] }); i += id[0].length; continue; }
    if ("+-*/^%(),".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    throw new Error(`Unexpected character "${c}"`);
  }
  return out;
}

/** Variable names used in an equation (excluding functions). */
export function equationVars(src: string): string[] {
  try {
    const toks = tokenize(src);
    const names = toks.filter((t, k) => t.t === "id" && !(FUNCS[t.v] && toks[k + 1]?.v === "(")).map((t) => t.v as string);
    return [...new Set(names)];
  } catch { return []; }
}

export function evaluateEquation(src: string, vars: Record<string, number>): number {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const eat = (v?: string) => { const t = toks[p]; if (!t || (v && t.v !== v)) throw new Error(v ? `Expected "${v}"` : "Unexpected end"); p++; return t; };
  function expr(): number {
    let a = term();
    while (peek()?.t === "op" && (peek()!.v === "+" || peek()!.v === "-")) { const o = eat().v; const b = term(); a = o === "+" ? a + b : a - b; }
    return a;
  }
  function term(): number {
    let a = unary();
    while (peek()?.t === "op" && ["*", "/", "%"].includes(peek()!.v as string)) {
      const o = eat().v; const b = unary();
      a = o === "*" ? a * b : o === "/" ? a / b : a % b;
    }
    return a;
  }
  function unary(): number {
    if (peek()?.v === "-") { eat(); return -unary(); }
    if (peek()?.v === "+") { eat(); return unary(); }
    return power();
  }
  function power(): number {
    const base = atom();
    if (peek()?.v === "^") { eat(); return Math.pow(base, unary()); }
    return base;
  }
  function atom(): number {
    const t = eat();
    if (t.t === "num") return t.v;
    if (t.t === "op" && t.v === "(") { const v = expr(); eat(")"); return v; }
    if (t.t === "id") {
      if (FUNCS[t.v] && peek()?.v === "(") {
        eat("(");
        const args: number[] = [];
        if (peek()?.v !== ")") { args.push(expr()); while (peek()?.v === ",") { eat(); args.push(expr()); } }
        eat(")");
        return FUNCS[t.v]!(...args);
      }
      if (!(t.v in vars)) throw new Error(`Missing value for ${t.v}`);
      return vars[t.v]!;
    }
    throw new Error(`Unexpected "${t.v}"`);
  }
  const v = expr();
  if (p < toks.length) throw new Error(`Unexpected "${toks[p]!.v}"`);
  return v;
}

/** Turns a library formula like "Price × Units Sold" into an editable equation. */
export function toEditable(expr: string): string {
  return expr
    .replace(/×/g, " * ").replace(/÷/g, " / ").replace(/[−–]/g, " - ")
    .replace(/[A-Za-z][A-Za-z0-9 ']*[A-Za-z0-9]|[A-Za-z]/g, (w) => w.trim().replace(/'/g, "").replace(/\s+/g, "_"))
    .replace(/\s+/g, " ").trim();
}
