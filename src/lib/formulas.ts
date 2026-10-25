// Formula library: every formula is data + a pure calculation function.
export type Unit = "$" | "%" | "x" | "d" | "u" | "" | "yrs" | "mo";
export type FormulaInput = { key: string; label: string; def: number | string; pct: boolean; list: boolean };
export type Formula = {
  id: string;
  cat: number;
  name: string;
  expr: string;
  inputs: FormulaInput[];
  unit: Unit;
  calc: (v: Record<string, any>) => number;
};

export const CATEGORIES: { id: number; name: string; blurb: string }[] = [
  { id: 1, name: "Income, Margins & Statutory Reports", blurb: "Profit & loss lines, margins, EPS and tax shields." },
  { id: 2, name: "Capital Return, Efficiency & Value Creation", blurb: "ROIC, ROE, WACC, EVA, DuPont and beta." },
  { id: 3, name: "Liquidity, Debt & Balance Sheet Health", blurb: "Liquidity, leverage, coverage and distress scores." },
  { id: 4, name: "Supply Chain, Costing & Operations Optimization", blurb: "EOQ, break-even, contribution and variances." },
  { id: 5, name: "Long-Term Capital Projects, M&A & Valuation", blurb: "NPV, IRR, DCF, multiples and deal math." },
  { id: 6, name: "Advanced Cost Accounting & Variance Math", blurb: "Variances, joint costing, process costing." },
  { id: 7, name: "Quantitative Asset Performance & Portfolio Risk", blurb: "Alpha, Sharpe, VaR, CAPM and factor models." },
  { id: 8, name: "Currency Hedging & Global Treasury Risk", blurb: "Parity, cross rates, FX options and exposure." },
  { id: 9, name: "Micro-Operations, Lead Time & Factory Planning", blurb: "OEE, Little's Law, takt and scrap." },
  { id: 10, name: "Executive Compensation & Capital Restructuring", blurb: "Black-Scholes, Greeks, M&M and APV." },
  { id: 11, name: "Customer Economics & SaaS Product Math", blurb: "CAC, CLV, MRR, churn and runway." },
  { id: 12, name: "Corporate Lease, Property & Real Estate Assets", blurb: "NOI, cap rate, LTV and lease accounting." },
  { id: 13, name: "Stochastic Supply Chain & Yield Engineering", blurb: "Newsvendor, fill rate and shortage math." },
  { id: 14, name: "Financial Math Mechanics (Time Value & Annuities)", blurb: "Annuities, perpetuities, APR/EAR and PMT." },
  { id: 15, name: "Strategic Restructuring & Bankruptcy Analytics", blurb: "O-Score, Springate, Zmijewski and MCC." },
  { id: 16, name: "Macro-Economic & Market Indicator Math", blurb: "HHI, CPI, GDP deflator, multipliers, Gini." },
  { id: 17, name: "Advanced Actuarial Risk & Insurance Math", blurb: "Loss, expense and combined ratios, reserves." },
  { id: 18, name: "Human Resources, Payroll & Workforce Economics", blurb: "Per-employee economics, turnover, HCROI." },
  { id: 19, name: "Deep Statistical Operations & Predictive Data Science", blurb: "Regression, R², errors, chi-square, z-scores." },
  { id: 20, name: "REIT & Fixed Asset Valuation", blurb: "FFO, AFFO, NAV, LTC and residual land value." },
  { id: 21, name: "Advanced Supply Chain & Multi-Echelon Logistics", blurb: "Bullwhip, OTIF, perfect order and turns." },
  { id: 22, name: "Digital Media, Marketing ROI & Attribution Math", blurb: "ROAS, CTR, CPC, CPM, CPA, NPS and CSAT." },
  { id: 23, name: "Startup, Venture & Corporate Structure", blurb: "Valuation, cap tables, dilution, runway, EVA and EV bridges." },
];

// ---------- math helpers ----------
export const nums = (s: any): number[] =>
  String(s ?? "").split(/[,\s;]+/).map(Number).filter((n) => Number.isFinite(n));
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const mean = (a: number[]) => (a.length ? sum(a) / a.length : NaN);
const variance = (a: number[], sample = true) => {
  const m = mean(a);
  return sum(a.map((x) => (x - m) ** 2)) / (a.length - (sample ? 1 : 0));
};
const sd = (a: number[]) => Math.sqrt(variance(a));
export function normCdf(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}
const normPdf = (x: number) => Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI);
export const npv = (r: number, cfs: number[]) => sum(cfs.map((c, t) => c / (1 + r) ** t));
export function irr(cfs: number[]) {
  let lo = -0.9999, hi = 10;
  const f = (r: number) => npv(r, cfs);
  if (f(lo) * f(hi) > 0) return NaN;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}
function bs(S: number, K: number, T: number, r: number, s: number) {
  const d1 = (Math.log(S / K) + (r + (s * s) / 2) * T) / (s * Math.sqrt(T));
  const d2 = d1 - s * Math.sqrt(T);
  return { d1, d2 };
}
function regress(x: number[], y: number[]) {
  const mx = mean(x), my = mean(y);
  const b1 = sum(x.map((xi, i) => (xi - mx) * (y[i]! - my))) / sum(x.map((xi) => (xi - mx) ** 2));
  const b0 = my - b1 * mx;
  const ssr = sum(y.map((yi, i) => (yi - (b0 + b1 * x[i]!)) ** 2));
  const sst = sum(y.map((yi) => (yi - my) ** 2));
  return { b1, b0, r2: 1 - ssr / sst };
}
function payback(cfs: number[], r = 0) {
  let cum = 0;
  for (let t = 0; t < cfs.length; t++) {
    const c = cfs[t]! / (1 + r) ** t;
    if (cum + c >= 0 && t > 0) return t - 1 + -cum / c;
    cum += c;
  }
  return NaN;
}
function gini(a: number[]) {
  const s = [...a].sort((x, y) => x - y);
  const n = s.length;
  return sum(s.map((x, i) => (2 * (i + 1) - n - 1) * x)) / (n * sum(s));
}

// ---------- registry ----------
export const FORMULAS: Formula[] = [];
function parse(spec: string): FormulaInput[] {
  if (!spec) return [];
  return spec.split("|").map((p) => {
    const [kRaw = "", rest = ""] = p.split(":");
    const [label, def = ""] = rest.split("=");
    const list = kRaw.startsWith("*");
    const pct = kRaw.endsWith("%");
    const key = kRaw.replace(/^\*/, "").replace(/%$/, "");
    return { key, label: label + (pct ? " (%)" : ""), def: list ? def : Number(def || 0), pct, list };
  });
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
function f(cat: number, name: string, expr: string, spec: string, calc: (v: any) => number, unit: Unit = "") {
  let id = `${cat}-${slug(name)}`;
  while (FORMULAS.some((x) => x.id === id)) id += "-2";
  FORMULAS.push({ id, cat, name, expr, inputs: parse(spec), unit, calc });
}
export function compute(fm: Formula, raw: Record<string, string>) {
  const v: Record<string, any> = {};
  for (const i of fm.inputs) {
    const r = raw[i.key] ?? String(i.def);
    if (i.list) v[i.key] = nums(r);
    else { const n = Number(r); v[i.key] = i.pct ? n / 100 : n; }
  }
  try { return fm.calc(v); } catch { return NaN; }
}
export function formatResult(n: number, unit: Unit) {
  if (!Number.isFinite(n)) return "—";
  const fmt = (x: number, d = 2) => x.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: Math.abs(x) < 1000 ? Math.min(d, 2) : 0 });
  switch (unit) {
    case "$": return (n < 0 ? "-₱" : "₱") + fmt(Math.abs(n));
    case "%": return fmt(n * 100) + "%";
    case "x": return fmt(n, 3) + "×";
    case "d": return fmt(n) + " days";
    case "u": return fmt(n) + " units";
    case "yrs": return fmt(n) + " years";
    case "mo": return fmt(n, 1) + " months";
    default: return fmt(n, 4);
  }
}

// ================= 1. Income, Margins & Statutory =================
const C1 = 1;
f(C1, "Revenue", "Price × Units Sold", "p:Price per Unit=50|q:Units Sold=10000", (v) => v.p * v.q, "$");
f(C1, "Cost of Goods Sold (COGS)", "Beginning Inventory + Purchases − Ending Inventory", "bi:Beginning Inventory=40000|pu:Purchases=220000|ei:Ending Inventory=35000", (v) => v.bi + v.pu - v.ei, "$");
f(C1, "Gross Profit", "Revenue − COGS", "rev:Revenue=500000|cogs:COGS=225000", (v) => v.rev - v.cogs, "$");
f(C1, "Operating Expenses (OPEX)", "SG&A + R&D + D&A", "sga:SG&A=120000|rd:R&D=30000|da:D&A=20000", (v) => v.sga + v.rd + v.da, "$");
f(C1, "Operating Income (EBIT)", "Gross Profit − OPEX", "gp:Gross Profit=275000|opex:OPEX=170000", (v) => v.gp - v.opex, "$");
f(C1, "Interest Expense", "Average Debt × Interest Rate", "debt:Average Debt=300000|r%:Interest Rate=6", (v) => v.debt * v.r, "$");
f(C1, "Pre-Tax Income (EBT)", "EBIT − Interest Expense", "ebit:EBIT=105000|int:Interest Expense=18000", (v) => v.ebit - v.int, "$");
f(C1, "Income Tax Expense", "EBT × Tax Rate", "ebt:EBT=87000|t%:Tax Rate=21", (v) => v.ebt * v.t, "$");
f(C1, "Net Income", "EBT − Income Tax", "ebt:EBT=87000|tax:Income Tax=18270", (v) => v.ebt - v.tax, "$");
f(C1, "EBITDA", "EBIT + Depreciation + Amortization", "ebit:EBIT=105000|dep:Depreciation=15000|am:Amortization=5000", (v) => v.ebit + v.dep + v.am, "$");
f(C1, "NOPAT", "EBIT × (1 − Tax Rate)", "ebit:EBIT=105000|t%:Tax Rate=21", (v) => v.ebit * (1 - v.t), "$");
f(C1, "Retained Earnings", "Beginning RE + Net Income − Dividends", "bre:Beginning RE=200000|ni:Net Income=68730|div:Dividends=20000", (v) => v.bre + v.ni - v.div, "$");
f(C1, "Basic Earnings Per Share (EPS)", "(Net Income − Preferred Dividends) ÷ Weighted Avg Shares", "ni:Net Income=68730|pd:Preferred Dividends=0|sh:Weighted Avg Shares=50000", (v) => (v.ni - v.pd) / v.sh, "$");
f(C1, "Diluted Earnings Per Share (Diluted EPS)", "(NI − Pref Div) ÷ (Shares + Dilutive Securities)", "ni:Net Income=68730|pd:Preferred Dividends=0|sh:Weighted Avg Shares=50000|dil:Dilutive Shares=5000", (v) => (v.ni - v.pd) / (v.sh + v.dil), "$");
f(C1, "Dividend Payout Ratio", "Dividends ÷ Net Income", "div:Dividends=20000|ni:Net Income=68730", (v) => v.div / v.ni, "%");
f(C1, "Retention Rate (Plowback Ratio)", "1 − Dividends ÷ Net Income", "div:Dividends=20000|ni:Net Income=68730", (v) => 1 - v.div / v.ni, "%");
f(C1, "Gross Profit Margin", "Gross Profit ÷ Revenue", "gp:Gross Profit=275000|rev:Revenue=500000", (v) => v.gp / v.rev, "%");
f(C1, "Operating Profit Margin", "EBIT ÷ Revenue", "ebit:EBIT=105000|rev:Revenue=500000", (v) => v.ebit / v.rev, "%");
f(C1, "Pre-Tax Profit Margin", "EBT ÷ Revenue", "ebt:EBT=87000|rev:Revenue=500000", (v) => v.ebt / v.rev, "%");
f(C1, "Net Profit Margin", "Net Income ÷ Revenue", "ni:Net Income=68730|rev:Revenue=500000", (v) => v.ni / v.rev, "%");
f(C1, "EBITDA Margin", "EBITDA ÷ Revenue", "e:EBITDA=125000|rev:Revenue=500000", (v) => v.e / v.rev, "%");
f(C1, "Effective Tax Rate", "Income Tax ÷ EBT", "tax:Income Tax=18270|ebt:EBT=87000", (v) => v.tax / v.ebt, "%");
f(C1, "Interest Tax Shield", "Interest Expense × Tax Rate", "int:Interest Expense=18000|t%:Tax Rate=21", (v) => v.int * v.t, "$");
f(C1, "Depreciation Tax Shield", "Depreciation × Tax Rate", "dep:Depreciation=15000|t%:Tax Rate=21", (v) => v.dep * v.t, "$");

