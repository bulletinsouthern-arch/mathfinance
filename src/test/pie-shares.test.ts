import { describe, expect, it } from "vitest";
import { pieShares, rawShares, splitTerms } from "@/lib/pie-shares";

const round = (n: number) => Number(n.toFixed(1));

describe("business pie shares", () => {
  const nums = { Price: 500, Units_Sold: 1000, Debt: 2000 };

  it("Raw Input Share adds the typed numbers together", () => {
    expect(rawShares(nums).map((s) => [s.key, round(s.share)])).toEqual([["Price", 14.3], ["Units_Sold", 28.6], ["Debt", 57.1]]);
  });

  it("Financial Reality compares debt with revenue", () => {
    const r = pieShares("Price * Units_Sold - Debt", nums)!;
    expect(r.revenue).toBe(500_000);
    expect(r.base).toBe(502_000);
    expect(r.slices.map((s) => [s.kind, s.value, round(s.share)])).toEqual([["in", 500_000, 99.6], ["out", 2000, 0.4]]);
    expect(r.debtToRevenue).toBe(0.4);
  });

  it("splits added parts by their share of the total", () => {
    const r = pieShares("Income + Salary", { Income: 3000, Salary: 1000 })!;
    expect(r.slices.map((s) => s.share)).toEqual([75, 25]);
    expect(r.debtToRevenue).toBe(0);
  });

  it("handles costs bigger than income", () => {
    const r = pieShares("Sales - Costs", { Sales: 600, Costs: 1000 })!;
    expect(r.base).toBe(1600);
    expect(r.slices.map((s) => [s.kind, s.share])).toEqual([["in", 37.5], ["out", 62.5]]);
    expect(round(r.debtToRevenue!)).toBe(166.7);
  });

  it("keeps brackets, unary signs and exponents inside a term", () => {
    expect(splitTerms("a * (b - c) + -d - 1e-5").map((t) => [t.sign, t.src])).toEqual([[1, "a * (b - c)"], [1, "-d"], [-1, "1e-5"]]);
    expect(pieShares("Price * Units", { Price: 2, Units: 3 })).toBeNull();
  });
});
