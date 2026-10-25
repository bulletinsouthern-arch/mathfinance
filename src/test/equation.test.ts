import { describe, expect, it } from "vitest";
import { equationVars, evaluateEquation, toEditable } from "@/lib/equation";

describe("custom equations", () => {
  it("respects operator precedence and parentheses", () => {
    expect(evaluateEquation("(Revenue - Expenses) / Units", { Revenue: 1000, Expenses: 400, Units: 10 })).toBe(60);
    expect(evaluateEquation("2 + 3 * 4 ^ 2", {})).toBe(50);
  });
  it("computes EVA = NOPAT - Capital * WACC", () => {
    expect(evaluateEquation("NOPAT - Capital * WACC", { NOPAT: 500, Capital: 2000, WACC: 0.1 })).toBe(300);
  });
  it("lists variables but not functions", () => {
    expect(equationVars("sqrt(a) + b * a")).toEqual(["a", "b"]);
  });
  it("converts library formulas to editable form", () => {
    expect(toEditable("Price × Units Sold")).toBe("Price * Units_Sold");
  });
  it("rejects missing values", () => {
    expect(() => evaluateEquation("x + 1", {})).toThrow();
  });
});