// ================= 2. Capital Return & Value =================
const C2 = 2;
f(C2, "Return on Invested Capital (ROIC)", "NOPAT ÷ Invested Capital", "n:NOPAT=82950|ic:Invested Capital=600000", (v) => v.n / v.ic, "%");
f(C2, "Return on Equity (ROE)", "Net Income ÷ Shareholders' Equity", "ni:Net Income=68730|eq:Equity=400000", (v) => v.ni / v.eq, "%");
f(C2, "Return on Assets (ROA)", "Net Income ÷ Total Assets", "ni:Net Income=68730|ta:Total Assets=900000", (v) => v.ni / v.ta, "%");
f(C2, "Return on Capital Employed (ROCE)", "EBIT ÷ (Total Assets − Current Liabilities)", "ebit:EBIT=105000|ta:Total Assets=900000|cl:Current Liabilities=150000", (v) => v.ebit / (v.ta - v.cl), "%");
f(C2, "Return on Sales (ROS)", "Operating Profit ÷ Net Sales", "op:Operating Profit=105000|s:Net Sales=500000", (v) => v.op / v.s, "%");
f(C2, "Asset Turnover Ratio", "Revenue ÷ Average Total Assets", "rev:Revenue=500000|ta:Avg Total Assets=900000", (v) => v.rev / v.ta, "x");
f(C2, "Fixed Asset Turnover", "Revenue ÷ Net Fixed Assets", "rev:Revenue=500000|fa:Net Fixed Assets=450000", (v) => v.rev / v.fa, "x");
f(C2, "Working Capital Turnover", "Revenue ÷ Working Capital", "rev:Revenue=500000|wc:Working Capital=120000", (v) => v.rev / v.wc, "x");
f(C2, "Invested Capital", "Total Debt + Total Equity − Non-operating Cash", "d:Total Debt=300000|e:Total Equity=400000|c:Excess Cash=100000", (v) => v.d + v.e - v.c, "$");
f(C2, "Cost of Equity (CAPM)", "Rf + β × (Rm − Rf)", "rf%:Risk-Free Rate=4|b:Beta=1.2|rm%:Market Return=10", (v) => v.rf + v.b * (v.rm - v.rf), "%");
f(C2, "Cost of Debt (Pre-Tax)", "Interest Expense ÷ Total Debt", "int:Interest Expense=18000|d:Total Debt=300000", (v) => v.int / v.d, "%");
f(C2, "Cost of Debt (After-Tax)", "Kd × (1 − Tax Rate)", "kd%:Pre-Tax Cost of Debt=6|t%:Tax Rate=21", (v) => v.kd * (1 - v.t), "%");
f(C2, "Weighted Average Cost of Capital (WACC)", "E/V × Re + D/V × Rd × (1 − T)", "e:Equity Value=400000|d:Debt Value=300000|re%:Cost of Equity=11.2|rd%:Cost of Debt=6|t%:Tax Rate=21", (v) => { const V = v.e + v.d; return (v.e / V) * v.re + (v.d / V) * v.rd * (1 - v.t); }, "%");
f(C2, "Economic Value Added (EVA)", "NOPAT − (Invested Capital × WACC)", "n:NOPAT=82950|ic:Invested Capital=600000|w%:WACC=8.4", (v) => v.n - v.ic * v.w, "$");
f(C2, "Market Value Added (MVA)", "Market Value of Firm − Invested Capital", "mv:Market Value=950000|ic:Invested Capital=600000", (v) => v.mv - v.ic, "$");
f(C2, "Cash Return on Capital Invested (CROCI)", "Cash Flow ÷ Gross Capital Invested", "cf:Operating Cash Flow=130000|gc:Gross Capital Invested=750000", (v) => v.cf / v.gc, "%");
f(C2, "Equity Multiplier", "Total Assets ÷ Total Equity", "ta:Total Assets=900000|e:Total Equity=400000", (v) => v.ta / v.e, "x");
f(C2, "DuPont Framework Asset Efficiency Line", "Revenue ÷ Total Assets", "rev:Revenue=500000|ta:Total Assets=900000", (v) => v.rev / v.ta, "x");
f(C2, "DuPont Framework Profit Margin Line", "Net Income ÷ Revenue", "ni:Net Income=68730|rev:Revenue=500000", (v) => v.ni / v.rev, "%");
f(C2, "DuPont Framework Financial Leverage Line", "Total Assets ÷ Equity", "ta:Total Assets=900000|e:Equity=400000", (v) => v.ta / v.e, "x");
f(C2, "Extended 5-Way DuPont Tax Burden Ratio", "Net Income ÷ EBT", "ni:Net Income=68730|ebt:EBT=87000", (v) => v.ni / v.ebt, "x");
f(C2, "Extended 5-Way DuPont Interest Burden Ratio", "EBT ÷ EBIT", "ebt:EBT=87000|ebit:EBIT=105000", (v) => v.ebt / v.ebit, "x");
f(C2, "Extended 5-Way DuPont Operating Margin Ratio", "EBIT ÷ Revenue", "ebit:EBIT=105000|rev:Revenue=500000", (v) => v.ebit / v.rev, "%");
f(C2, "Risk-Free Rate of Return", "(1 + Nominal Treasury Yield) ÷ (1 + Inflation) − 1", "y%:Treasury Yield=4.5|i%:Inflation=2.5", (v) => (1 + v.y) / (1 + v.i) - 1, "%");
f(C2, "Equity Risk Premium", "Expected Market Return − Risk-Free Rate", "rm%:Market Return=10|rf%:Risk-Free Rate=4", (v) => v.rm - v.rf, "%");
f(C2, "Unlevered Asset Beta", "βL ÷ [1 + (1 − T) × D/E]", "bl:Levered Beta=1.2|t%:Tax Rate=21|de:Debt/Equity=0.75", (v) => v.bl / (1 + (1 - v.t) * v.de), "");
f(C2, "Levered Equity Beta (Hamada Equation)", "βU × [1 + (1 − T) × D/E]", "bu:Unlevered Beta=0.75|t%:Tax Rate=21|de:Debt/Equity=0.75", (v) => v.bu * (1 + (1 - v.t) * v.de), "");
f(C2, "Capital Rationing Profitability Index", "PV of Future Cash Flows ÷ Initial Investment", "pv:PV of Future Cash Flows=130000|i:Initial Investment=100000", (v) => v.pv / v.i, "x");

// ================= 3. Liquidity & Debt =================
const C3 = 3;
f(C3, "Net Working Capital", "Current Assets − Current Liabilities", "ca:Current Assets=270000|cl:Current Liabilities=150000", (v) => v.ca - v.cl, "$");
f(C3, "Current Ratio", "Current Assets ÷ Current Liabilities", "ca:Current Assets=270000|cl:Current Liabilities=150000", (v) => v.ca / v.cl, "x");
f(C3, "Quick Ratio (Acid-Test)", "(Cash + Marketable Securities + Receivables) ÷ Current Liabilities", "c:Cash=60000|ms:Marketable Securities=20000|ar:Receivables=90000|cl:Current Liabilities=150000", (v) => (v.c + v.ms + v.ar) / v.cl, "x");
f(C3, "Cash Ratio", "(Cash + Marketable Securities) ÷ Current Liabilities", "c:Cash=60000|ms:Marketable Securities=20000|cl:Current Liabilities=150000", (v) => (v.c + v.ms) / v.cl, "x");
f(C3, "Defensive Interval Ratio", "Defensive Assets ÷ Daily Operating Expenses", "da:Defensive Assets=170000|exp:Annual Cash Expenses=365000", (v) => v.da / (v.exp / 365), "d");
f(C3, "Days Inventory Outstanding (DIO)", "Average Inventory ÷ COGS × 365", "inv:Average Inventory=37500|cogs:COGS=225000", (v) => (v.inv / v.cogs) * 365, "d");
f(C3, "Days Sales Outstanding (DSO)", "Accounts Receivable ÷ Revenue × 365", "ar:Accounts Receivable=90000|rev:Revenue=500000", (v) => (v.ar / v.rev) * 365, "d");
f(C3, "Days Payable Outstanding (DPO)", "Accounts Payable ÷ COGS × 365", "ap:Accounts Payable=40000|cogs:COGS=225000", (v) => (v.ap / v.cogs) * 365, "d");
f(C3, "Cash Conversion Cycle (CCC)", "DIO + DSO − DPO", "dio:DIO=60.8|dso:DSO=65.7|dpo:DPO=64.9", (v) => v.dio + v.dso - v.dpo, "d");
f(C3, "Operating Cycle", "DIO + DSO", "dio:DIO=60.8|dso:DSO=65.7", (v) => v.dio + v.dso, "d");
f(C3, "Debt-to-Equity Ratio", "Total Debt ÷ Total Equity", "d:Total Debt=300000|e:Total Equity=400000", (v) => v.d / v.e, "x");
f(C3, "Debt-to-Assets Ratio", "Total Debt ÷ Total Assets", "d:Total Debt=300000|ta:Total Assets=900000", (v) => v.d / v.ta, "%");
f(C3, "Equity Ratio", "Total Equity ÷ Total Assets", "e:Total Equity=400000|ta:Total Assets=900000", (v) => v.e / v.ta, "%");
f(C3, "Financial Leverage Ratio", "Average Total Assets ÷ Average Equity", "ta:Avg Total Assets=900000|e:Avg Equity=400000", (v) => v.ta / v.e, "x");
f(C3, "Net Debt", "Total Debt − Cash & Equivalents", "d:Total Debt=300000|c:Cash=60000", (v) => v.d - v.c, "$");
f(C3, "Net Debt-to-EBITDA Leverage", "(Debt − Cash) ÷ EBITDA", "d:Total Debt=300000|c:Cash=60000|e:EBITDA=125000", (v) => (v.d - v.c) / v.e, "x");
f(C3, "Total Debt-to-EBITDA Leverage", "Total Debt ÷ EBITDA", "d:Total Debt=300000|e:EBITDA=125000", (v) => v.d / v.e, "x");
f(C3, "Interest Coverage Ratio (Times Interest Earned)", "EBIT ÷ Interest Expense", "ebit:EBIT=105000|int:Interest Expense=18000", (v) => v.ebit / v.int, "x");
f(C3, "Cash Coverage Ratio", "(EBIT + Depreciation) ÷ Interest Expense", "ebit:EBIT=105000|dep:Depreciation=20000|int:Interest Expense=18000", (v) => (v.ebit + v.dep) / v.int, "x");
f(C3, "Debt Service Coverage Ratio (DSCR)", "Net Operating Income ÷ Total Debt Service", "noi:Net Operating Income=125000|ds:Debt Service=70000", (v) => v.noi / v.ds, "x");
f(C3, "Fixed Charge Coverage Ratio", "(EBIT + Fixed Charges) ÷ (Fixed Charges + Interest)", "ebit:EBIT=105000|fc:Fixed Charges (Leases)=24000|int:Interest=18000", (v) => (v.ebit + v.fc) / (v.fc + v.int), "x");
f(C3, "Degree of Operating Leverage (DOL)", "% Change in EBIT ÷ % Change in Sales", "e%:% Change EBIT=15|s%:% Change Sales=6", (v) => v.e / v.s, "x");
f(C3, "Degree of Financial Leverage (DFL)", "EBIT ÷ (EBIT − Interest)", "ebit:EBIT=105000|int:Interest=18000", (v) => v.ebit / (v.ebit - v.int), "x");
f(C3, "Degree of Total Leverage (DTL)", "DOL × DFL", "dol:DOL=2.5|dfl:DFL=1.21", (v) => v.dol * v.dfl, "x");
f(C3, "Altman Z-Score X1 Variable", "Working Capital ÷ Total Assets", "wc:Working Capital=120000|ta:Total Assets=900000", (v) => v.wc / v.ta, "");
f(C3, "Altman Z-Score X2 Variable", "Retained Earnings ÷ Total Assets", "re:Retained Earnings=248730|ta:Total Assets=900000", (v) => v.re / v.ta, "");
f(C3, "Altman Z-Score X3 Variable", "EBIT ÷ Total Assets", "ebit:EBIT=105000|ta:Total Assets=900000", (v) => v.ebit / v.ta, "");
f(C3, "Altman Z-Score X4 Variable", "Market Value of Equity ÷ Total Liabilities", "mve:Market Value Equity=650000|tl:Total Liabilities=500000", (v) => v.mve / v.tl, "");
f(C3, "Altman Z-Score X5 Variable", "Sales ÷ Total Assets", "s:Sales=500000|ta:Total Assets=900000", (v) => v.s / v.ta, "");
f(C3, "Total Altman Z-Score", "1.2X1 + 1.4X2 + 3.3X3 + 0.6X4 + 1.0X5", "x1:X1=0.133|x2:X2=0.276|x3:X3=0.117|x4:X4=1.3|x5:X5=0.556", (v) => 1.2 * v.x1 + 1.4 * v.x2 + 3.3 * v.x3 + 0.6 * v.x4 + v.x5, "");
f(C3, "Piotroski F-Score Capital Structure Flag", "1 if Long-Term Debt Ratio decreased, else 0", "now:LT Debt / Assets This Year=0.30|prev:LT Debt / Assets Last Year=0.34", (v) => (v.now < v.prev ? 1 : 0), "");
f(C3, "Piotroski F-Score Liquidity Flag", "1 if Current Ratio increased, else 0", "now:Current Ratio This Year=1.8|prev:Current Ratio Last Year=1.6", (v) => (v.now > v.prev ? 1 : 0), "");

