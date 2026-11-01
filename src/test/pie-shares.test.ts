import { describe, expect, it } from "vitest";
import { financialPool, rawPool, ringSlices, splitLast, splitTerms } from "@/lib/pie-shares";

const round = (n: number) => Number(n.toFixed(2));
const nums = { Price: 500, Units_Sold: 1000, Debt: 2000 };
const shares = (p: ReturnType<typeof rawPool>) => p.items.map((s) => [s.key, s.value, round(s.share)]);

describe("Financial Reality pool", () => {
  it.each([
    ["+", 502_000, 100, 0.4],
    ["-", 498_000, 100, 0.4],
    ["*", 1_000_000_000, 100, 0.4],
    ["/", 250, 100, 0.4],
  ])("Gross Revenue %s Debt", (op, base, grossPct, debtPct) => {
    const p = financialPool(`Price * Units_Sold ${op} Debt`, nums);
    expect(p.base).toBe(base);
    expect(p.gross!.value).toBe(500_000);
    expect(p.debt).toEqual({ key: "Debt", value: 2000, op });
    expect(shares(p)).toEqual([["__gross", 500_000, grossPct], ["Debt", 2000, debtPct]]);
  });

  it("measures Debt out of Gross Revenue, not the typed boxes", () => {
    const big = { Price: 5000, Units_Sold: 1000, Debt: 1000 };
    const p = financialPool("Price * Units_Sold - Debt", big);
    expect(p.base).toBe(4_999_000);
    expect(shares(p)).toEqual([["__gross", 5_000_000, 100], ["Debt", 1000, 0.02]]);
    expect(ringSlices(p).map((s) => [s.key, round(s.value)])).toEqual([["__net", 99.98], ["Debt", 0.02]]);
    // Raw Input Share keeps its own calculation out of 7,000.
    expect(shares(rawPool("Price * Units_Sold - Debt", big)).map((s) => round(s[2] as number))).toEqual([71.43, 14.29, 14.29]);
  });

  it("can show only the net result", () => {
    const p = financialPool("Price * Units_Sold - Debt", { Price: 5000, Units_Sold: 1000, Debt: 1000 }, "net");
    expect(p.base).toBe(4_999_000);
    expect(shares(p)).toEqual([["__net", 4_999_000, 100]]);
    expect(ringSlices(p)).toEqual([{ key: "__net", value: 100 }]);
    expect(p.gross!.value).toBe(5_000_000);
  });

  it("treats a formula without a trailing unit as all gross", () => {
    const p = financialPool("Price * (Units_Sold - Debt)", nums);
    expect(p.base).toBe(-500_000);
    expect(p.debt).toBeNull();
  });

  it("has no base when dividing by zero but still shows the parts", () => {
    const p = financialPool("Price * Units_Sold / Debt", { ...nums, Debt: 0 });
    expect(p.base).toBeNull();
    expect(ringSlices(p)).toEqual([{ key: "__gross", value: 100 }]);
  });
});

describe("Raw Input Share pool", () => {
  it("applies the signs to the typed boxes", () => {
    const p = rawPool("Price * Units_Sold - Debt", nums);
    expect(p.base).toBe(498_000);
    expect(shares(p)).toEqual([["Price", 500, 14.29], ["Units_Sold", 1000, 28.57], ["Debt", 2000, 57.14]]);
    expect(p.items.map((i) => i.op)).toEqual([null, "*", "-"]);
  });

  it("matches the old sum when every sign is plus", () => {
    const p = rawPool("Price + Units_Sold + Debt", nums);
    expect(p.base).toBe(3500);
    expect(shares(p).map((s) => round(s[2] as number))).toEqual([14.29, 28.57, 57.14]);
    expect(ringSlices(p).map((s) => s.key)).toEqual(["Price", "Units_Sold", "Debt"]);
  });

  it("splits the ring between only the units set, adding up to 100%", () => {
    const big = { Price: 5000, Units_Sold: 1000, Debt: 1_000_000 };
    const p = rawPool("Price * Units_Sold - Debt", big);
    expect(p.base).toBe(4_000_000);
    const r = ringSlices(p);
    expect(r.map((s) => s.key)).toEqual(["Price", "Units_Sold", "Debt"]);
    expect(r.map((s) => round(s.value))).toEqual([0.5, 0.1, 99.4]);
    expect(round(r.reduce((a, s) => a + s.value, 0))).toBe(100);
  });

  it("leaves the ring empty until something is typed", () => {
    expect(ringSlices(rawPool("Price * Units_Sold - Debt", { Price: 0, Units_Sold: 0, Debt: 0 }))).toEqual([]);
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
