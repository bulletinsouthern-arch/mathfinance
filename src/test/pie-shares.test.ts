import { describe, expect, it } from "vitest";
import { pieShares, splitTerms } from "@/lib/pie-shares";

describe("business pie shares", () => {
  it("compares debt with total sales, not with the raw inputs", () => {
    const r = pieShares("Price * Units - Debt", { Price: 1000, Units: 1000, Debt: 5000 })!;
    expect(r.base).toBe(1_000_000);
    expect(r.slices.map((s) => [s.kind, s.value, Number(s.share.toFixed(2))])).toEqual([["out", 5000, 0.5], ["net", 995_000, 99.5]]);
  });

  it("splits added parts by their share of the total", () => {
    const r = pieShares("Income + Salary", { Income: 3000, Salary: 1000 })!;
    expect(r.slices.map((s) => s.share)).toEqual([75, 25]);
  });

  it("shows a shortfall when costs are bigger than income", () => {
    const r = pieShares("Sales - Costs", { Sales: 600, Costs: 1000 })!;
    expect(r.base).toBe(1000);
    expect(r.slices.map((s) => [s.kind, s.share])).toEqual([["in", 60], ["short", 40]]);
  });

  it("keeps brackets, unary signs and exponents inside a term", () => {
    expect(splitTerms("a * (b - c) + -d - 1e-5").map((t) => [t.sign, t.src])).toEqual([[1, "a * (b - c)"], [1, "-d"], [-1, "1e-5"]]);
    expect(pieShares("Price * Units", { Price: 2, Units: 3 })).toBeNull();
  });
});