// ================= 4. Supply Chain & Costing =================
const C4 = 4;
f(C4, "Economic Order Quantity (EOQ)", "√(2DS ÷ H)", "d:Annual Demand=12000|s:Order Cost=50|h:Holding Cost per Unit=2", (v) => Math.sqrt((2 * v.d * v.s) / v.h), "u");
f(C4, "Total Inventory Cost (TIC)", "(D/Q)×S + (Q/2)×H + D×P", "d:Annual Demand=12000|q:Order Qty=775|s:Order Cost=50|h:Holding Cost=2|p:Unit Price=10", (v) => (v.d / v.q) * v.s + (v.q / 2) * v.h + v.d * v.p, "$");
f(C4, "Inventory Holding Cost Rate", "Total Holding Costs ÷ Average Inventory Value", "hc:Holding Costs=9000|inv:Avg Inventory Value=40000", (v) => v.hc / v.inv, "%");
f(C4, "Fixed Order Cost", "Total Ordering Costs ÷ Number of Orders", "tc:Total Ordering Cost=7800|n:Number of Orders=156", (v) => v.tc / v.n, "$");
f(C4, "Reorder Point (ROP)", "Daily Demand × Lead Time + Safety Stock", "dd:Daily Demand=33|lt:Lead Time (days)=7|ss:Safety Stock=60", (v) => v.dd * v.lt + v.ss, "u");
f(C4, "Safety Stock (Constant Demand)", "(Max Daily Usage × Max Lead Time) − (Avg Daily Usage × Avg Lead Time)", "mu:Max Daily Usage=45|ml:Max Lead Time=10|au:Avg Daily Usage=33|al:Avg Lead Time=7", (v) => v.mu * v.ml - v.au * v.al, "u");
f(C4, "Safety Stock (Variable Demand and Lead Time)", "Z × √(LT×σd² + d²×σLT²)", "z:Z (service level)=1.65|lt:Avg Lead Time=7|sd:Std Dev Daily Demand=6|d:Avg Daily Demand=33|sl:Std Dev Lead Time=1.5", (v) => v.z * Math.sqrt(v.lt * v.sd ** 2 + v.d ** 2 * v.sl ** 2), "u");
f(C4, "Standard Daily Demand", "Annual Demand ÷ Working Days", "d:Annual Demand=12000|wd:Working Days=360", (v) => v.d / v.wd, "u");
f(C4, "Average Order Lead Time", "Sum of Lead Times ÷ Number of Orders", "*lts:Lead Times (comma separated)=6,7,8,7,9", (v) => mean(v.lts), "d");
f(C4, "Contribution Margin per Unit", "Selling Price − Variable Cost per Unit", "p:Price=50|vc:Variable Cost=30", (v) => v.p - v.vc, "$");
f(C4, "Total Contribution Margin", "Units × (Price − Variable Cost)", "q:Units=10000|p:Price=50|vc:Variable Cost=30", (v) => v.q * (v.p - v.vc), "$");
f(C4, "Contribution Margin Ratio", "(Price − Variable Cost) ÷ Price", "p:Price=50|vc:Variable Cost=30", (v) => (v.p - v.vc) / v.p, "%");
f(C4, "Break-Even Point (Units)", "Fixed Costs ÷ Contribution Margin per Unit", "fc:Fixed Costs=120000|p:Price=50|vc:Variable Cost=30", (v) => v.fc / (v.p - v.vc), "u");
f(C4, "Break-Even Point (Sales Dollars)", "Fixed Costs ÷ CM Ratio", "fc:Fixed Costs=120000|cm%:CM Ratio=40", (v) => v.fc / v.cm, "$");
f(C4, "Margin of Safety (Units)", "Actual Units − Break-Even Units", "a:Actual Units=10000|be:Break-Even Units=6000", (v) => v.a - v.be, "u");
f(C4, "Margin of Safety (Percentage)", "(Actual Sales − Break-Even Sales) ÷ Actual Sales", "a:Actual Sales=500000|be:Break-Even Sales=300000", (v) => (v.a - v.be) / v.a, "%");
f(C4, "Target Profit Volume Requirements", "(Fixed Costs + Target Profit) ÷ CM per Unit", "fc:Fixed Costs=120000|tp:Target Profit=80000|cm:CM per Unit=20", (v) => (v.fc + v.tp) / v.cm, "u");
f(C4, "Price Variance", "(Actual Price − Standard Price) × Actual Qty", "ap:Actual Price=10.5|sp:Standard Price=10|aq:Actual Qty=5000", (v) => (v.ap - v.sp) * v.aq, "$");
f(C4, "Quantity Variance (Efficiency Variance)", "(Actual Qty − Standard Qty) × Standard Price", "aq:Actual Qty=5000|sq:Standard Qty=4800|sp:Standard Price=10", (v) => (v.aq - v.sq) * v.sp, "$");
f(C4, "Direct Labor Rate Variance", "(Actual Rate − Standard Rate) × Actual Hours", "ar:Actual Rate=26|sr:Standard Rate=25|ah:Actual Hours=2000", (v) => (v.ar - v.sr) * v.ah, "$");
f(C4, "Direct Labor Efficiency Variance", "(Actual Hours − Standard Hours) × Standard Rate", "ah:Actual Hours=2000|sh:Standard Hours=1900|sr:Standard Rate=25", (v) => (v.ah - v.sh) * v.sr, "$");
f(C4, "Variable Overhead Rate Variance", "(Actual VOH Rate − Standard Rate) × Actual Hours", "ar:Actual Rate=4.2|sr:Standard Rate=4|ah:Actual Hours=2000", (v) => (v.ar - v.sr) * v.ah, "$");
f(C4, "Fixed Overhead Budget Variance", "Actual Fixed Overhead − Budgeted Fixed Overhead", "a:Actual FOH=52000|b:Budgeted FOH=50000", (v) => v.a - v.b, "$");
f(C4, "Manufacturing Capacity Utilization Rate", "Actual Output ÷ Potential Output", "a:Actual Output=8200|p:Potential Output=10000", (v) => v.a / v.p, "%");
f(C4, "Cost of Goods Manufactured (COGM)", "DM + DL + MOH + Beginning WIP − Ending WIP", "dm:Direct Materials=90000|dl:Direct Labor=60000|oh:Overhead=40000|bw:Beginning WIP=10000|ew:Ending WIP=12000", (v) => v.dm + v.dl + v.oh + v.bw - v.ew, "$");
f(C4, "Economic Production Quantity (EPQ)", "√(2DS ÷ [H(1 − d/p)])", "d:Annual Demand=12000|s:Setup Cost=200|h:Holding Cost=2|dr:Daily Demand Rate=33|pr:Daily Production Rate=80", (v) => Math.sqrt((2 * v.d * v.s) / (v.h * (1 - v.dr / v.pr))), "u");

// ================= 5. Capital Projects, M&A & Valuation =================
const C5 = 5;
f(C5, "Future Value (FV)", "PV × (1 + r)^n", "pv:Present Value=10000|r%:Rate=7|n:Periods=10", (v) => v.pv * (1 + v.r) ** v.n, "$");
f(C5, "Present Value (PV)", "FV ÷ (1 + r)^n", "fv:Future Value=19672|r%:Rate=7|n:Periods=10", (v) => v.fv / (1 + v.r) ** v.n, "$");
f(C5, "Net Present Value (NPV)", "Σ CFt ÷ (1 + r)^t  (CF0 is the initial outlay)", "r%:Discount Rate=8|*cf:Cash Flows CF0..CFn=-100000,30000,35000,40000,45000", (v) => npv(v.r, v.cf), "$");
f(C5, "Internal Rate of Return (IRR)", "Rate where NPV = 0", "*cf:Cash Flows CF0..CFn=-100000,30000,35000,40000,45000", (v) => irr(v.cf), "%");
f(C5, "Modified Internal Rate of Return (MIRR)", "(FV of inflows @ reinvest ÷ PV of outflows @ finance)^(1/n) − 1", "fr%:Finance Rate=8|rr%:Reinvestment Rate=10|*cf:Cash Flows=-100000,30000,35000,40000,45000", (v) => { const n = v.cf.length - 1; let fvp = 0, pvn = 0; v.cf.forEach((c: number, t: number) => { if (c > 0) fvp += c * (1 + v.rr) ** (n - t); else pvn += c / (1 + v.fr) ** t; }); return (fvp / -pvn) ** (1 / n) - 1; }, "%");
f(C5, "Simple Payback Period", "Years until cumulative cash flow turns positive", "*cf:Cash Flows=-100000,30000,35000,40000,45000", (v) => payback(v.cf), "yrs");
f(C5, "Discounted Payback Period", "Years until cumulative discounted cash flow turns positive", "r%:Discount Rate=8|*cf:Cash Flows=-100000,30000,35000,40000,45000", (v) => payback(v.cf, v.r), "yrs");
f(C5, "Free Cash Flow to Firm (FCFF)", "EBIT(1 − T) + D&A − CapEx − ΔNWC", "ebit:EBIT=105000|t%:Tax Rate=21|da:D&A=20000|cx:CapEx=30000|nwc:Change in NWC=8000", (v) => v.ebit * (1 - v.t) + v.da - v.cx - v.nwc, "$");
f(C5, "Free Cash Flow to Equity (FCFE)", "FCFF − Interest(1 − T) + Net Borrowing", "fcff:FCFF=64950|int:Interest=18000|t%:Tax Rate=21|nb:Net Borrowing=10000", (v) => v.fcff - v.int * (1 - v.t) + v.nb, "$");
f(C5, "Gordon Growth Model Stock Price", "D1 ÷ (r − g)", "d1:Next Dividend=2.1|r%:Required Return=9|g%:Growth=4", (v) => v.d1 / (v.r - v.g), "$");
f(C5, "Capitalization Rate", "Net Operating Income ÷ Property Value", "noi:NOI=85000|val:Value=1200000", (v) => v.noi / v.val, "%");
f(C5, "Terminal Value (Gordon Growth Method)", "FCF × (1 + g) ÷ (WACC − g)", "fcf:Final Year FCF=70000|g%:Growth=2.5|w%:WACC=8.4", (v) => (v.fcf * (1 + v.g)) / (v.w - v.g), "$");
f(C5, "Terminal Value (Exit Multiple Method)", "Final Year EBITDA × Exit Multiple", "e:Final EBITDA=150000|m:Exit Multiple=8", (v) => v.e * v.m, "$");
f(C5, "Enterprise Value (EV)", "Market Cap + Debt + Preferred + Minority − Cash", "mc:Market Cap=650000|d:Debt=300000|p:Preferred=0|mi:Minority Interest=0|c:Cash=60000", (v) => v.mc + v.d + v.p + v.mi - v.c, "$");
f(C5, "Equity Value", "Enterprise Value − Net Debt", "ev:Enterprise Value=890000|nd:Net Debt=240000", (v) => v.ev - v.nd, "$");
f(C5, "Market Capitalization", "Share Price × Shares Outstanding", "p:Share Price=13|s:Shares Outstanding=50000", (v) => v.p * v.s, "$");
f(C5, "EV-to-EBITDA Multiple", "EV ÷ EBITDA", "ev:EV=890000|e:EBITDA=125000", (v) => v.ev / v.e, "x");
f(C5, "EV-to-Sales Multiple", "EV ÷ Revenue", "ev:EV=890000|s:Revenue=500000", (v) => v.ev / v.s, "x");
f(C5, "Price-to-Earnings (P/E) Ratio", "Share Price ÷ EPS", "p:Share Price=13|eps:EPS=1.37", (v) => v.p / v.eps, "x");
f(C5, "Price-to-Book (P/B) Ratio", "Share Price ÷ Book Value per Share", "p:Share Price=13|bv:Book Value/Share=8", (v) => v.p / v.bv, "x");
f(C5, "Price-to-Sales (P/S) Ratio", "Market Cap ÷ Revenue", "mc:Market Cap=650000|s:Revenue=500000", (v) => v.mc / v.s, "x");
f(C5, "Price-to-Cash Flow (P/CF) Ratio", "Share Price ÷ Operating Cash Flow per Share", "p:Share Price=13|cf:OCF per Share=2.6", (v) => v.p / v.cf, "x");
f(C5, "PEG (Price/Earnings-to-Growth) Ratio", "P/E ÷ EPS Growth Rate (whole %)", "pe:P/E=9.5|g:EPS Growth (whole %)=12", (v) => v.pe / v.g, "x");
f(C5, "Maximum M&A Purchase Price", "Standalone Target Value + PV of Synergies", "sv:Target Standalone Value=2000000|syn:PV of Synergies=400000", (v) => v.sv + v.syn, "$");
f(C5, "Present Value of Synergy Cash Flows", "Annual Synergy ÷ (r − g)", "s:Annual Synergy=40000|r%:Discount Rate=10|g%:Growth=0", (v) => v.s / (v.r - v.g), "$");
f(C5, "Post-Merger Earnings Per Share", "(NI Acquirer + NI Target + Synergies) ÷ (Shares Acquirer + New Shares)", "na:Acquirer NI=500000|nt:Target NI=150000|syn:After-tax Synergies=30000|sa:Acquirer Shares=200000|ns:New Shares Issued=50000", (v) => (v.na + v.nt + v.syn) / (v.sa + v.ns), "$");
f(C5, "M&A Exchange Ratio", "Offer Price per Target Share ÷ Acquirer Share Price", "op:Offer Price=30|ap:Acquirer Price=45", (v) => v.op / v.ap, "x");
f(C5, "Herfindahl-Hirschman Index (HHI)", "Σ (Market Share %)²", "*s:Market Shares (whole %)=30,25,20,15,10", (v) => sum(v.s.map((x: number) => x * x)), "");

