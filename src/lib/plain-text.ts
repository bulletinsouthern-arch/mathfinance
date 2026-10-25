// Turns stray LaTeX/markdown from the AI into readable plain text.
export function toPlainText(s: string): string {
  let t = s;
  t = t.replace(/\\\[|\\\]|\\\(|\\\)|\$\$?/g, "");
  for (let i = 0; i < 3; i++) t = t.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1) / ($2)");
  t = t.replace(/\\(?:text|mathrm|mathbf|operatorname|textbf)\s*\{([^{}]*)\}/g, "$1");
  t = t.replace(/\\(?:times|cdot)/g, "×").replace(/\\div/g, "÷").replace(/\\approx/g, "≈").replace(/\\le(q)?/g, "≤").replace(/\\ge(q)?/g, "≥").replace(/\\pm/g, "±").replace(/\\%/g, "%");
  t = t.replace(/\\(?:Big|big|Bigg|bigg)[lr]?|\\left|\\right|\\begin\{[^}]*\}|\\end\{[^}]*\}|\\quad|\\,|\\;|\\!/g, "");
  t = t.replace(/\\([a-zA-Z]+)/g, "$1");
  t = t.replace(/[{}]/g, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#{1,6}\s*/gm, "");
  return t.replace(/[ \t]{2,}/g, " ").trim();
}
