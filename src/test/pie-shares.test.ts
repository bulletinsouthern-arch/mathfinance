import { describe, expect, it } from "vitest";
import { financialPool, rawPool, ringSlices, splitLast, splitTerms } from "@/lib/pie-shares";

const round = (n: number) => Number(n.toFixed(2));
const nums = { Price: 500, Units_Sold: 1000, Debt: 2000 };
const shares = (p: ReturnType<typeof rawPool>) => p.items.map((s) => [s.key, s.value, round(s.share)]);

describe("Financial Reality pool", () => {
  it.each([
    ["+", 502_000, 99.6, 0.4],
    ["-", 498_000, 100.4, 0.4],
    ["*", 1_000_000_000, 0.05, 0],
    ["/", 250, 200_000, 800],
  ])("Gross Revenue %s Debt", (op, base, grossPct, debtPct) => {
    const p = financialPool(`Price * Units_Sold ${op} Debt`, nums);
    expect(p.base).toBe(base);
    expect(p.gross!.value).toBe(500_000);
    expect(p.debt).toEqual({ key: "Debt", value: 2000, op });
    expect(shares(p)).toEqual([["__gross", 500_000, grossPct], ["Debt", 2000, debtPct]]);
  });

  it("treats a formula without a trailing unit as all gross", () => {
    const p = financialPool("Price * (Units_Sold - Debt)", nums);
    expect(p.base).toBe(-500_000);
    expect(p.debt).toBeNull();
  });

  it("has no base when dividing by zero", () => {
    const p = financialPool("Price * Units_Sold / Debt", { ...nums, Debt: 0 });
    expect(p.base).toBeNull();
    expect(p.items.every((i) => i.share === 0)).toBe(true);
    expect(ringSlices(p)).toEqual([]);
  });
});

describe("Raw Input Share pool", () => {
  it("applies the signs to the typed boxes", () => {
    const p = rawPool("Price * Units_Sold - Debt", nums);
    expect(p.base).toBe(498_000);
    expect(shares(p)).toEqual([["Price", 500, 0.1], ["Units_Sold", 1000, 0.2], ["Debt", 2000, 0.4]]);
    expect(p.items.map((i) => i.op)).toEqual([null, "*", "-"]);
  });

  it("matches the old sum when every sign is plus", () => {
    const p = rawPool("Price + Units_Sold + Debt", nums);
    expect(p.base).toBe(3500);
    expect(shares(p).map((s) => round(s[2] as number))).toEqual([14.29, 28.57, 57.14]);
    expect(ringSlices(p).map((s) => s.key)).toEqual(["Price", "Units_Sold", "Debt"]);
  });

  it("fills the rest of the ring when the shares are under 100%", () => {
    const r = ringSlices(rawPool("Price * Units_Sold - Debt", nums));
    expect(r.at(-1)!.key).toBe("__rest");
    expect(round(r.reduce((a, s) => a + s.value, 0))).toBe(100);
  });
});

describe("splitting formulas", () => {
  it("keeps brackets, unary signs and exponents inside a term", () => {
    expect(splitTerms("a * (b - c) + -d - 1e-5").map((t) => [t.sign, t.src])).toEqual([[1, "a * (b - c)"], [1, "-d"], [-1, "1e-5"]]);
  });

  it("finds the last unit and its sign", () => {
    expect(splitLast("Price * Units_Sold ÷ Debt")).toEqual({ left: "Price * Units_Sold", op: "/", right: "Debt" });
    expect(splitLast("(Price + Units) * -Debt")).toBeNull();
    expect(splitLast("Price - -Debt")).toBeNull();
  });
});