// ================= 6. Cost Accounting & Variance =================
const C6 = 6;
f(C6, "Direct Materials Price Variance", "(AP − SP) × AQ purchased", "ap:Actual Price=4.2|sp:Standard Price=4|aq:Actual Qty=10000", (v) => (v.ap - v.sp) * v.aq, "$");
f(C6, "Direct Materials Quantity Variance", "(AQ used − SQ allowed) × SP", "aq:Actual Qty Used=9800|sq:Standard Qty=9500|sp:Standard Price=4", (v) => (v.aq - v.sq) * v.sp, "$");
f(C6, "Direct Labor Rate Variance", "(AR − SR) × AH", "ar:Actual Rate=22|sr:Standard Rate=21|ah:Actual Hours=3000", (v) => (v.ar - v.sr) * v.ah, "$");
f(C6, "Direct Labor Efficiency Variance", "(AH − SH) × SR", "ah:Actual Hours=3000|sh:Standard Hours=2900|sr:Standard Rate=21", (v) => (v.ah - v.sh) * v.sr, "$");
f(C6, "Variable Overhead Spending Variance", "Actual VOH − (AH × Standard VOH Rate)", "a:Actual VOH=13000|ah:Actual Hours=3000|sr:Std VOH Rate=4", (v) => v.a - v.ah * v.sr, "$");
f(C6, "Variable Overhead Efficiency Variance", "(AH − SH) × Standard VOH Rate", "ah:Actual Hours=3000|sh:Standard Hours=2900|sr:Std VOH Rate=4", (v) => (v.ah - v.sh) * v.sr, "$");
f(C6, "Fixed Overhead Budget (Spending) Variance", "Actual FOH − Budgeted FOH", "a:Actual FOH=61000|b:Budgeted FOH=60000", (v) => v.a - v.b, "$");
f(C6, "Fixed Overhead Volume Variance", "Budgeted FOH − (SH allowed × FOH Rate)", "b:Budgeted FOH=60000|sh:Standard Hours=2900|r:FOH Rate=20", (v) => v.b - v.sh * v.r, "$");
f(C6, "Sales Price Variance", "(Actual Price − Budget Price) × Actual Units", "ap:Actual Price=52|bp:Budget Price=50|q:Actual Units=9500", (v) => (v.ap - v.bp) * v.q, "$");
f(C6, "Sales Volume Variance", "(Actual Units − Budget Units) × Budget CM per Unit", "aq:Actual Units=9500|bq:Budget Units=10000|cm:Budget CM/Unit=20", (v) => (v.aq - v.bq) * v.cm, "$");
f(C6, "Joint-Product Cost Allocation (Sales Value Method)", "Joint Cost × (Product Sales Value ÷ Total Sales Value)", "jc:Joint Cost=100000|ps:Product Sales Value=150000|ts:Total Sales Value=250000", (v) => (v.jc * v.ps) / v.ts, "$");
f(C6, "Joint-Product Cost Allocation (Physical Measure Method)", "Joint Cost × (Product Units ÷ Total Units)", "jc:Joint Cost=100000|pu:Product Units=6000|tu:Total Units=10000", (v) => (v.jc * v.pu) / v.tu, "$");
f(C6, "Joint-Product Cost Allocation (Net Realizable Value Method)", "Joint Cost × (Product NRV ÷ Total NRV)", "jc:Joint Cost=100000|sv:Final Sales Value=180000|sc:Separable Costs=30000|tn:Total NRV=220000", (v) => (v.jc * (v.sv - v.sc)) / v.tn, "$");
f(C6, "By-Product Revenue Scrap Reduction Formula", "Joint Cost − Net By-Product Revenue", "jc:Joint Cost=100000|br:By-Product Revenue=6000|bc:By-Product Costs=1000", (v) => v.jc - (v.br - v.bc), "$");
f(C6, "Equivalent Units of Production (FIFO Method)", "BWIP × (1 − % complete) + Started & Completed + EWIP × % complete", "bw:Beginning WIP Units=1000|bp%:BWIP % Complete=40|sc:Started & Completed=8000|ew:Ending WIP Units=1500|ep%:EWIP % Complete=60", (v) => v.bw * (1 - v.bp) + v.sc + v.ew * v.ep, "u");
f(C6, "Equivalent Units of Production (Weighted Average Method)", "Units Completed + EWIP × % complete", "uc:Units Completed=9000|ew:Ending WIP Units=1500|ep%:EWIP % Complete=60", (v) => v.uc + v.ew * v.ep, "u");
f(C6, "Cost per Equivalent Unit (FIFO Method)", "Current Period Costs ÷ FIFO Equivalent Units", "c:Current Period Costs=190000|eu:FIFO Equivalent Units=9500", (v) => v.c / v.eu, "$");
f(C6, "Cost per Equivalent Unit (Weighted Average Method)", "(BWIP Cost + Current Costs) ÷ WA Equivalent Units", "bc:BWIP Cost=12000|c:Current Costs=190000|eu:WA Equivalent Units=9900", (v) => (v.bc + v.c) / v.eu, "$");
f(C6, "Target Costing Target Cost Formula", "Target Price − Target Profit", "p:Target Price=80|tp:Target Profit per Unit=16", (v) => v.p - v.tp, "$");
f(C6, "Markup Percentage on Total Cost", "(Price − Total Cost) ÷ Total Cost", "p:Price=80|c:Total Cost=64", (v) => (v.p - v.c) / v.c, "%");
f(C6, "Markup Percentage on Variable Cost", "(Price − Variable Cost) ÷ Variable Cost", "p:Price=80|vc:Variable Cost=45", (v) => (v.p - v.vc) / v.vc, "%");
f(C6, "High-Low Method Variable Cost per Unit Line", "(High Cost − Low Cost) ÷ (High Activity − Low Activity)", "hc:High Cost=48000|lc:Low Cost=32000|ha:High Activity=12000|la:Low Activity=6000", (v) => (v.hc - v.lc) / (v.ha - v.la), "$");
f(C6, "High-Low Method Fixed Cost Intercept", "High Cost − (Variable Cost per Unit × High Activity)", "hc:High Cost=48000|vc:Variable Cost/Unit=2.667|ha:High Activity=12000", (v) => v.hc - v.vc * v.ha, "$");
f(C6, "Mixed Cost Linear Regression Intercept", "β0 = ȳ − β1 x̄ (least squares)", "*x:Activity Levels=6000,8000,9000,11000,12000|*y:Total Costs=32000,37500,40000,45000,48000", (v) => regress(v.x, v.y).b0, "$");
f(C6, "Overhead Allocation Multiplier (Plantwide)", "Total Estimated Overhead ÷ Total Allocation Base", "oh:Estimated Overhead=300000|b:Direct Labor Hours=20000", (v) => v.oh / v.b, "$");
f(C6, "Overhead Allocation Multiplier (Departmental)", "Department Overhead ÷ Department Allocation Base", "oh:Department Overhead=120000|b:Machine Hours=6000", (v) => v.oh / v.b, "$");

// ================= 7. Portfolio Risk =================
const C7 = 7;
f(C7, "Jensen's Alpha", "Rp − [Rf + β(Rm − Rf)]", "rp%:Portfolio Return=12|rf%:Risk-Free=4|b:Beta=1.1|rm%:Market Return=10", (v) => v.rp - (v.rf + v.b * (v.rm - v.rf)), "%");
f(C7, "Treynor Ratio", "(Rp − Rf) ÷ β", "rp%:Portfolio Return=12|rf%:Risk-Free=4|b:Beta=1.1", (v) => (v.rp - v.rf) / v.b, "");
f(C7, "Information Ratio", "(Rp − Rb) ÷ Tracking Error", "rp%:Portfolio Return=12|rb%:Benchmark Return=10|te%:Tracking Error=4", (v) => (v.rp - v.rb) / v.te, "");
f(C7, "Sortino Ratio", "(Rp − Rf) ÷ Downside Deviation", "rp%:Portfolio Return=12|rf%:Risk-Free=4|dd%:Downside Deviation=9", (v) => (v.rp - v.rf) / v.dd, "");
f(C7, "Semivariance Metric", "Σ (min(0, Ri − R̄))² ÷ n", "*r:Returns (decimals)=0.05,-0.02,0.08,-0.04,0.03,0.01", (v) => { const m = mean(v.r); return sum(v.r.map((x: number) => Math.min(0, x - m) ** 2)) / v.r.length; }, "");
f(C7, "Downside Deviation Parameter", "√(Σ min(0, Ri − MAR)² ÷ n)", "mar:Minimum Acceptable Return=0|*r:Returns (decimals)=0.05,-0.02,0.08,-0.04,0.03,0.01", (v) => Math.sqrt(sum(v.r.map((x: number) => Math.min(0, x - v.mar) ** 2)) / v.r.length), "%");
f(C7, "Tracking Error Parameter", "Rp − Rb (active return per period)", "rp%:Portfolio Return=12|rb%:Benchmark Return=10", (v) => v.rp - v.rb, "%");
f(C7, "Tracking Error Value", "StdDev(Rp − Rb)", "*p:Portfolio Returns=0.05,0.02,0.07,-0.01,0.04|*b:Benchmark Returns=0.04,0.02,0.05,0.00,0.03", (v) => sd(v.p.map((x: number, i: number) => x - v.b[i])), "%");
f(C7, "Value at Risk (Parametric Model)", "Portfolio Value × (Z × σ − μ)", "pv:Portfolio Value=1000000|z:Z score (95% confidence)=1.645|s%:Volatility=2|m%:Expected Return=0.05", (v) => v.pv * (v.z * v.s - v.m), "$");
f(C7, "Value at Risk (Historical Simulation Factor)", "−Percentile(returns, 1 − confidence) × Value", "pv:Portfolio Value=1000000|c%:Confidence=95|*r:Historical Returns=-0.03,0.01,0.02,-0.015,0.005,-0.025,0.012,0.008,-0.01,0.004", (v) => { const s = [...v.r].sort((a, b) => a - b); const i = Math.max(0, Math.floor((1 - v.c) * s.length)); return -s[i] * v.pv; }, "$");
f(C7, "Conditional Value at Risk (CVaR)", "Average loss beyond VaR threshold", "pv:Portfolio Value=1000000|c%:Confidence=90|*r:Historical Returns=-0.03,0.01,0.02,-0.015,0.005,-0.025,0.012,0.008,-0.01,0.004", (v) => { const s = [...v.r].sort((a, b) => a - b); const k = Math.max(1, Math.ceil((1 - v.c) * s.length)); return -mean(s.slice(0, k)) * v.pv; }, "$");
f(C7, "Sharpe Ratio Matrix Output", "(Rp − Rf) ÷ σp", "rp%:Portfolio Return=12|rf%:Risk-Free=4|s%:Std Dev=15", (v) => (v.rp - v.rf) / v.s, "");
f(C7, "Portfolio Covariance Element", "Cov(A,B) = Σ (Ai − Ā)(Bi − B̄) ÷ (n − 1)", "*a:Returns A=0.05,0.02,0.07,-0.01,0.04|*b:Returns B=0.03,0.01,0.06,0.00,0.02", (v) => { const ma = mean(v.a), mb = mean(v.b); return sum(v.a.map((x: number, i: number) => (x - ma) * (v.b[i] - mb))) / (v.a.length - 1); }, "");
f(C7, "Correlation Coefficient Parameter", "Cov(A,B) ÷ (σA σB)", "*a:Returns A=0.05,0.02,0.07,-0.01,0.04|*b:Returns B=0.03,0.01,0.06,0.00,0.02", (v) => { const ma = mean(v.a), mb = mean(v.b); const c = sum(v.a.map((x: number, i: number) => (x - ma) * (v.b[i] - mb))) / (v.a.length - 1); return c / (sd(v.a) * sd(v.b)); }, "");
f(C7, "Portfolio Standard Deviation Component", "√(wA²σA² + wB²σB² + 2wAwBρσAσB)", "wa%:Weight A=60|sa%:Std Dev A=18|sb%:Std Dev B=8|rho:Correlation=0.3", (v) => { const wb = 1 - v.wa; return Math.sqrt(v.wa ** 2 * v.sa ** 2 + wb ** 2 * v.sb ** 2 + 2 * v.wa * wb * v.rho * v.sa * v.sb); }, "%");
f(C7, "Capital Market Line (CML) Equation", "Rf + [(Rm − Rf) ÷ σm] × σp", "rf%:Risk-Free=4|rm%:Market Return=10|sm%:Market Std Dev=16|sp%:Portfolio Std Dev=12", (v) => v.rf + ((v.rm - v.rf) / v.sm) * v.sp, "%");
f(C7, "Security Market Line (SML) Equation", "Rf + β(Rm − Rf)", "rf%:Risk-Free=4|b:Beta=1.3|rm%:Market Return=10", (v) => v.rf + v.b * (v.rm - v.rf), "%");
f(C7, "Omega Ratio", "Σ gains above threshold ÷ Σ losses below threshold", "t:Threshold=0|*r:Returns=0.05,-0.02,0.08,-0.04,0.03,0.01", (v) => sum(v.r.map((x: number) => Math.max(0, x - v.t))) / sum(v.r.map((x: number) => Math.max(0, v.t - x))), "");
f(C7, "Calmar Ratio", "Annualized Return ÷ |Max Drawdown|", "r%:Annual Return=14|md%:Max Drawdown=20", (v) => v.r / Math.abs(v.md), "");
f(C7, "Fama-French Three-Factor Model Expected Return", "Rf + βm(Rm − Rf) + βs·SMB + βv·HML", "rf%:Risk-Free=4|bm:Market Beta=1.05|rm%:Market Return=10|bs:SMB Beta=0.3|smb%:SMB Premium=2|bv:HML Beta=0.2|hml%:HML Premium=3", (v) => v.rf + v.bm * (v.rm - v.rf) + v.bs * v.smb + v.bv * v.hml, "%");

