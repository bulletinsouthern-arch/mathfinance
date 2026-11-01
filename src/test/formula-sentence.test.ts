import { describe, expect, it } from "vitest";
import { formulaSentence, sentenceText, type SentenceContext } from "@/lib/formula-sentence";
import { financialPool, rawPool } from "@/lib/pie-shares";

const labels: Record<string, string> = { Price: "Price per Unit", Units_Sold: "Units Sold", Debt: "Debt", Cost: "Cost" };
const peso = (n: number) => `₱${n.toLocaleString("en-US")}`;
const nums = { Price: 500, Units_Sold: 1000, Debt: 2000, Cost: 100 };
const ctx = (outputLabel = "Revenue"): SentenceContext => ({
  label: (k) => labels[k] ?? k,
  value: (k) => (k === "Units_Sold" ? (nums as Record<string, number>)[k]!.toLocaleString("en-US") : peso((nums as Record<string, number>)[k]!)),
  money: peso,
  outputLabel,
});
const fin = (expr: string, label?: string) => formulaSentence(expr, financialPool(expr, nums), ctx(label));
const raw = (expr: string) => formulaSentence(expr, rawPool(expr, nums), ctx());

describe("formula sentence", () => {
  it("reads a minus debt as standard accounting", () => {
    const s = fin("Price * Units_Sold - Debt");
    expect(sentenceText(s)).toBe("Gross Revenue (₱500,000) MINUS Debt (₱2,000) = ₱498,000 Net Revenue (Total Pool Base).");
    expect(s.debtSign).toBe("-");
    expect(s.terms["__gross"]!.full).toBe("Gross Revenue (Price per Unit × Units Sold)");
    expect(s.terms["Debt"]!.full).toBe("Less: Debt");
  });

  it("uses the same base as the pool for every sign", () => {
    expect(sentenceText(fin("Price * Units_Sold + Debt"))).toBe("Gross Revenue (₱500,000) PLUS Debt (₱2,000) = ₱502,000 Total Pool Base.");
    expect(sentenceText(fin("Price * Units_Sold * Debt"))).toBe("Gross Revenue (₱500,000) TIMES Debt (₱2,000) = ₱1,000,000,000 Total Pool Base.");
    expect(sentenceText(fin("Price * Units_Sold / Debt"))).toBe("Gross Revenue (₱500,000) DIVIDED BY Debt (₱2,000) = ₱250 Total Pool Base.");
    expect(fin("Price * Units_Sold + Debt").terms["Debt"]!.short).toBe("Add: Debt");
    expect(fin("Price * Units_Sold / Debt").terms["Debt"]!.short).toBe("Divided by: Debt");
  });

  it("reads the raw boxes word by word in Raw Input Share", () => {
    const s = raw("Price * Units_Sold - Debt");
    expect(sentenceText(s)).toBe("Price per Unit (₱500) TIMES Units Sold (1,000) MINUS Debt (₱2,000) = ₱498,000 Total Pool Base.");
    expect(s.terms["Debt"]!.short).toBe("Less: Debt");
    expect(sentenceText(raw("Price / Units_Sold"))).toBe("Price per Unit (₱500) DIVIDED BY Units Sold (1,000) = ₱0.5 Total Pool Base.");
  });

  it("does not call a cost formula gross revenue", () => {
    const s = fin("Cost * Units_Sold - Debt", "Total cost");
    expect(sentenceText(s)).toBe("Cost × Units Sold (₱100,000) MINUS Debt (₱2,000) = ₱98,000 Total Pool Base.");
  });

  it("leaves out the answer when it cannot be worked out", () => {
    const expr = "Price / Units_Sold";
    const s = formulaSentence(expr, rawPool(expr, { ...nums, Units_Sold: 0 }), ctx());
    expect(sentenceText(s)).toBe("Price per Unit (₱500) DIVIDED BY Units Sold (1,000).");
  });
});
