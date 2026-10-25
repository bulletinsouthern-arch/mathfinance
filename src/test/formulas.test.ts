import { describe, expect, it } from "vitest";
import { compute, getFormula, FORMULAS } from "@/lib/formulas";
const run = (name: string, v: Record<string, string>) => compute(FORMULAS.find((f) => f.name === name)!, v);
describe("formulas", () => {
  it("has 22 categories populated", () => { expect(new Set(FORMULAS.map((f) => f.cat)).size).toBe(22); });
  it("gross profit", () => { expect(run("Gross Profit", { rev: "500", cogs: "200" })).toBe(300); });
  it("EOQ", () => { expect(run("Economic Order Quantity (EOQ)", { d: "1000", s: "10", h: "2" })).toBeCloseTo(100); });
  it("IRR of -100, 110 is 10%", () => { expect(run("Internal Rate of Return (IRR)", { cf: "-100,110" })).toBeCloseTo(0.1, 4); });
  it("Black-Scholes call ATM", () => { expect(run("Black-Scholes Call Option Model Value", { s: "100", k: "100", t: "1", r: "5", v: "20" })).toBeCloseTo(10.45, 1); });
  it("every default computes a finite number", () => {
    const bad = FORMULAS.filter((f) => !Number.isFinite(compute(f, {}))).map((f) => f.name);
    expect(bad).toEqual([]);
  });
  it("lookup by id", () => { expect(getFormula(FORMULAS[0].id)?.name).toBe("Revenue"); });
});