// ================= 8. FX & Treasury =================
const C8 = 8;
f(C8, "Interest Rate Parity (Forward Rate Calculation)", "Spot × (1 + i_quote) ÷ (1 + i_base)", "s:Spot Rate=1.10|iq%:Quote Currency Rate=5|ib%:Base Currency Rate=3", (v) => (v.s * (1 + v.iq)) / (1 + v.ib), "");
f(C8, "Purchasing Power Parity (Inflation Differential Adjustment)", "Spot × (1 + π_quote) ÷ (1 + π_base)", "s:Spot Rate=1.10|pq%:Quote Inflation=4|pb%:Base Inflation=2", (v) => (v.s * (1 + v.pq)) / (1 + v.pb), "");
f(C8, "Cross Exchange Rate Matrix Output", "(A/USD) × (USD/B) = A/B", "a:A per USD=0.92|b:USD per B=1.27", (v) => v.a * v.b, "");
f(C8, "Bid-Ask Spread Percentage Formula", "(Ask − Bid) ÷ Ask", "bid:Bid=1.0995|ask:Ask=1.1005", (v) => (v.ask - v.bid) / v.ask, "%");
f(C8, "Forward Premium/Discount Percentage Matrix Line", "(Forward − Spot) ÷ Spot × (360 ÷ days)", "f:Forward=1.115|s:Spot=1.10|d:Days=180", (v) => ((v.f - v.s) / v.s) * (360 / v.d), "%");
f(C8, "Foreign Currency Option Intrinsic Value (Call)", "max(0, Spot − Strike)", "s:Spot=1.12|k:Strike=1.10", (v) => Math.max(0, v.s - v.k), "");
f(C8, "Foreign Currency Option Intrinsic Value (Put)", "max(0, Strike − Spot)", "s:Spot=1.08|k:Strike=1.10", (v) => Math.max(0, v.k - v.s), "");
f(C8, "Foreign Currency Option Time Value Component", "Option Premium − Intrinsic Value", "p:Option Premium=0.035|iv:Intrinsic Value=0.02", (v) => v.p - v.iv, "");
f(C8, "Net Transaction Foreign Exchange Exposure Summary", "(FX Receivables − FX Payables) × Spot", "r:FX Receivables=500000|p:FX Payables=320000|s:Spot=1.10", (v) => (v.r - v.p) * v.s, "$");
f(C8, "Economic Exposure Elasticity Value", "% Change in Firm Value ÷ % Change in FX Rate", "fv%:% Change Firm Value=-3|fx%:% Change FX=5", (v) => v.fv / v.fx, "");
f(C8, "Translation Cumulative Translation Adjustment (CTA) Line", "Net Assets × (Closing Rate − Opening Rate)", "na:Foreign Net Assets=2000000|c:Closing Rate=1.12|o:Opening Rate=1.08", (v) => v.na * (v.c - v.o), "$");
f(C8, "Covered Interest Arbitrage Profit Matrix Line", "Notional × [(F/S)(1 + i_f) − (1 + i_d)]", "n:Notional=1000000|s:Spot=1.10|f:Forward=1.12|if%:Foreign Rate=3|id%:Domestic Rate=4", (v) => v.n * ((v.f / v.s) * (1 + v.if) - (1 + v.id)), "$");
f(C8, "Uncovered Interest Arbitrage Expected Spot Rate", "Spot × (1 + i_d) ÷ (1 + i_f)", "s:Spot=1.10|id%:Domestic Rate=4|if%:Foreign Rate=3", (v) => (v.s * (1 + v.id)) / (1 + v.if), "");

// ================= 9. Factory Planning =================
const C9 = 9;
f(C9, "Economic Production Quantity (EPQ) Run Length", "EPQ ÷ Daily Production Rate", "q:EPQ=2560|p:Daily Production Rate=80", (v) => v.q / v.p, "d");
f(C9, "Optimal Number of Production Runs per Year", "Annual Demand ÷ EPQ", "d:Annual Demand=12000|q:EPQ=2560", (v) => v.d / v.q, "");
f(C9, "Cycle Time Machine Calibration Unit", "Net Production Time ÷ Units Produced", "t:Production Time (min)=480|u:Units Produced=240", (v) => v.t / v.u, "");
f(C9, "Overall Equipment Effectiveness (OEE) Availability Rate", "Run Time ÷ Planned Production Time", "rt:Run Time=420|pt:Planned Time=480", (v) => v.rt / v.pt, "%");
f(C9, "Overall Equipment Effectiveness (OEE) Performance Rate", "(Ideal Cycle Time × Total Count) ÷ Run Time", "ict:Ideal Cycle Time (min)=1.5|tc:Total Count=250|rt:Run Time=420", (v) => (v.ict * v.tc) / v.rt, "%");
f(C9, "Overall Equipment Effectiveness (OEE) Quality Rate", "Good Count ÷ Total Count", "g:Good Count=240|t:Total Count=250", (v) => v.g / v.t, "%");
f(C9, "Total OEE Metric", "Availability × Performance × Quality", "a%:Availability=87.5|p%:Performance=89.3|q%:Quality=96", (v) => v.a * v.p * v.q, "%");
f(C9, "Little's Law Throughput Time Formula", "WIP ÷ Throughput Rate", "w:WIP Units=300|th:Throughput per Day=60", (v) => v.w / v.th, "d");
f(C9, "Little's Law Work-in-Progress (WIP) Inventory Volume", "Throughput Rate × Flow Time", "th:Throughput per Day=60|ft:Flow Time (days)=5", (v) => v.th * v.ft, "u");
f(C9, "Takt Time Manufacturing Benchmark", "Available Production Time ÷ Customer Demand", "t:Available Time (min)=450|d:Daily Demand=300", (v) => v.t / v.d, "");
f(C9, "Cycle Time Manufacturing Benchmark", "Total Process Time ÷ Units Completed", "t:Process Time (min)=450|u:Units Completed=320", (v) => v.t / v.u, "");
f(C9, "Capacity Utilization Rate Percentage", "Actual Output ÷ Maximum Capacity", "a:Actual Output=8200|m:Max Capacity=10000", (v) => v.a / v.m, "%");
f(C9, "Labor Efficiency Yield Percentage", "Standard Hours Earned ÷ Actual Hours Worked", "sh:Standard Hours=1900|ah:Actual Hours=2000", (v) => v.sh / v.ah, "%");
f(C9, "Scrap Rate Percentage", "Scrap Units ÷ Total Units Produced", "s:Scrap Units=120|t:Total Units=5000", (v) => v.s / v.t, "%");
f(C9, "Rework Cost Cumulative Summary", "Rework Units × (Labor + Material per Unit)", "u:Rework Units=80|l:Labor per Unit=12|m:Material per Unit=5", (v) => v.u * (v.l + v.m), "$");
f(C9, "Standard Error of the Machine Run", "σ ÷ √n", "*x:Measurements=10.02,9.98,10.05,9.97,10.01,10.00", (v) => sd(v.x) / Math.sqrt(v.x.length), "");

// ================= 10. Exec Comp & Restructuring =================
const C10 = 10;
const BS = "s:Stock Price=100|k:Strike=100|t:Years to Expiry=1|r%:Risk-Free Rate=5|v%:Volatility=20";
f(C10, "Black-Scholes Call Option Model Value", "S·N(d1) − K·e^(−rT)·N(d2)", BS, (v) => { const { d1, d2 } = bs(v.s, v.k, v.t, v.r, v.v); return v.s * normCdf(d1) - v.k * Math.exp(-v.r * v.t) * normCdf(d2); }, "$");
f(C10, "Black-Scholes Put Option Model Value", "K·e^(−rT)·N(−d2) − S·N(−d1)", BS, (v) => { const { d1, d2 } = bs(v.s, v.k, v.t, v.r, v.v); return v.k * Math.exp(-v.r * v.t) * normCdf(-d2) - v.s * normCdf(-d1); }, "$");
f(C10, "Option Delta Sensitivity Component", "Call Δ = N(d1)", BS, (v) => normCdf(bs(v.s, v.k, v.t, v.r, v.v).d1), "");
f(C10, "Option Gamma Sensitivity Component", "Γ = N′(d1) ÷ (S σ √T)", BS, (v) => normPdf(bs(v.s, v.k, v.t, v.r, v.v).d1) / (v.s * v.v * Math.sqrt(v.t)), "");
f(C10, "Option Vega Sensitivity Component", "ν = S · N′(d1) · √T  (per 1.00 vol)", BS, (v) => v.s * normPdf(bs(v.s, v.k, v.t, v.r, v.v).d1) * Math.sqrt(v.t), "");
f(C10, "Option Theta Sensitivity Component", "Call Θ = −S N′(d1) σ ÷ (2√T) − rK e^(−rT) N(d2)  (per year)", BS, (v) => { const { d1, d2 } = bs(v.s, v.k, v.t, v.r, v.v); return (-v.s * normPdf(d1) * v.v) / (2 * Math.sqrt(v.t)) - v.r * v.k * Math.exp(-v.r * v.t) * normCdf(d2); }, "");
f(C10, "Option Rho Sensitivity Component", "Call ρ = K T e^(−rT) N(d2)", BS, (v) => v.k * v.t * Math.exp(-v.r * v.t) * normCdf(bs(v.s, v.k, v.t, v.r, v.v).d2), "");
f(C10, "Warrant Dilution Adjuster Formula", "Call Value × N ÷ (N + M)", "c:Equivalent Call Value=10.45|n:Shares Outstanding=1000000|m:Warrants=100000", (v) => (v.c * v.n) / (v.n + v.m), "$");
f(C10, "Levered Beta De-levering Equation", "βU = βL ÷ [1 + (1 − T) D/E]", "bl:Levered Beta=1.4|t%:Tax Rate=21|de:D/E=0.8", (v) => v.bl / (1 + (1 - v.t) * v.de), "");
f(C10, "Levered Beta Re-levering Equation", "βL = βU × [1 + (1 − T) D/E]", "bu:Unlevered Beta=0.86|t%:Tax Rate=21|de:Target D/E=0.5", (v) => v.bu * (1 + (1 - v.t) * v.de), "");
f(C10, "Modigliani-Miller Proposition I (Unlevered Firm Value)", "EBIT(1 − T) ÷ rU", "ebit:EBIT=1000000|t%:Tax Rate=21|ru%:Unlevered Cost of Capital=10", (v) => (v.ebit * (1 - v.t)) / v.ru, "$");
f(C10, "Modigliani-Miller Proposition I (Levered Firm Value with Taxes)", "VU + T × D", "vu:Unlevered Value=7900000|t%:Tax Rate=21|d:Debt=3000000", (v) => v.vu + v.t * v.d, "$");
f(C10, "Modigliani-Miller Proposition II (Cost of Levered Equity)", "rE = rU + (rU − rD)(1 − T)(D/E)", "ru%:Unlevered Cost=10|rd%:Cost of Debt=6|t%:Tax Rate=21|de:D/E=0.6", (v) => v.ru + (v.ru - v.rd) * (1 - v.t) * v.de, "%");
f(C10, "Present Value of Financial Distress Cost Adjustment", "Probability of Distress × Distress Cost ÷ (1 + r)^n", "p%:Probability of Distress=15|c:Distress Cost=2000000|r%:Discount Rate=8|n:Years=3", (v) => (v.p * v.c) / (1 + v.r) ** v.n, "$");
f(C10, "Adjusted Present Value (APV) Foundation Equation", "Unlevered NPV + PV(Tax Shields) − PV(Distress Costs)", "u:Base-case NPV=500000|ts:PV Tax Shields=180000|dc:PV Distress Costs=60000", (v) => v.u + v.ts - v.dc, "$");

// ================= 11. SaaS =================
const C11 = 11;
f(C11, "Customer Acquisition Cost (CAC)", "Sales & Marketing Spend ÷ New Customers", "sm:S&M Spend=120000|n:New Customers=400", (v) => v.sm / v.n, "$");
f(C11, "Customer Lifetime Value (CLV)", "ARPU × Gross Margin ÷ Churn Rate", "arpu:Monthly ARPU=80|gm%:Gross Margin=75|c%:Monthly Churn=3", (v) => (v.arpu * v.gm) / v.c, "$");
f(C11, "CLV-to-CAC Ratio", "CLV ÷ CAC", "clv:CLV=2000|cac:CAC=300", (v) => v.clv / v.cac, "x");
f(C11, "Monthly Recurring Revenue (MRR)", "Customers × Average Monthly Revenue", "n:Paying Customers=1500|arpu:ARPU=80", (v) => v.n * v.arpu, "$");
f(C11, "Annual Recurring Revenue (ARR)", "MRR × 12", "mrr:MRR=120000", (v) => v.mrr * 12, "$");
f(C11, "Average Revenue Per User (ARPU)", "Total Revenue ÷ Users", "r:Revenue=120000|u:Users=1500", (v) => v.r / v.u, "$");
f(C11, "Logo Churn Rate", "Customers Lost ÷ Customers at Start", "l:Customers Lost=45|s:Customers at Start=1500", (v) => v.l / v.s, "%");
f(C11, "Revenue Churn Rate", "MRR Lost ÷ Starting MRR", "l:MRR Lost=3600|s:Starting MRR=120000", (v) => v.l / v.s, "%");
f(C11, "Net Revenue Retention (NRR)", "(Start MRR + Expansion − Contraction − Churn) ÷ Start MRR", "s:Start MRR=120000|e:Expansion=9000|c:Contraction=1500|ch:Churn=3600", (v) => (v.s + v.e - v.c - v.ch) / v.s, "%");
f(C11, "Gross Revenue Retention (GRR)", "(Start MRR − Contraction − Churn) ÷ Start MRR", "s:Start MRR=120000|c:Contraction=1500|ch:Churn=3600", (v) => (v.s - v.c - v.ch) / v.s, "%");
f(C11, "Customer Expansion Revenue Rate", "Expansion MRR ÷ Starting MRR", "e:Expansion MRR=9000|s:Start MRR=120000", (v) => v.e / v.s, "%");
f(C11, "Customer Retention Cost (CRC)", "Retention Spend ÷ Active Customers", "rs:Retention Spend=30000|n:Active Customers=1500", (v) => v.rs / v.n, "$");
f(C11, "Lead-to-Customer Conversion Rate", "New Customers ÷ Leads", "c:New Customers=400|l:Leads=8000", (v) => v.c / v.l, "%");
f(C11, "Burn Rate (Gross)", "Total Monthly Operating Expenses", "opex:Monthly OPEX=180000|cogs:Monthly COGS=30000", (v) => v.opex + v.cogs, "$");
f(C11, "Burn Rate (Net)", "Monthly Cash Out − Monthly Cash In", "out:Cash Out=210000|in:Cash In=120000", (v) => v.out - v.in, "$");
f(C11, "Runway (Months)", "Cash Balance ÷ Net Burn", "c:Cash Balance=1800000|b:Net Burn=90000", (v) => v.c / v.b, "mo");

// ================= 12. Lease & Real Estate =================
const C12 = 12;
f(C12, "Gross Leasing Yield", "Annual Rent ÷ Property Value", "r:Annual Rent=96000|v:Property Value=1200000", (v) => v.r / v.v, "%");
f(C12, "Net Operating Income (NOI)", "Gross Operating Income − Operating Expenses", "g:Gross Income=150000|o:Operating Expenses=55000", (v) => v.g - v.o, "$");
f(C12, "Capitalization Rate (Cap Rate)", "NOI ÷ Current Market Value", "noi:NOI=95000|v:Market Value=1300000", (v) => v.noi / v.v, "%");
f(C12, "Debt Yield", "NOI ÷ Loan Amount", "noi:NOI=95000|l:Loan Amount=900000", (v) => v.noi / v.l, "%");
f(C12, "Cash-on-Cash Return", "Annual Pre-Tax Cash Flow ÷ Cash Invested", "cf:Annual Cash Flow=28000|ci:Cash Invested=400000", (v) => v.cf / v.ci, "%");
f(C12, "Loan-to-Value (LTV) Ratio", "Loan Amount ÷ Appraised Value", "l:Loan=900000|v:Appraised Value=1300000", (v) => v.l / v.v, "%");
f(C12, "Debt Service Coverage Ratio (DSCR)", "NOI ÷ Annual Debt Service", "noi:NOI=95000|ds:Debt Service=67000", (v) => v.noi / v.ds, "x");
f(C12, "Gross Rent Multiplier (GRM)", "Property Price ÷ Gross Annual Rent", "p:Price=1300000|r:Gross Annual Rent=150000", (v) => v.p / v.r, "x");
f(C12, "Right-of-Use (ROU) Lease Asset Present Value", "PMT × [1 − (1 + r)^−n] ÷ r + Initial Direct Costs", "pmt:Annual Payment=50000|r%:Discount Rate=6|n:Years=5|idc:Initial Direct Costs=2000", (v) => (v.pmt * (1 - (1 + v.r) ** -v.n)) / v.r + v.idc, "$");
f(C12, "Lease Liability Interest Component", "Opening Lease Liability × Discount Rate", "l:Opening Liability=210618|r%:Discount Rate=6", (v) => v.l * v.r, "$");
f(C12, "Straight-Line Rent Expense Adjustment", "Total Lease Payments ÷ Lease Term − Cash Rent Paid", "tp:Total Payments=270000|n:Term (years)=5|c:Cash Rent This Year=50000", (v) => v.tp / v.n - v.c, "$");
f(C12, "Tenant Improvement Allowance Amortization", "TI Allowance ÷ Lease Term", "ti:TI Allowance=60000|n:Lease Term (years)=5", (v) => v.ti / v.n, "$");

// ================= 13. Stochastic Supply Chain =================
const C13 = 13;
f(C13, "Reorder Point with Safety Stock", "d × L + Z × σd × √L", "d:Avg Daily Demand=33|l:Lead Time=7|z:Z=1.65|sd:Std Dev Daily Demand=6", (v) => v.d * v.l + v.z * v.sd * Math.sqrt(v.l), "u");
f(C13, "Economic Order Quantity with Quantity Discounts", "√(2DS ÷ (i × P)) at discounted price", "d:Annual Demand=12000|s:Order Cost=50|i%:Holding Rate=20|p:Discounted Unit Price=9.5", (v) => Math.sqrt((2 * v.d * v.s) / (v.i * v.p)), "u");
f(C13, "Newsvendor Model Critical Fraction", "Cu ÷ (Cu + Co)", "cu:Underage Cost=6|co:Overage Cost=2", (v) => v.cu / (v.cu + v.co), "%");
f(C13, "Target Fill Rate Percentage", "1 − Expected Shortage ÷ Order Quantity", "es:Expected Shortage=12|q:Order Qty=775", (v) => 1 - v.es / v.q, "%");
f(C13, "Expected Shortage per Order Cycle", "σL × L(z)  (standard loss function)", "sl:Std Dev Lead-Time Demand=16|z:Z=1.65", (v) => v.sl * (normPdf(v.z) - v.z * (1 - normCdf(v.z))), "u");
f(C13, "Standard Deviation of Demand During Lead Time", "σd × √L", "sd:Std Dev Daily Demand=6|l:Lead Time=7", (v) => v.sd * Math.sqrt(v.l), "u");
f(C13, "Average Days Delay in Inventory", "Σ Delay Days ÷ Delayed Orders", "*d:Delay Days per Order=2,0,5,1,3", (v) => mean(v.d), "d");
f(C13, "Single-Period Inventory Expected Profit Matrix Line", "Price × min(Q,D) − Cost × Q + Salvage × max(0, Q − D)", "p:Price=12|c:Cost=6|s:Salvage=2|q:Order Qty=500|d:Demand=450", (v) => v.p * Math.min(v.q, v.d) - v.c * v.q + v.s * Math.max(0, v.q - v.d), "$");
f(C13, "Stockout Probability Factor", "1 − N(z)", "z:Z=1.65", (v) => 1 - normCdf(v.z), "%");
f(C13, "Scrap Value Cost Recovery Multiplier", "Scrap Recovery Value ÷ Original Cost", "s:Scrap Value=1500|c:Original Cost=10000", (v) => v.s / v.c, "%");

// ================= 14. Time Value =================
const C14 = 14;
const AN = "pmt:Payment=1000|r%:Rate per Period=5|n:Periods=10";
f(C14, "Future Value of an Ordinary Annuity", "PMT × [(1 + r)^n − 1] ÷ r", AN, (v) => (v.pmt * ((1 + v.r) ** v.n - 1)) / v.r, "$");
f(C14, "Future Value of an Annuity Due", "FV ordinary × (1 + r)", AN, (v) => ((v.pmt * ((1 + v.r) ** v.n - 1)) / v.r) * (1 + v.r), "$");
f(C14, "Present Value of an Ordinary Annuity", "PMT × [1 − (1 + r)^−n] ÷ r", AN, (v) => (v.pmt * (1 - (1 + v.r) ** -v.n)) / v.r, "$");
f(C14, "Present Value of an Annuity Due", "PV ordinary × (1 + r)", AN, (v) => ((v.pmt * (1 - (1 + v.r) ** -v.n)) / v.r) * (1 + v.r), "$");
f(C14, "Present Value of a Growing Perpetuity", "C1 ÷ (r − g)", "c:First Cash Flow=1000|r%:Discount Rate=8|g%:Growth=3", (v) => v.c / (v.r - v.g), "$");
f(C14, "Present Value of a Deferred Annuity", "PV ordinary annuity ÷ (1 + r)^k", "pmt:Payment=1000|r%:Rate=5|n:Payments=10|k:Deferral Periods=3", (v) => (v.pmt * (1 - (1 + v.r) ** -v.n)) / v.r / (1 + v.r) ** v.k, "$");
f(C14, "Stated Annual Percentage Rate (APR)", "Periodic Rate × Periods per Year", "pr%:Periodic Rate=1.5|m:Periods per Year=12", (v) => v.pr * v.m, "%");
f(C14, "Effective Annual Rate (EAR)", "(1 + APR/m)^m − 1", "apr%:APR=18|m:Compounding per Year=12", (v) => (1 + v.apr / v.m) ** v.m - 1, "%");
f(C14, "Continuous Compounding Future Value", "PV × e^(rt)", "pv:Present Value=10000|r%:Rate=6|t:Years=5", (v) => v.pv * Math.exp(v.r * v.t), "$");
f(C14, "Continuous Compounding Present Value", "FV × e^(−rt)", "fv:Future Value=13499|r%:Rate=6|t:Years=5", (v) => v.fv * Math.exp(-v.r * v.t), "$");
f(C14, "Amortization Loan Payment Formula (PMT)", "P × r ÷ [1 − (1 + r)^−n]", "p:Principal=250000|r%:Annual Rate=6.5|y:Years=30|m:Payments per Year=12", (v) => { const i = v.r / v.m, n = v.y * v.m; return (v.p * i) / (1 - (1 + i) ** -n); }, "$");
f(C14, "Sinking Fund Periodic Deposit Requirement", "FV × r ÷ [(1 + r)^n − 1]", "fv:Target Amount=100000|r%:Rate per Period=5|n:Periods=10", (v) => (v.fv * v.r) / ((1 + v.r) ** v.n - 1), "$");

// ================= 15. Bankruptcy Analytics =================
const C15 = 15;
f(C15, "Ohlson O-Score Bankruptcy Probabilistic Variable", "P = 1 ÷ (1 + e^−O)", "o:O-Score=-2.5", (v) => 1 / (1 + Math.exp(-v.o)), "%");
f(C15, "Springate Score Solvency Variable", "1.03A + 3.07B + 0.66C + 0.4D", "a:WC/TA=0.13|b:EBIT/TA=0.12|c:EBT/CL=0.58|d:Sales/TA=0.56", (v) => 1.03 * v.a + 3.07 * v.b + 0.66 * v.c + 0.4 * v.d, "");
f(C15, "Zmijewski Score Financial Distress Parameter", "−4.336 − 4.513(NI/TA) + 5.679(TL/TA) + 0.004(CA/CL)", "roa:NI/TA=0.076|lev:TL/TA=0.56|liq:CA/CL=1.8", (v) => -4.336 - 4.513 * v.roa + 5.679 * v.lev + 0.004 * v.liq, "");
f(C15, "Weighted Average Cost of Capital (WACC) with Flotation Costs", "E/V × Re/(1 − f) + D/V × Rd(1 − T)", "e:Equity=400000|d:Debt=300000|re%:Cost of Equity=11|f%:Flotation Cost=4|rd%:Cost of Debt=6|t%:Tax Rate=21", (v) => { const V = v.e + v.d; return (v.e / V) * (v.re / (1 - v.f)) + (v.d / V) * v.rd * (1 - v.t); }, "%");
f(C15, "Capital Marginal Cost Schedule (MCC) Break Point", "Amount of Lower-Cost Capital ÷ Weight in Capital Structure", "a:Retained Earnings Available=300000|w%:Equity Weight=60", (v) => v.a / v.w, "$");
f(C15, "Dividend Growth Rate (Sustainable PRAT Model)", "Profit Margin × Retention × Asset Turnover × Leverage", "p%:Profit Margin=13.7|r%:Retention=71|a:Asset Turnover=0.56|t:Equity Multiplier=2.25", (v) => v.p * v.r * v.a * v.t, "%");
f(C15, "Value-at-Risk Expected Shortfall (Tail VaR)", "μ − σ × φ(z) ÷ (1 − c)  × Value", "pv:Value=1000000|m%:Mean Return=0.05|s%:Volatility=2|z:Z=1.645", (v) => v.pv * ((v.s * normPdf(v.z)) / (1 - normCdf(v.z)) - v.m), "$");
f(C15, "Market Risk Premium Ex-Post Calculation", "Average Realized Market Return − Average Risk-Free", "*m:Market Returns=0.12,0.08,-0.05,0.15,0.10|*r:Risk-Free Returns=0.02,0.025,0.03,0.035,0.04", (v) => mean(v.m) - mean(v.r), "%");
f(C15, "Liquidation Value Variance Adjustment", "Σ Asset Book Value × Recovery Rate − Liquidation Costs", "b:Asset Book Value=900000|rr%:Recovery Rate=55|lc:Liquidation Costs=60000", (v) => v.b * v.rr - v.lc, "$");
f(C15, "Post-Restructuring Debt-to-Equity Target", "(Debt − Debt Converted) ÷ (Equity + Debt Converted)", "d:Debt=500000|c:Debt-for-Equity Swap=200000|e:Equity=250000", (v) => (v.d - v.c) / (v.e + v.c), "x");

// ================= 16. Macro =================
const C16 = 16;
f(C16, "Herfindahl-Hirschman Index (HHI) Industry Concentration", "Σ (s_i)², shares in whole %", "*s:Market Shares=30,25,20,15,10", (v) => sum(v.s.map((x: number) => x * x)), "");
f(C16, "Four-Firm Concentration Ratio (CR4)", "Sum of 4 largest market shares", "*s:Market Shares (whole %)=30,25,20,15,10", (v) => sum([...v.s].sort((a, b) => b - a).slice(0, 4)), "");
f(C16, "Consumer Price Index (CPI) Inflation Adjuster", "Nominal Value × (CPI_target ÷ CPI_base)", "n:Nominal Value=1000|t:CPI Target=310|b:CPI Base=255", (v) => (v.n * v.t) / v.b, "$");
f(C16, "Producer Price Index (PPI) Deflator Multiplier", "Nominal Value ÷ (PPI ÷ 100)", "n:Nominal Value=1000|p:PPI=135", (v) => v.n / (v.p / 100), "$");
f(C16, "Real GDP-to-Nominal GDP Deflator Formula", "(Nominal GDP ÷ Real GDP) × 100", "n:Nominal GDP=27000|r:Real GDP=22500", (v) => (v.n / v.r) * 100, "");
f(C16, "Marginal Propensity to Consume (MPC)", "ΔConsumption ÷ ΔIncome", "c:Change in Consumption=800|y:Change in Income=1000", (v) => v.c / v.y, "");
f(C16, "Marginal Propensity to Save (MPS)", "ΔSaving ÷ ΔIncome", "s:Change in Saving=200|y:Change in Income=1000", (v) => v.s / v.y, "");
f(C16, "Keynesian Multiplier", "1 ÷ (1 − MPC)", "mpc:MPC=0.8", (v) => 1 / (1 - v.mpc), "x");
f(C16, "Velocity of Money (Fisher Equation)", "V = (P × Q) ÷ M", "gdp:Nominal GDP=27000|m:Money Supply=21000", (v) => v.gdp / v.m, "x");
f(C16, "Okun's Law (Unemployment vs. GDP Output)", "%ΔGDP gap = −β × (u − u*)", "b:Okun Coefficient=2|u%:Unemployment=6|n%:Natural Rate=4", (v) => -v.b * (v.u - v.n), "%");
f(C16, "Purchasing Power Parity (PPP) Absolute Line", "Exchange Rate = P_domestic ÷ P_foreign", "pd:Domestic Price Level=120|pf:Foreign Price Level=100", (v) => v.pd / v.pf, "");
f(C16, "Purchasing Power Parity (PPP) Relative Change Line", "%ΔS ≈ π_domestic − π_foreign", "pd%:Domestic Inflation=4|pf%:Foreign Inflation=2", (v) => v.pd - v.pf, "%");
f(C16, "Gini Coefficient Market Inequality Metric", "Σ(2i − n − 1)x_i ÷ (n Σx_i)", "*x:Incomes=20000,35000,50000,80000,250000", (v) => gini(v.x), "");
f(C16, "Lorenz Curve Cumulative Integration Metric", "Area under Lorenz curve = (1 − Gini) ÷ 2", "*x:Incomes=20000,35000,50000,80000,250000", (v) => (1 - gini(v.x)) / 2, "");
f(C16, "Real Interest Rate (Fisher Effect Line)", "(1 + i) ÷ (1 + π) − 1", "i%:Nominal Rate=6|p%:Inflation=3", (v) => (1 + v.i) / (1 + v.p) - 1, "%");

// ================= 17. Insurance =================
const C17 = 17;
f(C17, "Loss Ratio (Claims Paid / Premiums Earned)", "Claims Paid ÷ Premiums Earned", "c:Claims=6500000|p:Premiums Earned=10000000", (v) => v.c / v.p, "%");
f(C17, "Expense Ratio (Underwriting Costs / Written Premiums)", "Underwriting Expenses ÷ Written Premiums", "e:Underwriting Expenses=2800000|w:Written Premiums=10500000", (v) => v.e / v.w, "%");
f(C17, "Combined Ratio (Loss Ratio + Expense Ratio)", "Loss Ratio + Expense Ratio", "l%:Loss Ratio=65|e%:Expense Ratio=26.7", (v) => v.l + v.e, "%");
f(C17, "Gross Written Premium Growth Rate", "(GWP this year − GWP last year) ÷ GWP last year", "n:GWP This Year=10500000|p:GWP Last Year=9600000", (v) => (v.n - v.p) / v.p, "%");
f(C17, "Net Retention Ratio (Insurance Underwriting)", "Net Written Premium ÷ Gross Written Premium", "n:Net Written=8400000|g:Gross Written=10500000", (v) => v.n / v.g, "%");
f(C17, "Frequency-Severity Risk Distribution Output", "Expected Loss = Frequency × Severity", "f:Claims per Policy=0.08|s:Average Severity=12000", (v) => v.f * v.s, "$");
f(C17, "Pure Premium Pricing Basis", "Total Losses ÷ Exposure Units", "l:Total Losses=6500000|e:Exposure Units=8000", (v) => v.l / v.e, "$");
f(C17, "Loss Reserve Triangulation Factor (Chain Ladder Method)", "Σ Losses at t+1 ÷ Σ Losses at t", "*a:Cumulative at Age t=1000,1100,1200|*b:Cumulative at Age t+1=1500,1650,1750", (v) => sum(v.b) / sum(v.a), "");
f(C17, "Ultimate Incurred Losses Extrapolation Parameter", "Reported Losses × Cumulative Development Factor", "r:Reported Losses=1200000|cdf:CDF=1.45", (v) => v.r * v.cdf, "$");
f(C17, "Bornhuetter-Ferguson Loss Allocation Value", "Reported + Expected Losses × (1 − 1/CDF)", "r:Reported=1200000|el:Expected Losses (Premium × ELR)=1700000|cdf:CDF=1.45", (v) => v.r + v.el * (1 - 1 / v.cdf), "$");
f(C17, "Capital Adequacy Solvency Ratio", "Available Capital ÷ Required Capital", "a:Available Capital=4000000|r:Required Capital=2500000", (v) => v.a / v.r, "%");
f(C17, "Risk-Based Capital (RBC) Minimum Target", "Authorized Control Level × Target Multiple", "acl:Authorized Control Level=1200000|m:Target Multiple=2", (v) => v.acl * v.m, "$");

// ================= 18. HR =================
const C18 = 18;
f(C18, "Revenue Per Employee (Total Revenue / FTE Count)", "Revenue ÷ FTE", "r:Revenue=500000|f:FTE=12", (v) => v.r / v.f, "$");
f(C18, "Profit Per Employee (Net Income / FTE Count)", "Net Income ÷ FTE", "n:Net Income=68730|f:FTE=12", (v) => v.n / v.f, "$");
f(C18, "Employee Turnover Rate Percentage", "Separations ÷ Average Headcount", "s:Separations=3|h:Average Headcount=12", (v) => v.s / v.h, "%");
f(C18, "Employee Cost-to-Revenue Leverage Factor", "Total Employee Cost ÷ Revenue", "c:Employee Cost=180000|r:Revenue=500000", (v) => v.c / v.r, "%");
f(C18, "Fully Burdened Labor Cost Multiplier", "(Wages + Taxes + Benefits + Overhead) ÷ Wages", "w:Wages=60000|t:Payroll Taxes=5000|b:Benefits=12000|o:Overhead=8000", (v) => (v.w + v.t + v.b + v.o) / v.w, "x");
f(C18, "Total Compensation Cost Ratio", "Total Compensation ÷ Operating Expenses", "c:Total Compensation=180000|o:Operating Expenses=300000", (v) => v.c / v.o, "%");
f(C18, "Overtime Pay Premium Component", "OT Hours × Base Rate × (Multiplier − 1)", "h:OT Hours=40|r:Base Rate=25|m:Multiplier=1.5", (v) => v.h * v.r * (v.m - 1), "$");
f(C18, "Absenteeism Rate Percentage", "Days Absent ÷ Scheduled Work Days", "a:Days Absent=36|s:Scheduled Days=2880", (v) => v.a / v.s, "%");
f(C18, "Human Capital ROI (HCROI)", "(Revenue − (OPEX − Employee Costs)) ÷ Employee Costs", "r:Revenue=500000|o:OPEX=400000|c:Employee Costs=180000", (v) => (v.r - (v.o - v.c)) / v.c, "x");
f(C18, "Training Cost per Employee Allocation", "Total Training Cost ÷ Employees Trained", "t:Training Cost=24000|e:Employees=12", (v) => v.t / v.e, "$");
f(C18, "Time-to-Hire Velocity Variable", "Σ Days to Hire ÷ Number of Hires", "*d:Days per Hire=28,35,21,40", (v) => mean(v.d), "d");
f(C18, "Benefits-to-Salary Expense Multiplier", "Total Benefits ÷ Total Salaries", "b:Benefits=40000|s:Salaries=140000", (v) => v.b / v.s, "%");

// ================= 19. Statistics =================
const C19 = 19;
const XY = "*x:X values=1,2,3,4,5,6|*y:Y values=2.1,3.9,6.2,7.8,10.1,12.2";
f(C19, "Simple Linear Regression Slope (β1)", "Σ(x − x̄)(y − ȳ) ÷ Σ(x − x̄)²", XY, (v) => regress(v.x, v.y).b1, "");
f(C19, "Simple Linear Regression Intercept (β0)", "ȳ − β1 x̄", XY, (v) => regress(v.x, v.y).b0, "");
f(C19, "Coefficient of Determination (R²)", "1 − SSres ÷ SStot", XY, (v) => regress(v.x, v.y).r2, "");
f(C19, "Adjusted R² (Multi-Variable Penalty Line)", "1 − (1 − R²)(n − 1) ÷ (n − k − 1)", "r2:R²=0.85|n:Observations=50|k:Predictors=3", (v) => 1 - ((1 - v.r2) * (v.n - 1)) / (v.n - v.k - 1), "");
f(C19, "Mean Absolute Error (MAE) Model Loss", "Σ|y − ŷ| ÷ n", "*a:Actual=10,12,15,11|*p:Predicted=11,12,13,12", (v) => mean(v.a.map((x: number, i: number) => Math.abs(x - v.p[i]))), "");
f(C19, "Mean Squared Error (MSE) Model Loss", "Σ(y − ŷ)² ÷ n", "*a:Actual=10,12,15,11|*p:Predicted=11,12,13,12", (v) => mean(v.a.map((x: number, i: number) => (x - v.p[i]) ** 2)), "");
f(C19, "Root Mean Squared Error (RMSE) Model Loss", "√MSE", "*a:Actual=10,12,15,11|*p:Predicted=11,12,13,12", (v) => Math.sqrt(mean(v.a.map((x: number, i: number) => (x - v.p[i]) ** 2))), "");
f(C19, "Logistic Regression Odds-Ratio Transformation", "Odds Ratio = e^β", "b:Coefficient β=0.7", (v) => Math.exp(v.b), "x");
f(C19, "Chi-Square Test Contingency Distribution Statistic", "Σ (O − E)² ÷ E", "*o:Observed=50,30,20|*e:Expected=40,35,25", (v) => sum(v.o.map((x: number, i: number) => (x - v.e[i]) ** 2 / v.e[i])), "");
f(C19, "ANOVA F-Statistic Variance Component", "MS_between ÷ MS_within", "msb:MS Between=48|msw:MS Within=12", (v) => v.msb / v.msw, "");
f(C19, "Moving Average Smoothing Window (MA)", "Average of last k observations", "k:Window=3|*x:Series=100,104,98,110,115,120", (v) => mean(v.x.slice(-v.k)), "");
f(C19, "Exponential Smoothing Tracking Signal (Alpha Weight)", "Ft+1 = αAt + (1 − α)Ft", "a:Alpha=0.3|at:Actual=120|ft:Previous Forecast=112", (v) => v.a * v.at + (1 - v.a) * v.ft, "");
f(C19, "Z-Score Normalization Formula", "(x − μ) ÷ σ", "x:Value=85|m:Mean=70|s:Std Dev=10", (v) => (v.x - v.m) / v.s, "");

// ================= 20. REIT =================
const C20 = 20;
f(C20, "Funds From Operations (FFO)", "Net Income + Depreciation + Amortization − Gains on Sales", "ni:Net Income=4000000|d:Depreciation=2500000|a:Amortization=300000|g:Gains on Sales=500000", (v) => v.ni + v.d + v.a - v.g, "$");
f(C20, "Adjusted Funds From Operations (AFFO)", "FFO − Recurring CapEx − Straight-line Rent Adj.", "ffo:FFO=6300000|cx:Recurring CapEx=700000|sl:Straight-Line Adj=150000", (v) => v.ffo - v.cx - v.sl, "$");
f(C20, "Net Asset Value (NAV) per Share", "(Property Value + Other Assets − Liabilities) ÷ Shares", "p:Property Value=120000000|o:Other Assets=8000000|l:Liabilities=50000000|s:Shares=4000000", (v) => (v.p + v.o - v.l) / v.s, "$");
f(C20, "Loan-to-Cost (LTC) Ratio", "Loan Amount ÷ Total Project Cost", "l:Loan=7000000|c:Project Cost=10000000", (v) => v.l / v.c, "%");
f(C20, "Gross Margin Valuation Component", "(Sale Value − Development Cost) ÷ Sale Value", "s:Sale Value=13000000|c:Development Cost=10000000", (v) => (v.s - v.c) / v.s, "%");
f(C20, "Debt Service Coverage Ratio (DSCR Matrix Output)", "NOI ÷ Debt Service", "noi:NOI=950000|ds:Debt Service=700000", (v) => v.noi / v.ds, "x");
f(C20, "Break-Even Occupancy Rate Percentage", "(Operating Expenses + Debt Service) ÷ Gross Potential Income", "o:OPEX=550000|ds:Debt Service=700000|g:Gross Potential Income=1600000", (v) => (v.o + v.ds) / v.g, "%");
f(C20, "Capital Improvement Value Shield", "Annual Depreciation on Improvements × Tax Rate", "c:Improvement Cost=390000|y:Recovery Years=39|t%:Tax Rate=21", (v) => (v.c / v.y) * v.t, "$");
f(C20, "Residual Land Value Valuation Model", "GDV − Build Costs − Fees − Developer Profit", "gdv:Gross Development Value=13000000|b:Build Costs=8000000|f:Fees=900000|p%:Developer Profit (% of GDV)=15", (v) => v.gdv - v.b - v.f - v.gdv * v.p, "$");
f(C20, "Equivalent Continuous Lease Discount Factor", "e^(−r t)", "r%:Rate=6|t:Years=5", (v) => Math.exp(-v.r * v.t), "");

// ================= 21. Logistics =================
const C21 = 21;
f(C21, "Bullwhip Effect Variance Amplification Ratio", "Variance of Orders ÷ Variance of Demand", "*o:Orders=100,140,80,160,90|*d:Demand=100,110,95,115,100", (v) => variance(v.o) / variance(v.d), "x");
f(C21, "Warehouse Cube Utilization Rate Percentage", "Used Storage Volume ÷ Total Storage Volume", "u:Used Volume (m³)=7200|t:Total Volume (m³)=10000", (v) => v.u / v.t, "%");
f(C21, "On-Time In-Full (OTIF) Delivery Rate", "Orders On-Time & In-Full ÷ Total Orders", "o:OTIF Orders=930|t:Total Orders=1000", (v) => v.o / v.t, "%");
f(C21, "Perfect Order Rate Percentage", "%On-Time × %Complete × %Damage-Free × %Correct Docs", "a%:On-Time=96|b%:Complete=97|c%:Damage-Free=99|d%:Correct Docs=98", (v) => v.a * v.b * v.c * v.d, "%");
f(C21, "Total Cost of Logistics Framework", "Transport + Warehousing + Inventory Carrying + Admin", "t:Transport=200000|w:Warehousing=120000|i:Inventory Carrying=80000|a:Admin=30000", (v) => v.t + v.w + v.i + v.a, "$");
f(C21, "Fill Rate Performance Component", "Units Shipped ÷ Units Ordered", "s:Units Shipped=9600|o:Units Ordered=10000", (v) => v.s / v.o, "%");
f(C21, "Backorder Rate Percentage", "Backordered Orders ÷ Total Orders", "b:Backorders=45|t:Total Orders=1000", (v) => v.b / v.t, "%");
f(C21, "Transit Time Variance Parameter", "Variance of transit times", "*t:Transit Days=3,4,3,5,4,6", (v) => variance(v.t), "");
f(C21, "Freight Cost per Unit Shipped", "Total Freight Cost ÷ Units Shipped", "f:Freight Cost=48000|u:Units Shipped=9600", (v) => v.f / v.u, "$");
f(C21, "Inventory Turnover Ratio (COGS Basis)", "COGS ÷ Average Inventory", "c:COGS=225000|i:Average Inventory=37500", (v) => v.c / v.i, "x");

// ================= 22. Marketing =================
const C22 = 22;
f(C22, "Return on Ad Spend (ROAS)", "Ad Revenue ÷ Ad Spend", "r:Revenue from Ads=60000|s:Ad Spend=15000", (v) => v.r / v.s, "x");
f(C22, "Customer Conversion Rate Percentage", "Conversions ÷ Visitors", "c:Conversions=320|v:Visitors=16000", (v) => v.c / v.v, "%");
f(C22, "Click-Through Rate (CTR)", "Clicks ÷ Impressions", "c:Clicks=4200|i:Impressions=300000", (v) => v.c / v.i, "%");
f(C22, "Cost Per Click (CPC)", "Ad Spend ÷ Clicks", "s:Ad Spend=15000|c:Clicks=4200", (v) => v.s / v.c, "$");
f(C22, "Cost Per Mille / Thousand Impressions (CPM)", "Ad Spend ÷ Impressions × 1000", "s:Ad Spend=15000|i:Impressions=300000", (v) => (v.s / v.i) * 1000, "$");
f(C22, "Cost Per Acquisition (CPA)", "Ad Spend ÷ Acquisitions", "s:Ad Spend=15000|a:Acquisitions=320", (v) => v.s / v.a, "$");
f(C22, "Marketing Contribution Margin", "Marketing-Attributed Revenue − Variable Costs − Marketing Spend", "r:Attributed Revenue=60000|vc:Variable Costs=24000|m:Marketing Spend=15000", (v) => v.r - v.vc - v.m, "$");
f(C22, "Marketing Attribution Weight (Linear Framework)", "Conversion Value ÷ Touchpoints", "v:Conversion Value=500|t:Touchpoints=4", (v) => v.v / v.t, "$");
f(C22, "Marketing Attribution Weight (Time-Decay Framework)", "2^(−days before conversion ÷ half-life) normalized share", "d:Days Before Conversion=2|h:Half-Life (days)=7|*all:All Touchpoint Days=14,7,2,0", (v) => { const w = (x: number) => 2 ** (-x / v.h); return w(v.d) / sum(v.all.map(w)); }, "%");
f(C22, "Bounce Rate Percentage", "Single-Page Sessions ÷ Total Sessions", "b:Bounced Sessions=6400|t:Total Sessions=16000", (v) => v.b / v.t, "%");
f(C22, "Net Promoter Score (NPS) Raw Value", "% Promoters − % Detractors", "p:Promoters=520|d:Detractors=130|t:Total Responses=1000", (v) => ((v.p - v.d) / v.t) * 100, "");
f(C22, "Customer Satisfaction Score (CSAT) Percentage", "Satisfied Responses ÷ Total Responses", "s:Satisfied (4-5)=840|t:Total Responses=1000", (v) => v.s / v.t, "%");

// ================= 23. Startup, Venture & Corporate Structure =================
const C23 = 23;
f(C23, "Post-Money Valuation", "Pre-Money Valuation + New Investment", "pre:Pre-Money Valuation=4000000|inv:New Investment=1000000", (v) => v.pre + v.inv, "$");
f(C23, "Investor Ownership Percentage", "Investment ÷ (Pre-Money + Investment)", "inv:Investment=1000000|pre:Pre-Money Valuation=4000000", (v) => v.inv / (v.pre + v.inv), "%");
f(C23, "Founder Dilution After Round", "Founder % × Pre-Money ÷ Post-Money", "fo%:Founder Ownership Before=80|pre:Pre-Money=4000000|inv:Investment=1000000", (v) => v.fo * v.pre / (v.pre + v.inv), "%");
f(C23, "Price per Share (Priced Round)", "Pre-Money Valuation ÷ Fully Diluted Shares", "pre:Pre-Money Valuation=4000000|sh:Fully Diluted Shares=10000000", (v) => v.pre / v.sh, "$");
f(C23, "Option Pool Shuffle — Effective Pre-Money", "Pre-Money − (Post-Money × Option Pool %)", "pre:Headline Pre-Money=4000000|inv:Investment=1000000|op%:Target Option Pool=10", (v) => v.pre - (v.pre + v.inv) * v.op, "$");
f(C23, "SAFE Conversion Price", "min(Cap ÷ Shares, Round Price × (1 − Discount))", "cap:Valuation Cap=6000000|sh:Pre-Round Shares=10000000|rp:Round Price per Share=0.8|d%:Discount=20", (v) => Math.min(v.cap / v.sh, v.rp * (1 - v.d)), "$");
f(C23, "SAFE Shares Issued", "SAFE Investment ÷ Conversion Price", "inv:SAFE Amount=250000|cp:Conversion Price=0.6", (v) => v.inv / v.cp, "u");
f(C23, "Convertible Note Payoff with Interest", "Principal × (1 + Rate × Years)", "p:Principal=250000|r%:Annual Interest=6|y:Years Outstanding=1.5", (v) => v.p * (1 + v.r * v.y), "$");
f(C23, "Gross Burn Rate", "Total Monthly Operating Cash Out", "pay:Payroll=60000|rent:Rent & Facilities=8000|ops:Software & Ops=12000|mkt:Marketing=15000", (v) => v.pay + v.rent + v.ops + v.mkt, "$");
f(C23, "Net Burn Rate", "Monthly Cash Out − Monthly Cash In", "out:Monthly Cash Out=95000|inn:Monthly Revenue Collected=35000", (v) => v.out - v.inn, "$");
f(C23, "Cash Runway", "Cash Balance ÷ Net Monthly Burn", "c:Cash Balance=900000|b:Net Monthly Burn=60000", (v) => v.c / v.b, "mo");
f(C23, "Default Alive Break-even Growth Needed", "(Expenses ÷ Revenue)^(1 ÷ Runway Months) − 1", "e:Monthly Expenses=95000|r:Monthly Revenue=35000|m:Runway Months=15", (v) => (v.e / v.r) ** (1 / v.m) - 1, "%");
f(C23, "SaaS Rule of 40", "Revenue Growth % + FCF Margin %", "g%:Revenue Growth=35|m%:FCF Margin=8", (v) => v.g + v.m, "%");
f(C23, "SaaS Magic Number", "(ΔQuarterly Revenue × 4) ÷ Prior Quarter S&M Spend", "d:Quarterly Revenue Increase=120000|sm:Prior Quarter S&M=400000", (v) => (v.d * 4) / v.sm, "x");
f(C23, "Burn Multiple", "Net Burn ÷ Net New ARR", "b:Net Burn (period)=1800000|a:Net New ARR=1200000", (v) => v.b / v.a, "x");
f(C23, "LTV to CAC Ratio", "(ARPA × Gross Margin ÷ Churn) ÷ CAC", "a:Monthly ARPA=200|gm%:Gross Margin=80|ch%:Monthly Churn=2|cac:CAC=1600", (v) => (v.a * v.gm / v.ch) / v.cac, "x");
f(C23, "CAC Payback Period", "CAC ÷ (ARPA × Gross Margin)", "cac:CAC=1600|a:Monthly ARPA=200|gm%:Gross Margin=80", (v) => v.cac / (v.a * v.gm), "mo");
f(C23, "VC Method Pre-Money Valuation", "Exit Value ÷ Target ROI − Investment", "ex:Expected Exit Value=60000000|roi:Target Multiple (x)=10|inv:Investment=1000000", (v) => v.ex / v.roi - v.inv, "$");
f(C23, "Liquidation Preference Payout", "min(Proceeds, Investment × Preference Multiple)", "pr:Exit Proceeds=8000000|inv:Investment=3000000|m:Preference Multiple=1", (v) => Math.min(v.pr, v.inv * v.m), "$");
f(C23, "Enterprise Value (EV Bridge)", "Equity Value + Total Debt + Preferred + Minority − Cash", "e:Equity Value=20000000|d:Total Debt=5000000|p:Preferred Stock=0|mi:Minority Interest=500000|c:Cash=3000000", (v) => v.e + v.d + v.p + v.mi - v.c, "$");
f(C23, "Equity Value from Enterprise Value", "EV − Net Debt", "ev:Enterprise Value=22500000|d:Total Debt=5000000|c:Cash=3000000", (v) => v.ev - (v.d - v.c), "$");
f(C23, "EVA Full Build (EBIT → Value Created)", "EBIT × (1 − T) − (Debt + Equity) × WACC", "ebit:EBIT=1200000|t%:Tax Rate=25|d:Debt Capital=3000000|e:Equity Capital=5000000|w%:WACC=9", (v) => v.ebit * (1 - v.t) - (v.d + v.e) * v.w, "$");
f(C23, "EVA from ROIC Spread", "(ROIC − WACC) × Invested Capital", "roic%:ROIC=14|w%:WACC=9|ic:Invested Capital=8000000", (v) => (v.roic - v.w) * v.ic, "$");
f(C23, "Market Value Added (MVA)", "Market Value of Firm − Invested Capital", "mv:Market Value=30000000|ic:Invested Capital=8000000", (v) => v.mv - v.ic, "$");
f(C23, "DuPont 5-Factor ROE", "Tax Burden × Interest Burden × EBIT Margin × Asset Turnover × Equity Multiplier", "ni:Net Income=600000|ebt:EBT=800000|ebit:EBIT=1000000|rev:Revenue=8000000|ta:Total Assets=10000000|eq:Equity=5000000", (v) => (v.ni / v.ebt) * (v.ebt / v.ebit) * (v.ebit / v.rev) * (v.rev / v.ta) * (v.ta / v.eq), "%");
f(C23, "Debt-to-Capital Structure Ratio", "Debt ÷ (Debt + Equity)", "d:Total Debt=3000000|e:Total Equity=5000000", (v) => v.d / (v.d + v.e), "%");
f(C23, "Levered Beta (Hamada)", "Unlevered β × (1 + (1 − T) × D/E)", "bu:Unlevered Beta=0.9|t%:Tax Rate=25|d:Debt=3000000|e:Equity=5000000", (v) => v.bu * (1 + (1 - v.t) * v.d / v.e), "");
f(C23, "Cost of Equity (CAPM + Size Premium)", "Rf + β × MRP + Size Premium", "rf%:Risk-Free Rate=4.5|b:Beta=1.2|mrp%:Market Risk Premium=5.5|sp%:Size Premium=3", (v) => v.rf + v.b * v.mrp + v.sp, "%");
f(C23, "Unit Economics Contribution per Customer", "Revenue per Customer − Variable Cost − CAC", "r:Lifetime Revenue=4800|vc:Variable Cost=960|cac:CAC=1600", (v) => v.r - v.vc - v.cac, "$");
f(C23, "Startup Break-even Customers", "Monthly Fixed Costs ÷ (ARPA × Gross Margin)", "fc:Monthly Fixed Costs=95000|a:Monthly ARPA=200|gm%:Gross Margin=80", (v) => v.fc / (v.a * v.gm), "u");
f(C23, "Employee Equity Value at Exit", "Options × (Exit Price per Share − Strike)", "o:Options Granted=50000|px:Exit Price per Share=6|k:Strike Price=0.4", (v) => v.o * Math.max(0, v.px - v.k), "$");
f(C23, "Total Startup Capital Requirement", "Setup Costs + (Monthly Burn × Months to Break-even) + Safety Buffer", "s:One-time Setup Costs=150000|b:Monthly Burn=60000|m:Months to Break-even=18|buf%:Safety Buffer=20", (v) => (v.s + v.b * v.m) * (1 + v.buf), "$");

export const formulasByCat = (cat: number) => FORMULAS.filter((x) => x.cat === cat);
export const getFormula = (id: string) => FORMULAS.find((x) => x.id === id);
